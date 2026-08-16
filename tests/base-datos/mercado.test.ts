import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { levantarBanco, sembrar, CUENTAS, AVISOS, type Banco } from './banco';

/**
 * El índice de mercado contra la base de verdad.
 *
 * Cuatro promesas se comprueban acá: que solo entran avisos publicados y
 * disponibles, que los atípicos quedan fuera, que debajo de la muestra
 * mínima no se publica cifra, y que cada cambio de precio queda guardado
 * aunque quien publica intente borrarlo.
 */

let banco: Banco;

async function recalcular(): Promise<number> {
  return banco.comoServicio(async (db) => {
    const { rows } = await db.query<{ recalcular_mercado: number }>(
      `select public.recalcular_mercado()`,
    );
    return Number(rows[0]?.recalcular_mercado ?? 0);
  });
}

async function fila(distrito: string, operacion = 'sale', tipo: string | null = null) {
  const { rows } = await banco.db.query<{
    listings: number;
    median_usd_per_m2: string | null;
    outliers: number;
    sufficient: boolean;
    pen_per_usd: string;
    computed_at: string;
  }>(
    `select listings, median_usd_per_m2, outliers, sufficient, pen_per_usd, computed_at
       from public.market_stats
      where district = $1 and operation = $2 and period = 'm12'
        and property_type is not distinct from $3::public.property_type`,
    [distrito, operacion, tipo],
  );
  return rows[0] ?? null;
}

/** Un aviso publicado y disponible, con el precio por m² que se le pida. */
async function sembrarAviso(precioPorM2: number, sufijo: string, distrito = 'Barranco') {
  const area = 100;
  await banco.db.query(
    `insert into public.properties
       (owner_id, title, description, operation, property_type, currency, price,
        total_area, department, province, district, publication_status, status, published_at)
     values ($1, $2, $3, 'sale', 'apartment', 'USD', $4, $5,
             'Lima', 'Lima', $6, 'published', 'available', now())`,
    [
      CUENTAS.rosa,
      `Departamento de prueba ${sufijo}`,
      'Descripción de prueba con largo suficiente para pasar la validación de la base.',
      precioPorM2 * area,
      area,
      distrito,
    ],
  );
}

beforeAll(async () => {
  banco = await levantarBanco();
  await sembrar(banco);
}, 180_000);

afterAll(async () => {
  await banco?.cerrar();
});

// ---------------------------------------------------------------------
// Qué entra al cálculo
// ---------------------------------------------------------------------

describe('qué avisos entran al índice', () => {
  it('recalcular deja filas', async () => {
    expect(await recalcular()).toBeGreaterThan(0);
  });

  it('un aviso rechazado no entra', async () => {
    // Seis avisos parejos: alcanza para la muestra mínima.
    for (let i = 0; i < 6; i++) await sembrarAviso(2000, `r${i}`, 'Chorrillos');
    await recalcular();
    const antes = await fila('Chorrillos');
    expect(antes?.listings).toBe(6);

    // Rechazar lo hace moderación: el disparador del sprint 8 no deja que
    // nadie más lo haga, ni siquiera desde una consulta directa.
    await banco.comoUsuario(CUENTAS.moderacion, (db) =>
      db.query(
        `update public.properties set publication_status = 'rejected',
                rejection_reason = 'El motivo de prueba, con largo suficiente'
          where district = 'Chorrillos' and title like 'Departamento de prueba r0%'`,
      ),
    );
    await recalcular();

    expect((await fila('Chorrillos'))?.listings).toBe(5);
  });

  it('ni uno pausado, vencido o archivado', async () => {
    for (const estado of ['paused', 'expired', 'archived'] as const) {
      await banco.db.query(
        `update public.properties set publication_status = $1::public.publication_status
          where district = 'Chorrillos' and title like 'Departamento de prueba r1%'`,
        [estado],
      );
      await recalcular();
      expect((await fila('Chorrillos'))?.listings, estado).toBe(4);

      // Volver a publicar desde 'expired' lo hace moderación: el
      // disparador no deja que un aviso vencido se reactive solo.
      await banco.comoUsuario(CUENTAS.moderacion, (db) =>
        db.query(
          `update public.properties set publication_status = 'published'
            where district = 'Chorrillos' and title like 'Departamento de prueba r1%'`,
        ),
      );
    }
  });

  it('ni uno vendido: el mercado de hoy es lo que se puede comprar hoy', async () => {
    await banco.db.query(
      `update public.properties set status = 'sold'
        where district = 'Chorrillos' and title like 'Departamento de prueba r2%'`,
    );
    await recalcular();
    expect((await fila('Chorrillos'))?.listings).toBe(4);

    await banco.db.query(
      `update public.properties set status = 'available'
        where district = 'Chorrillos' and title like 'Departamento de prueba r2%'`,
    );
    await recalcular();
  });
});

// ---------------------------------------------------------------------
// Atípicos
// ---------------------------------------------------------------------

describe('los atípicos', () => {
  it('un aviso con un cero de más queda fuera y se cuenta', async () => {
    for (let i = 0; i < 8; i++) await sembrarAviso(2000 + i * 20, `a${i}`, 'Surquillo');
    await recalcular();

    const limpio = await fila('Surquillo');
    expect(limpio?.listings).toBe(8);
    expect(limpio?.outliers).toBe(0);

    // Un cero de más: 20 000 por m² en vez de 2 000.
    await sembrarAviso(20_000, 'atipico', 'Surquillo');
    await recalcular();

    const conAtipico = await fila('Surquillo');
    // El atípico no entra al promedio, pero se dice que quedó uno fuera.
    expect(conAtipico?.listings).toBe(8);
    expect(conAtipico?.outliers).toBe(1);
  });

  it('y la mediana casi no se mueve, que es de lo que se trata', async () => {
    const conAtipico = await fila('Surquillo');
    expect(Number(conAtipico?.median_usd_per_m2)).toBeGreaterThan(2000);
    expect(Number(conAtipico?.median_usd_per_m2)).toBeLessThan(2200);
  });
});

// ---------------------------------------------------------------------
// Muestra mínima
// ---------------------------------------------------------------------

describe('la muestra mínima', () => {
  it('con menos de cinco avisos no se publica cifra', async () => {
    for (let i = 0; i < 3; i++) await sembrarAviso(1800, `p${i}`, 'Pueblo Libre');
    await recalcular();

    const pocos = await fila('Pueblo Libre');
    expect(pocos?.listings).toBe(3);
    // La fila existe —para poder decir cuántos hay— pero no se publica.
    expect(pocos?.sufficient).toBe(false);
  });

  it('al llegar a cinco sí', async () => {
    for (let i = 3; i < 6; i++) await sembrarAviso(1800, `p${i}`, 'Pueblo Libre');
    await recalcular();

    const suficientes = await fila('Pueblo Libre');
    expect(suficientes?.listings).toBe(6);
    expect(suficientes?.sufficient).toBe(true);
  });

  it('la muestra mínima de la base es cinco', async () => {
    const { rows } = await banco.db.query<{ muestra_minima: number }>(
      `select public.muestra_minima()`,
    );
    expect(Number(rows[0]?.muestra_minima)).toBe(5);
  });
});

// ---------------------------------------------------------------------
// Cortes y trazabilidad
// ---------------------------------------------------------------------

describe('los cortes', () => {
  it('se calcula por tipo y también el total del distrito', async () => {
    expect(await fila('Pueblo Libre', 'sale', null)).not.toBeNull();
    expect(await fila('Pueblo Libre', 'sale', 'apartment')).not.toBeNull();
  });

  it('venta y alquiler se calculan por separado', async () => {
    const { rows } = await banco.db.query<{ operation: string }>(
      `select distinct operation from public.market_stats`,
    );
    expect(rows.map((r) => r.operation).sort()).toContain('sale');
  });

  it('están los cuatro períodos', async () => {
    const { rows } = await banco.db.query<{ period: string }>(
      `select distinct period from public.market_stats order by period`,
    );
    const periodos = rows.map((r) => r.period);
    expect(periodos).toContain('m3');
    expect(periodos).toContain('todo');
  });

  it('cada fila dice con qué tipo de cambio se normalizó y cuándo', async () => {
    const f = await fila('Pueblo Libre');
    expect(Number(f?.pen_per_usd)).toBeGreaterThan(0);
    expect(f?.computed_at).toBeTruthy();
  });

  it('recalcular queda anotado en la bitácora', async () => {
    const { rows } = await banco.db.query<{ n: string }>(
      `select count(*) as n from public.audit_logs where action = 'recalcular_mercado'`,
    );
    expect(Number(rows[0]!.n)).toBeGreaterThan(0);
  });

  it('el índice es público: es el diferenciador del producto', async () => {
    const visibles = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(`select district from public.market_stats limit 5`);
      return rows;
    });
    expect(visibles.length).toBeGreaterThan(0);
  });

  it('pero nadie lo puede escribir desde el navegador', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(
          `insert into public.market_stats
             (department, province, district, operation, period, listings, pen_per_usd)
           values ('Lima', 'Lima', 'Inventado', 'sale', 'm12', 999, 3.75)`,
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

// ---------------------------------------------------------------------
// Comparables
// ---------------------------------------------------------------------

describe('los comparables', () => {
  it('son del mismo distrito, tipo y operación, con área parecida', async () => {
    const { rows: yo } = await banco.db.query<{ id: string }>(
      `select id from public.properties
        where district = 'Surquillo' and publication_status = 'published' limit 1`,
    );

    const comparables = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query<{ district: string; total_area: string }>(
        `select * from public.comparables_de($1, 8)`,
        [yo[0]!.id],
      );
      return rows;
    });

    expect(comparables.length).toBeGreaterThan(0);
    for (const c of comparables) expect(c.district).toBe('Surquillo');
  });

  it('no se incluye a sí mismo', async () => {
    const { rows: yo } = await banco.db.query<{ id: string }>(
      `select id from public.properties
        where district = 'Surquillo' and publication_status = 'published' limit 1`,
    );

    const ids = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query<{ id: string }>(
        `select id from public.comparables_de($1, 20)`,
        [yo[0]!.id],
      );
      return rows.map((r) => r.id);
    });
    expect(ids).not.toContain(yo[0]!.id);
  });

  it('un aviso sin publicar no aparece entre los comparables', async () => {
    const { rows: yo } = await banco.db.query<{ id: string }>(
      `select id from public.properties
        where district = 'Surquillo' and publication_status = 'published' limit 1`,
    );

    const ids = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query<{ id: string }>(
        `select id from public.comparables_de($1, 30)`,
        [yo[0]!.id],
      );
      return rows.map((r) => r.id);
    });
    expect(ids).not.toContain(AVISOS.borrador);
  });
});

// ---------------------------------------------------------------------
// Historial de precios
// ---------------------------------------------------------------------

describe('el historial de precios', () => {
  it('cada cambio queda guardado', async () => {
    const antes = await banco.db.query<{ n: string }>(
      `select count(*) as n from public.price_history where property_id = $1`,
      [AVISOS.miraflores],
    );

    await banco.db.query(`update public.properties set price = price - 5000 where id = $1`, [
      AVISOS.miraflores,
    ]);

    const despues = await banco.db.query<{ n: string }>(
      `select count(*) as n from public.price_history where property_id = $1`,
      [AVISOS.miraflores],
    );
    expect(Number(despues.rows[0]!.n)).toBe(Number(antes.rows[0]!.n) + 1);
  });

  it('un cambio que no toca el precio no ensucia el historial', async () => {
    const antes = await banco.db.query<{ n: string }>(
      `select count(*) as n from public.price_history where property_id = $1`,
      [AVISOS.miraflores],
    );

    await banco.db.query(
      `update public.properties set views_count = views_count + 1 where id = $1`,
      [AVISOS.miraflores],
    );

    const despues = await banco.db.query<{ n: string }>(
      `select count(*) as n from public.price_history where property_id = $1`,
      [AVISOS.miraflores],
    );
    expect(despues.rows[0]!.n).toBe(antes.rows[0]!.n);
  });

  it('quien publica no puede borrar su historial de precios', async () => {
    const resultado = await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`delete from public.price_history where property_id = $1`, [AVISOS.miraflores]),
    );
    expect(resultado.affectedRows ?? 0).toBe(0);
  });

  it('ni reescribirlo', async () => {
    const resultado = await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`update public.price_history set price = 1 where property_id = $1`, [
        AVISOS.miraflores,
      ]),
    );
    expect(resultado.affectedRows ?? 0).toBe(0);
  });
});
