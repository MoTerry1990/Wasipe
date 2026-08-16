import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { levantarBanco, sembrar, CUENTAS, AVISOS, type Banco } from './banco';

/**
 * Wasi AI contra la base de verdad.
 *
 * Las cuatro promesas del sprint se comprueban acá, no en el código que
 * llama: un trabajo fallido no cobra, un pedido repetido no se procesa
 * dos veces, el navegador no escribe resultados y nada se aplica sin
 * confirmación. Si alguien se salta la aplicación y habla directo con
 * Postgres, se encuentra con las mismas reglas.
 */

let banco: Banco;

/** Ayuda para no repetir la llamada con sus siete parámetros. */
async function pedir(
  usuario: string,
  opciones: {
    operacion: string;
    clave: string;
    costo?: number;
    limite?: number;
    aviso?: string | null;
  },
) {
  return banco.comoUsuario(usuario, async (db) => {
    const { rows } = await db.query<{ id: string; status: string; operation: string }>(
      `select * from public.iniciar_trabajo_ia(
         'listing_draft', $1, '{"a":1}'::jsonb, $2, $3, $4, $5)`,
      [
        opciones.operacion,
        opciones.clave,
        opciones.aviso ?? null,
        opciones.costo ?? 0,
        opciones.limite ?? 30,
      ],
    );
    return rows[0]!;
  });
}

/** Cierra bien un trabajo. Lo hace el servidor, nunca el navegador. */
async function terminar(id: string, costo = 0) {
  return banco.comoServicio(async (db) => {
    const { rows } = await db.query<{ status: string; cost_credits: number }>(
      `select * from public.terminar_trabajo_ia(
         $1, '{"texto":"Departamento de 92 m² en Miraflores"}'::jsonb,
         'anthropic', 'modelo-de-prueba', $2, 1234)`,
      [id, costo],
    );
    return rows[0]!;
  });
}

async function fallar(id: string, motivo = 'el proveedor no respondió') {
  return banco.comoServicio(async (db) => {
    const { rows } = await db.query<{ status: string; cost_credits: number; error: string }>(
      `select * from public.fallar_trabajo_ia($1, $2, 'anthropic', 900)`,
      [id, motivo],
    );
    return rows[0]!;
  });
}

async function saldo(usuario: string): Promise<number> {
  const { rows } = await banco.db.query<{ saldo: number }>(
    `select public.saldo_de_creditos($1) as saldo`,
    [usuario],
  );
  return Number(rows[0]?.saldo ?? 0);
}

beforeAll(async () => {
  banco = await levantarBanco();
  await sembrar(banco);
}, 180_000);

afterAll(async () => {
  await banco?.cerrar();
});

// ---------------------------------------------------------------------
// Abrir el trabajo
// ---------------------------------------------------------------------

describe('pedirle algo a Wasi AI', () => {
  it('deja el trabajo abierto, a nombre de quien lo pidió', async () => {
    const trabajo = await pedir(CUENTAS.rosa, { operacion: 'titulo', clave: 'k-abre' });

    expect(trabajo.status).toBe('running');
    expect(trabajo.operation).toBe('titulo');

    const { rows } = await banco.db.query<{ user_id: string; started_at: string | null }>(
      `select user_id, started_at from public.ai_jobs where id = $1`,
      [trabajo.id],
    );
    expect(rows[0]?.user_id).toBe(CUENTAS.rosa);
    expect(rows[0]?.started_at).not.toBeNull();
  });

  it('un visitante sin sesión no pide nada', async () => {
    await expect(
      banco.comoAnonimo((db) =>
        db.query(
          `select public.iniciar_trabajo_ia('listing_draft', 'titulo', '{}'::jsonb, 'k-anon')`,
        ),
      ),
    ).rejects.toThrow(/Inicia sesión/);
  });

  it('nadie pide sobre el aviso de otra persona', async () => {
    await expect(
      pedir(CUENTAS.lucia, {
        operacion: 'descripcion',
        clave: 'k-ajeno',
        aviso: AVISOS.miraflores,
      }),
    ).rejects.toThrow(/no es tuyo/);
  });
});

// ---------------------------------------------------------------------
// Idempotencia
// ---------------------------------------------------------------------

describe('pedidos repetidos', () => {
  it('el mismo pedido dos veces es un solo trabajo', async () => {
    const primero = await pedir(CUENTAS.rosa, { operacion: 'titulo', clave: 'k-igual' });
    const segundo = await pedir(CUENTAS.rosa, { operacion: 'titulo', clave: 'k-igual' });

    expect(segundo.id).toBe(primero.id);

    const { rows } = await banco.db.query(
      `select id from public.ai_jobs where idempotency_key = 'k-igual'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('y devuelve el resultado ya guardado sin volver a procesarlo', async () => {
    const trabajo = await pedir(CUENTAS.rosa, { operacion: 'titulo', clave: 'k-listo' });
    await terminar(trabajo.id);

    const otraVez = await pedir(CUENTAS.rosa, { operacion: 'titulo', clave: 'k-listo' });
    expect(otraVez.id).toBe(trabajo.id);
    expect(otraVez.status).toBe('succeeded');
  });

  it('la misma clave de otra persona sí es otro trabajo', async () => {
    const deRosa = await pedir(CUENTAS.rosa, { operacion: 'titulo', clave: 'k-compartida' });
    const deMartin = await pedir(CUENTAS.martin, {
      operacion: 'titulo',
      clave: 'k-compartida',
    });
    expect(deMartin.id).not.toBe(deRosa.id);
  });
});

// ---------------------------------------------------------------------
// Límite de uso
// ---------------------------------------------------------------------

describe('límite de pedidos por hora', () => {
  it('corta cuando se pasa, y lo dice en castellano', async () => {
    await pedir(CUENTAS.lucia, { operacion: 'titulo', clave: 'l-1', limite: 2 });
    await pedir(CUENTAS.lucia, { operacion: 'titulo', clave: 'l-2', limite: 2 });

    await expect(
      pedir(CUENTAS.lucia, { operacion: 'titulo', clave: 'l-3', limite: 2 }),
    ).rejects.toThrow(/límite de pedidos a Wasi AI por hora/);
  });

  it('el cupo es de cada persona, no de todas juntas', async () => {
    const otro = await pedir(CUENTAS.martin, { operacion: 'titulo', clave: 'l-otro' });
    expect(otro.status).toBe('running');
  });
});

// ---------------------------------------------------------------------
// Créditos
// ---------------------------------------------------------------------

describe('los créditos', () => {
  it('un trabajo que falla no cobra ni uno', async () => {
    const antes = await saldo(CUENTAS.rosa);
    const trabajo = await pedir(CUENTAS.rosa, { operacion: 'descripcion', clave: 'c-falla' });

    const cerrado = await fallar(trabajo.id);
    expect(cerrado.status).toBe('failed');
    expect(cerrado.cost_credits).toBe(0);
    expect(cerrado.error).toContain('no respondió');
    expect(await saldo(CUENTAS.rosa)).toBe(antes);

    const { rows } = await banco.db.query(
      `select id from public.credit_transactions where user_id = $1`,
      [CUENTAS.rosa],
    );
    expect(rows).toHaveLength(0);
  });

  it('sin saldo no se abre un trabajo que cuesta', async () => {
    await expect(
      pedir(CUENTAS.martin, { operacion: 'descripcion', clave: 'c-sin-saldo', costo: 5 }),
    ).rejects.toThrow(/No te alcanzan los créditos/);
  });

  it('con saldo se cobra recién al terminar bien', async () => {
    await banco.db.query(
      `insert into public.credit_transactions (user_id, amount, balance_after, reason)
       values ($1, 10, 10, 'carga de prueba')`,
      [CUENTAS.martin],
    );
    expect(await saldo(CUENTAS.martin)).toBe(10);

    const trabajo = await pedir(CUENTAS.martin, {
      operacion: 'descripcion',
      clave: 'c-cobra',
      costo: 3,
    });
    // Abierto y todavía sin cobrar: si el proveedor falla, no se cobra.
    expect(await saldo(CUENTAS.martin)).toBe(10);

    const cerrado = await terminar(trabajo.id, 3);
    expect(cerrado.status).toBe('succeeded');
    expect(cerrado.cost_credits).toBe(3);
    expect(await saldo(CUENTAS.martin)).toBe(7);

    const { rows } = await banco.db.query<{ amount: number; reason: string }>(
      `select amount, reason from public.credit_transactions
        where user_id = $1 and amount < 0`,
      [CUENTAS.martin],
    );
    expect(rows[0]?.amount).toBe(-3);
    expect(rows[0]?.reason).toBe('wasi_ai:descripcion');
  });

  it('cerrar dos veces el mismo trabajo no cobra dos veces', async () => {
    const antes = await saldo(CUENTAS.martin);
    const trabajo = await pedir(CUENTAS.martin, {
      operacion: 'titulo',
      clave: 'c-dos-veces',
      costo: 2,
    });

    await terminar(trabajo.id, 2);
    await terminar(trabajo.id, 2);

    expect(await saldo(CUENTAS.martin)).toBe(antes - 2);
  });

  it('la base no acepta un trabajo fallido con costo', async () => {
    await expect(
      banco.comoServicio((db) =>
        db.query(
          `insert into public.ai_jobs (user_id, kind, status, error, cost_credits)
           values ($1, 'listing_draft', 'failed', 'x', 4)`,
          [CUENTAS.rosa],
        ),
      ),
    ).rejects.toThrow(/fallo_no_cobra/);
  });
});

// ---------------------------------------------------------------------
// El navegador no escribe resultados
// ---------------------------------------------------------------------

describe('quién puede escribir el resultado', () => {
  it('la persona no marca su propio trabajo como exitoso', async () => {
    const trabajo = await pedir(CUENTAS.rosa, { operacion: 'titulo', clave: 'p-status' });

    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(`update public.ai_jobs set status = 'succeeded' where id = $1`, [trabajo.id]),
      ),
    ).rejects.toThrow(/lo escribe el servidor/);
  });

  it('ni escribe el texto de salida', async () => {
    const trabajo = await pedir(CUENTAS.rosa, { operacion: 'titulo', clave: 'p-output' });

    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(
          `update public.ai_jobs set output = '{"texto":"lo que yo quiera"}'::jsonb
                   where id = $1`,
          [trabajo.id],
        ),
      ),
    ).rejects.toThrow(/lo escribe el servidor/);
  });

  it('ni se pone el costo en cero después de que se cobró', async () => {
    const trabajo = await pedir(CUENTAS.martin, {
      operacion: 'titulo',
      clave: 'p-costo',
      costo: 1,
    });
    await terminar(trabajo.id, 1);

    await expect(
      banco.comoUsuario(CUENTAS.martin, (db) =>
        db.query(`update public.ai_jobs set cost_credits = 0 where id = $1`, [trabajo.id]),
      ),
    ).rejects.toThrow(/lo escribe el servidor/);
  });

  it('ni inserta un trabajo ya cobrado', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(
          `insert into public.ai_jobs (user_id, kind, cost_credits)
           values ($1, 'listing_draft', 9)`,
          [CUENTAS.rosa],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

// ---------------------------------------------------------------------
// Nada se aplica sin confirmación
// ---------------------------------------------------------------------

describe('aceptar o descartar', () => {
  it('un trabajo nace sin aceptar', async () => {
    const trabajo = await pedir(CUENTAS.rosa, { operacion: 'titulo', clave: 'a-nace' });
    await terminar(trabajo.id);

    const { rows } = await banco.db.query<{ accepted_at: string | null }>(
      `select accepted_at from public.ai_jobs where id = $1`,
      [trabajo.id],
    );
    expect(rows[0]?.accepted_at).toBeNull();
  });

  it('la confirmación queda con nombre y hora', async () => {
    const trabajo = await pedir(CUENTAS.rosa, { operacion: 'titulo', clave: 'a-acepta' });
    await terminar(trabajo.id);

    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`select public.aceptar_trabajo_ia($1)`, [trabajo.id]),
    );

    const { rows } = await banco.db.query<{
      accepted_at: string | null;
      accepted_by: string | null;
    }>(`select accepted_at, accepted_by from public.ai_jobs where id = $1`, [trabajo.id]);
    expect(rows[0]?.accepted_at).not.toBeNull();
    expect(rows[0]?.accepted_by).toBe(CUENTAS.rosa);
  });

  it('no se acepta lo que nunca salió bien', async () => {
    const trabajo = await pedir(CUENTAS.rosa, { operacion: 'titulo', clave: 'a-fallido' });
    await fallar(trabajo.id);

    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(`select public.aceptar_trabajo_ia($1)`, [trabajo.id]),
      ),
    ).rejects.toThrow(/ya no se puede aplicar/);
  });

  it('no se acepta el resultado de otra persona', async () => {
    const trabajo = await pedir(CUENTAS.rosa, { operacion: 'titulo', clave: 'a-ajeno' });
    await terminar(trabajo.id);

    await expect(
      banco.comoUsuario(CUENTAS.lucia, (db) =>
        db.query(`select public.aceptar_trabajo_ia($1)`, [trabajo.id]),
      ),
    ).rejects.toThrow(/ya no se puede aplicar/);
  });

  it('descartado ya no se puede aceptar', async () => {
    const trabajo = await pedir(CUENTAS.rosa, { operacion: 'titulo', clave: 'a-descarta' });
    await terminar(trabajo.id);

    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`select public.descartar_trabajo_ia($1)`, [trabajo.id]),
    );
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(`select public.aceptar_trabajo_ia($1)`, [trabajo.id]),
      ),
    ).rejects.toThrow(/ya no se puede aplicar/);
  });
});
