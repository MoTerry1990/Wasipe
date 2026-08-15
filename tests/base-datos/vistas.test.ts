import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { levantarBanco, sembrar, AVISOS, type Banco } from './banco';

/**
 * Las vistas que alimentan la portada.
 *
 * Lo importante acá no es solo que devuelvan filas, sino que respeten la
 * RLS: una vista mal declarada se convierte en una puerta trasera al
 * listado completo, borradores incluidos.
 */

let banco: Banco;

beforeAll(async () => {
  banco = await levantarBanco();
  await sembrar(banco);
}, 180_000);

afterAll(async () => {
  await banco?.cerrar();
});

describe('bajaron de precio', () => {
  it('encuentra el aviso que bajó de US$ 208,000 a US$ 195,000', async () => {
    const { rows } = await banco.db.query<{ property_id: string; drop_pct: string }>(
      `select property_id, drop_pct from public.listings_price_drops`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.property_id).toBe(AVISOS.miraflores);
    // (208000 - 195000) / 208000 = 6.25%
    expect(Number(rows[0]?.drop_pct)).toBeCloseTo(6.3, 1);
  });

  it('no cuenta como rebaja un simple cambio de moneda', async () => {
    // El aviso de Jesús María está en soles y nunca bajó: si la vista
    // comparara `price` contra `price` en vez de la referencia en
    // dólares, aparecería acá.
    const { rows } = await banco.db.query<{ property_id: string }>(
      `select property_id from public.listings_price_drops where property_id = $1`,
      [AVISOS.jesusMaria],
    );
    expect(rows).toHaveLength(0);
  });

  it('un visitante sin sesión ve las rebajas de los avisos publicados', async () => {
    const filas = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(`select property_id from public.listings_price_drops`);
      return rows;
    });
    expect(filas).toHaveLength(1);
  });

  it('la vista no filtra avisos en borrador', async () => {
    // Se le agrega historial al borrador. No tiene que salir por ningún lado.
    await banco.db.query(
      `insert into public.price_history (property_id, price, currency, price_usd, changed_at)
       values ($1, 200000, 'USD', 200000, now() - interval '10 days')`,
      [AVISOS.borrador],
    );

    const { rows } = await banco.db.query(
      `select property_id from public.listings_price_drops where property_id = $1`,
      [AVISOS.borrador],
    );
    expect(rows).toHaveLength(0);
  });
});

describe('índice de precio por m²', () => {
  it('agrupa por distrito y operación', async () => {
    const { rows } = await banco.db.query<{
      district: string;
      operation: string;
      listings: number;
      median_usd_per_m2: string;
    }>(
      `select district, operation, listings, median_usd_per_m2
         from public.district_price_index
        where operation = 'sale'
        order by district`,
    );

    expect(rows.length).toBeGreaterThan(0);
    const miraflores = rows.find((f) => f.district === 'Miraflores');
    expect(miraflores?.listings).toBe(1);
    // US$ 195,000 / 92 m² = US$ 2,119.57
    expect(Number(miraflores?.median_usd_per_m2)).toBeCloseTo(2119.57, 2);
  });

  it('siempre trae la cantidad de avisos junto al promedio', async () => {
    // Un promedio sin su tamaño de muestra es una forma de mentir.
    const { rows } = await banco.db.query<{ listings: number }>(
      `select listings from public.district_price_index`,
    );
    for (const fila of rows) {
      expect(fila.listings).toBeGreaterThan(0);
    }
  });

  it('no mezcla venta con alquiler', async () => {
    const { rows } = await banco.db.query<{ operation: string; district: string }>(
      `select operation, district from public.district_price_index where district = 'Jesús María'`,
    );
    // El de Jesús María es un alquiler: no puede aparecer como venta.
    expect(rows.map((f) => f.operation)).toEqual(['rent']);
  });

  it('deja fuera los avisos sin precio por m²', async () => {
    const { rows } = await banco.db.query<{ n: number }>(
      `select count(*)::int as n from public.district_price_index
        where median_usd_per_m2 is null`,
    );
    expect(rows[0]?.n).toBe(0);
  });
});

describe('distritos populares', () => {
  it('cuenta los avisos publicados de cada distrito', async () => {
    const { rows } = await banco.db.query<{
      district: string;
      listings: number;
      for_sale: number;
      for_rent: number;
    }>(
      `select district, listings, for_sale, for_rent from public.popular_districts order by district`,
    );

    expect(rows.length).toBeGreaterThan(0);

    const total = rows.reduce((suma, fila) => suma + fila.listings, 0);
    // Los siete publicados de la semilla; el borrador queda afuera.
    expect(total).toBe(7);

    const jesusMaria = rows.find((f) => f.district === 'Jesús María');
    expect(jesusMaria?.for_rent).toBe(1);
    expect(jesusMaria?.for_sale).toBe(0);
  });

  it('no incluye el distrito de un aviso en borrador', async () => {
    const { rows } = await banco.db.query(
      `select district from public.popular_districts where district = 'Magdalena del Mar'`,
    );
    expect(rows).toHaveLength(0);
  });

  it('un visitante sin sesión ve los mismos conteos', async () => {
    const filas = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query<{ listings: number }>(
        `select listings from public.popular_districts`,
      );
      return rows;
    });
    const total = filas.reduce((suma, fila) => suma + fila.listings, 0);
    expect(total).toBe(7);
  });
});
