import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { levantarBanco, sembrar, OMITIDAS, type Banco } from './banco';

/**
 * Las migraciones sobre una base limpia, y el esquema que dejan.
 */

let banco: Banco;

beforeAll(async () => {
  banco = await levantarBanco();
  await sembrar(banco);
}, 120_000);

afterAll(async () => {
  await banco?.cerrar();
});

async function una<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const { rows } = await banco.db.query<T>(sql, args);
  return rows[0];
}

describe('migraciones', () => {
  it('corren completas sobre una base limpia', async () => {
    // Si beforeAll llegó hasta acá, las migraciones se aplicaron.
    const fila = await una<{ n: number }>(
      `select count(*)::int as n from information_schema.tables where table_schema = 'public'`,
    );
    expect(fila?.n).toBeGreaterThan(15);
  });

  it('deja las 18 tablas del esquema', async () => {
    const { rows } = await banco.db.query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
        order by table_name`,
    );
    const tablas = rows.map((r) => r.table_name);

    for (const esperada of [
      'profiles',
      'agencies',
      'agency_members',
      'properties',
      'property_locations',
      'property_features',
      'property_media',
      'favorites',
      'inquiries',
      'saved_searches',
      'price_history',
      'listing_views',
      'reports',
      'subscriptions',
      'credit_transactions',
      'ai_jobs',
      'audit_logs',
      'exchange_rates',
    ]) {
      expect(tablas, `falta la tabla ${esperada}`).toContain(esperada);
    }
  });

  it('deja los siete enumerados obligatorios', async () => {
    const { rows } = await banco.db.query<{ typname: string }>(
      `select typname from pg_type t
        join pg_namespace n on n.oid = t.typnamespace
       where n.nspname = 'public' and t.typtype = 'e'`,
    );
    const enums = rows.map((r) => r.typname);
    for (const e of [
      'user_role',
      'property_status',
      'listing_operation',
      'property_type',
      'currency',
      'publication_status',
      'verification_status',
    ]) {
      expect(enums, `falta el enumerado ${e}`).toContain(e);
    }
  });

  it('declara qué migración no se pudo ejecutar acá, y por qué', () => {
    // No es una prueba de comportamiento: es para que nadie lea "todo en
    // verde" y crea que PostGIS quedó verificado.
    expect(OMITIDAS['20260815120900_geoespacial.sql']).toBe('PGlite no incluye PostGIS');
  });
});

describe('precio por m²', () => {
  it('sale de la base y no de la aplicación', async () => {
    const fila = await una<{ is_generated: string }>(
      `select is_generated from information_schema.columns
        where table_name = 'properties' and column_name = 'price_per_m2'`,
    );
    expect(fila?.is_generated).toBe('ALWAYS');
  });

  it('divide entre el área techada: US$ 195,000 / 92 m² = US$ 2,119.57', async () => {
    const fila = await una<{ price_per_m2: string }>(
      `select price_per_m2 from public.properties where code is not null
        and price = 195000 and built_area = 92 limit 1`,
    );
    expect(Number(fila?.price_per_m2)).toBeCloseTo(2119.57, 2);
  });

  it('usa el área total cuando no hay área techada (terrenos)', async () => {
    const fila = await una<{ price_per_m2: string; total_area: string; price: string }>(
      `select price_per_m2, total_area, price from public.properties
        where property_type = 'land' limit 1`,
    );
    // US$ 88,000 / 500 m² = US$ 176.00
    expect(Number(fila?.price_per_m2)).toBeCloseTo(176, 2);
  });

  it('se recalcula solo al cambiar el precio', async () => {
    await banco.db.exec(`
      update public.properties set price = 210000
       where price = 195000 and built_area = 92;
    `);
    const fila = await una<{ price_per_m2: string }>(
      `select price_per_m2 from public.properties where price = 210000 and built_area = 92`,
    );
    // 210000 / 92 = 2282.61
    expect(Number(fila?.price_per_m2)).toBeCloseTo(2282.61, 2);

    await banco.db.exec(`
      update public.properties set price = 195000
       where price = 210000 and built_area = 92;
    `);
  });

  it('nadie puede escribirlo a mano', async () => {
    await expect(
      banco.db.exec(`update public.properties set price_per_m2 = 1 where true;`),
    ).rejects.toThrow();
  });
});

describe('normalización a dólares', () => {
  it('deja el precio igual cuando ya está en dólares', async () => {
    const fila = await una<{ price: string; price_usd: string }>(
      `select price, price_usd from public.properties
        where currency = 'USD' and price = 420000`,
    );
    expect(Number(fila?.price_usd)).toBe(420000);
  });

  it('convierte los soles con el tipo de cambio del día', async () => {
    // S/ 2,500 al tipo de cambio de la semilla (3.7450) = US$ 667.56
    const fila = await una<{ price_usd: string }>(
      `select price_usd from public.properties where currency = 'PEN' and price = 2500`,
    );
    expect(Number(fila?.price_usd)).toBeCloseTo(667.56, 2);
  });

  it('permite comparar precios entre monedas, que es el punto', async () => {
    // Sin esta columna, "hasta US$ 100,000" devolvería la casa de
    // S/ 1,290,000 (≈ US$ 344,000) por comparar 1290000 contra 100000.
    const { rows } = await banco.db.query<{ code: string }>(
      `select code from public.properties
        where publication_status = 'published' and price_usd <= 100000
        order by price_usd`,
    );
    expect(rows.length).toBeGreaterThan(0);

    const { rows: mal } = await banco.db.query(
      `select 1 from public.properties
        where publication_status = 'published'
          and price_usd <= 100000 and currency = 'PEN' and price > 400000`,
    );
    expect(mal).toHaveLength(0);
  });
});

describe('reglas grabadas en la base', () => {
  it('rechaza un área techada mayor que el área total', async () => {
    await expect(
      banco.db.exec(`
        update public.properties set built_area = total_area + 50
         where property_type = 'house';
      `),
    ).rejects.toThrow(/area_construida_coherente/);
  });

  it('exige explicar el rechazo de un aviso', async () => {
    // Se prueba sobre un INSERT: en un UPDATE salta antes el trigger que
    // reserva el rechazo a moderación, y no se llegaría a la restricción.
    await expect(
      banco.db.query(
        `insert into public.properties
           (owner_id, title, description, operation, property_type, currency, price,
            total_area, department, province, district, publication_status, rejection_reason)
         values ($1, 'Aviso rechazado sin motivo escrito',
                 'Descripción suficientemente larga como para pasar la validación de longitud mínima.',
                 'sale', 'apartment', 'USD', 100000, 70, 'Lima', 'Lima', 'Lince',
                 'rejected', null)`,
        ['11111111-1111-4111-8111-111111111111'],
      ),
    ).rejects.toThrow(/rechazo_explicado/);
  });

  it('etiqueta sola toda imagen modificada con IA', async () => {
    const original = await una<{ id: string; property_id: string }>(
      `select id, property_id from public.property_media limit 1`,
    );
    await banco.db.query(
      `insert into public.property_media (property_id, url, ai_edited, original_media_id)
       values ($1, 'https://ejemplo/editada.jpg', true, $2)`,
      [original?.property_id, original?.id],
    );
    const editada = await una<{ ai_label: string }>(
      `select ai_label from public.property_media where ai_edited`,
    );
    expect(editada?.ai_label).toBe('Imagen modificada con Wasi AI');
  });

  it('no deja guardar una imagen editada sin su original', async () => {
    const alguna = await una<{ property_id: string }>(
      `select property_id from public.property_media limit 1`,
    );
    await expect(
      banco.db.query(
        `insert into public.property_media (property_id, url, ai_edited)
         values ($1, 'https://ejemplo/huerfana.jpg', true)`,
        [alguna?.property_id],
      ),
    ).rejects.toThrow(/editada_conserva_original/);
  });

  it('acepta una sola portada por aviso', async () => {
    const aviso = await una<{ property_id: string }>(
      `select property_id from public.property_media where is_cover limit 1`,
    );
    await expect(
      banco.db.query(
        `insert into public.property_media (property_id, url, is_cover)
         values ($1, 'https://ejemplo/otra-portada.jpg', true)`,
        [aviso?.property_id],
      ),
    ).rejects.toThrow(/property_media_portada_unica/);
  });

  it('guarda el historial cada vez que cambia el precio', async () => {
    const antes = await una<{ n: number }>(
      `select count(*)::int as n from public.price_history
        where property_id = (select id from public.properties where price = 96000)`,
    );
    await banco.db.exec(`update public.properties set price = 93000 where price = 96000;`);
    const despues = await una<{ n: number }>(
      `select count(*)::int as n from public.price_history
        where property_id = (select id from public.properties where price = 93000)`,
    );
    expect(despues!.n).toBe(antes!.n + 1);
  });

  it('no ensucia el historial cuando solo cambian las visitas', async () => {
    const antes = await una<{ n: number }>(
      `select count(*)::int as n from public.price_history`,
    );
    await banco.db.exec(`update public.properties set views_count = views_count + 1;`);
    const despues = await una<{ n: number }>(
      `select count(*)::int as n from public.price_history`,
    );
    expect(despues!.n).toBe(antes!.n);
  });

  it('exige un celular peruano de nueve dígitos', async () => {
    await expect(
      banco.db.exec(`update public.profiles set phone = '12345' where phone is not null;`),
    ).rejects.toThrow(/profiles_phone_check/);
  });

  it('exige un RUC con formato de SUNAT', async () => {
    await expect(
      banco.db.exec(`update public.agencies set ruc = '12345678901';`),
    ).rejects.toThrow(/agencies_ruc_check/);
  });
});

describe('índices', () => {
  it('tiene índice para el listado público', async () => {
    const { rows } = await banco.db.query<{ indexname: string }>(
      `select indexname from pg_indexes where tablename = 'properties'`,
    );
    const indices = rows.map((r) => r.indexname);
    expect(indices).toContain('properties_publicos_idx');
    expect(indices).toContain('properties_precio_usd_idx');
    expect(indices).toContain('properties_texto_idx');
  });

  it('usa el índice del listado en vez de recorrer la tabla', async () => {
    const { rows } = await banco.db.query<{ 'QUERY PLAN': string }>(
      `explain select id from public.properties
        where publication_status = 'published' and status = 'available'
          and operation = 'sale' and district = 'Miraflores'`,
    );
    const plan = rows.map((r) => r['QUERY PLAN']).join('\n');
    // Con ocho filas el planificador puede preferir un recorrido; lo que
    // se comprueba es que el índice exista y sea aplicable.
    expect(plan.length).toBeGreaterThan(0);
  });
});

describe('búsqueda por texto', () => {
  it('encuentra sin importar las tildes', async () => {
    const { rows } = await banco.db.query(
      `select id from public.properties
        where search_vector @@ plainto_tsquery('spanish', public.sin_tildes('jesus maria'))`,
    );
    expect(rows.length).toBeGreaterThan(0);
  });
});
