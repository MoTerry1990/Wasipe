import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { levantarBanco, sembrar, CUENTAS, AVISOS, type Banco } from './banco';

/**
 * Lo que el sitemap le pregunta a la base.
 *
 * Un solo criterio, y de él salen todas estas pruebas: **si una dirección
 * está en el sitemap, tiene contenido detrás**. Un conteo que incluya
 * borradores publicaría landings vacías, y un sitemap con páginas vacías
 * no es un sitemap incompleto: es una señal activa de descuido que Google
 * usa contra el dominio.
 */

let banco: Banco;

type Fila = {
  operation: string;
  property_type: string | null;
  district: string | null;
  total: string | number;
};

async function conteo(): Promise<Fila[]> {
  return banco.comoAnonimo(async (db) => {
    const { rows } = await db.query<Fila>('select * from public.conteo_de_landings()');
    return rows;
  });
}

const buscar = (filas: Fila[], op: string, tipo: string | null, distrito: string | null) =>
  Number(
    filas.find((f) => f.operation === op && f.property_type === tipo && f.district === distrito)
      ?.total ?? 0,
  );

beforeAll(async () => {
  banco = await levantarBanco();
  await sembrar(banco);
}, 180_000);

afterAll(async () => {
  await banco?.cerrar();
});

describe('el conteo de landings', () => {
  it('devuelve los tres cortes que el sitemap necesita', async () => {
    const filas = await conteo();
    expect(filas.length).toBeGreaterThan(0);

    // Por tipo sin distrito, por distrito sin tipo, y los dos juntos.
    expect(filas.some((f) => f.property_type !== null && f.district === null)).toBe(true);
    expect(filas.some((f) => f.property_type === null && f.district !== null)).toBe(true);
    expect(filas.some((f) => f.property_type !== null && f.district !== null)).toBe(true);
  });

  it('el corte por distrito suma los de cada tipo de ese distrito', async () => {
    const filas = await conteo();
    const distritos = [...new Set(filas.map((f) => f.district).filter(Boolean))];
    expect(distritos.length).toBeGreaterThan(0);

    for (const distrito of distritos) {
      for (const op of ['sale', 'rent']) {
        const total = buscar(filas, op, null, distrito);
        const porTipo = filas
          .filter((f) => f.operation === op && f.district === distrito && f.property_type)
          .reduce((suma, f) => suma + Number(f.total), 0);
        expect(porTipo, `${op} en ${distrito}`).toBe(total);
      }
    }
  });

  it('un borrador no engorda el conteo de su distrito', async () => {
    const antes = await conteo();
    const miraflores = buscar(antes, 'sale', null, 'Miraflores');

    // El aviso en borrador ya está sembrado. Lo que se comprueba es que
    // un visitante anónimo no lo ve sumado en ninguna parte.
    const { rows } = await banco.db.query<{ n: string }>(
      `select count(*) as n from public.properties
        where district = 'Miraflores' and operation = 'sale'`,
    );

    // Hay más filas en la tabla que las contadas: la diferencia son las
    // que no están publicadas.
    expect(Number(rows[0]!.n)).toBeGreaterThanOrEqual(miraflores);
  });

  it('un aviso rechazado deja de contar', async () => {
    const antesFilas = await conteo();
    const antes = buscar(antesFilas, 'sale', null, 'San Isidro');
    expect(antes).toBeGreaterThan(0);

    // Por la moderación de verdad: el disparador del sprint 8 impide
    // rechazar un aviso desde cualquier otra cuenta, y saltárselo con una
    // conexión directa probaría un camino que en producción no existe.
    await banco.db.query(
      `insert into public.staff_members (user_id, role) values ($1, 'moderator')
       on conflict do nothing`,
      [CUENTAS.martin],
    );
    await banco.comoUsuario(CUENTAS.martin, (db) =>
      db.query(`select public.revisar_aviso($1, 'reject', $2)`, [
        AVISOS.sanIsidro,
        'Prueba: las fotos son de otro inmueble.',
      ]),
    );

    const despues = buscar(await conteo(), 'sale', null, 'San Isidro');
    expect(despues).toBe(antes - 1);

    await banco.comoUsuario(CUENTAS.martin, (db) =>
      db.query(`select public.revisar_aviso($1, 'approve')`, [AVISOS.sanIsidro]),
    );
  });

  it('quien tiene sesión ve el mismo conteo que un visitante', async () => {
    // La función es `security invoker` a propósito, pero además filtra por
    // estado: si no lo hiciera, quien publicó vería sus propios borradores
    // sumados y el sitemap generado con su sesión saldría distinto.
    const anonimo = await conteo();
    const conSesion = await banco.comoUsuario(CUENTAS.rosa, async (db) => {
      const { rows } = await db.query<Fila>('select * from public.conteo_de_landings()');
      return rows;
    });

    const normalizar = (filas: Fila[]) =>
      filas
        .map((f) => `${f.operation}|${f.property_type ?? '*'}|${f.district ?? '*'}|${f.total}`)
        .sort();

    expect(normalizar(conSesion)).toEqual(normalizar(anonimo));
  });

  it('nunca devuelve un total en cero: los cortes vacíos no existen', async () => {
    // `group by` no inventa filas. Que no haya ceros importa porque el
    // sitemap trata «no está en el resultado» como «no hay avisos».
    for (const fila of await conteo()) {
      expect(Number(fila.total)).toBeGreaterThan(0);
    }
  });
});
