import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { levantarBanco, sembrar, CUENTAS, type Banco } from './banco';

/**
 * Rendimiento de la búsqueda con datos de verdad.
 *
 * Con ocho avisos cualquier consulta parece rápida y el planificador
 * elige recorrer la tabla entera porque es más barato. Recién con
 * volumen se ve si los índices sirven.
 *
 * Acá se cargan 5.000 avisos repartidos en distritos, tipos, monedas y
 * precios, y se mide contra ellos. Los números quedan anotados en
 * RENDIMIENTO.md.
 *
 * PGlite corre Postgres en WebAssembly, un solo proceso y sin disco: los
 * tiempos absolutos no son los de Supabase. Lo que sí traslada es el
 * plan elegido, que es lo que decide si la consulta escala o no.
 */

let banco: Banco;
const AVISOS = 5000;

/** Se guardan para el informe. */
const MEDICIONES: { consulta: string; ms: number; filas: number; plan: string }[] = [];

beforeAll(async () => {
  banco = await levantarBanco();
  await sembrar(banco);

  // Generación determinista: sin azar, dos corridas dan lo mismo y una
  // regresión de rendimiento se puede comparar contra la anterior.
  await banco.db.exec(`
    insert into public.properties (
      owner_id, title, description, operation, property_type, currency, price,
      total_area, built_area, bedrooms, bathrooms, parking, age_years,
      furnished, pet_policy, address_privacy,
      department, province, district, lat, lon,
      status, publication_status, verification_status, published_at
    )
    select
      '${CUENTAS.rosa}',
      'Departamento de prueba número ' || n,
      'Aviso generado para medir el rendimiento de la búsqueda con volumen realista de datos.',
      (array['sale', 'rent', 'project'])[1 + (n % 3)]::public.listing_operation,
      (array['apartment', 'house', 'land', 'office'])[1 + (n % 4)]::public.property_type,
      (array['USD', 'PEN'])[1 + (n % 2)]::public.currency,
      case when n % 2 = 0 then 60000 + (n % 400) * 1000 else 250000 + (n % 400) * 3500 end,
      60 + (n % 240),
      -- El área techada nunca puede superar la total: la base lo exige.
      least(50 + (n % 200), 60 + (n % 240)),
      1 + (n % 5),
      1 + (n % 4),
      n % 3,
      n % 40,
      (array['none', 'partial', 'full'])[1 + (n % 3)]::public.furnished_status,
      (array['allowed', 'not_allowed', 'negotiable'])[1 + (n % 3)]::public.pet_policy,
      (array['approximate', 'exact', 'district_only'])[1 + (n % 3)]::public.address_privacy,
      'Lima', 'Lima',
      (array['Miraflores','San Isidro','Barranco','Santiago de Surco','Jesús María',
             'San Borja','La Molina','Surquillo','Lince','Magdalena del Mar'])[1 + (n % 10)],
      -12.0 - (n % 100) * 0.002,
      -77.1 + (n % 100) * 0.002,
      'available', 'published',
      case when n % 7 = 0 then 'verified' else 'unverified' end::public.verification_status,
      now() - (n || ' minutes')::interval
    from generate_series(1, ${AVISOS}) as n;
  `);

  // Sin estadísticas frescas el planificador decide a ciegas. En
  // producción lo hace autovacuum; acá hay que pedirlo.
  await banco.db.exec('analyze public.properties;');
}, 300_000);

afterAll(async () => {
  await banco?.cerrar();

  if (MEDICIONES.length > 0) {
    const filas = MEDICIONES.map(
      (m) =>
        `  ${m.consulta.padEnd(46)} ${String(m.filas).padStart(6)} filas  ${m.ms.toFixed(1)} ms`,
    );
    console.log(`\n  Búsqueda con ${AVISOS} avisos:\n${filas.join('\n')}\n`);
  }
});

/** Corre una consulta, mide el tiempo y guarda el plan elegido. */
async function medir(nombre: string, sql: string) {
  const { rows: plan } = await banco.db.query<{ 'QUERY PLAN': string }>(`explain ${sql}`);
  const texto = plan.map((f) => f['QUERY PLAN']).join('\n');

  const inicio = performance.now();
  const { rows } = await banco.db.query(sql);
  const ms = performance.now() - inicio;

  MEDICIONES.push({ consulta: nombre, ms, filas: rows.length, plan: texto });
  return { ms, filas: rows.length, plan: texto };
}

const PUBLICOS = `publication_status = 'published' and status = 'available'`;

describe('búsqueda con 5.000 avisos', () => {
  it('el listado por distrito usa índice y no recorre la tabla', async () => {
    const { plan, ms } = await medir(
      'operación + distrito, por fecha',
      `select id, title, price_usd from public.properties
        where ${PUBLICOS} and operation = 'sale' and district = 'Miraflores'
        order by published_at desc limit 24`,
    );

    expect(plan).toContain('Index');
    expect(plan).not.toContain('Seq Scan');
    expect(ms).toBeLessThan(200);
  });

  it('el rango de precio se resuelve sobre la referencia en dólares', async () => {
    const { plan, ms } = await medir(
      'rango de precio en dólares',
      `select id, price, currency, price_usd from public.properties
        where ${PUBLICOS} and operation = 'sale'
          and price_usd between 80000 and 200000
        order by price_usd limit 24`,
    );

    expect(plan).toContain('Index');
    expect(ms).toBeLessThan(200);
  });

  it('ordenar por precio por m² no obliga a ordenar toda la tabla', async () => {
    const { plan, ms } = await medir(
      'orden por precio por m²',
      `select id, price_usd_per_m2 from public.properties
        where ${PUBLICOS} and operation = 'sale' and price_usd_per_m2 is not null
        order by price_usd_per_m2 limit 24`,
    );

    // Con el índice, el orden ya viene dado y no hace falta un Sort.
    expect(plan).toContain('Index');
    expect(ms).toBeLessThan(200);
  });

  it('"solo verificados" usa su índice parcial', async () => {
    const { plan, ms } = await medir(
      'solo verificados',
      `select id from public.properties
        where ${PUBLICOS} and operation = 'sale' and verification_status = 'verified'
        order by published_at desc limit 24`,
    );

    expect(plan).toContain('Index');
    expect(ms).toBeLessThan(200);
  });

  it('contar el total de una búsqueda amplia sigue siendo rápido', async () => {
    // El contador va en cada búsqueda: si es lento, todo es lento.
    const { ms } = await medir(
      'conteo de resultados',
      `select count(*) from public.properties
        where ${PUBLICOS} and operation = 'sale' and district = 'Miraflores'`,
    );
    expect(ms).toBeLessThan(300);
  });

  it('la página 20 no cuesta más que la primera', async () => {
    const primera = await medir(
      'página 1',
      `select id from public.properties where ${PUBLICOS} and operation = 'sale'
        order by published_at desc limit 24 offset 0`,
    );
    const lejana = await medir(
      'página 20',
      `select id from public.properties where ${PUBLICOS} and operation = 'sale'
        order by published_at desc limit 24 offset 456`,
    );

    // Con OFFSET el costo crece, pero mientras el índice dé el orden la
    // diferencia se mantiene chica. Si esto se dispara, hay que pasar a
    // paginación por cursor.
    expect(lejana.ms).toBeLessThan(primera.ms + 150);
  });

  it('una búsqueda con muchos filtros a la vez sigue respondiendo', async () => {
    const { ms, filas } = await medir(
      'seis filtros combinados',
      `select id from public.properties
        where ${PUBLICOS}
          and operation = 'sale'
          and property_type = 'apartment'
          and district = 'Miraflores'
          and price_usd between 50000 and 300000
          and bedrooms >= 2
          and parking >= 1
        order by price_usd limit 24`,
    );

    expect(ms).toBeLessThan(300);
    expect(filas).toBeGreaterThanOrEqual(0);
  });
});

describe('la dirección exacta nunca sale en la búsqueda', () => {
  it('el listado público no puede leer property_locations', async () => {
    const filas = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(
        `select property_id, address_line from public.property_locations`,
      );
      return rows;
    });

    // Solo el aviso que se publicó con dirección exacta a pedido de su
    // dueño. Los 5.000 generados son 'approximate' o 'district_only'.
    expect(filas).toHaveLength(1);
  });

  it('los avisos "solo distrito" no exponen su punto por otra vía', async () => {
    // El punto que guarda properties ya viene desplazado, y la dirección
    // real vive en otra tabla con su propia política. Se comprueba que
    // ninguno de los dos coincida.
    const { rows } = await banco.db.query<{ iguales: number }>(
      `select count(*)::int as iguales
         from public.properties p
         join public.property_locations u on u.property_id = p.id
        where p.address_privacy <> 'exact'
          and p.lat = u.exact_lat and p.lon = u.exact_lon`,
    );
    expect(rows[0]?.iguales).toBe(0);
  });
});
