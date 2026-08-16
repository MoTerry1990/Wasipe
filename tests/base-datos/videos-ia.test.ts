import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { levantarBanco, sembrar, CUENTAS, type Banco } from './banco';

/**
 * Video del aviso, contra la base de verdad.
 *
 * Lo que se comprueba acá es la plata y la autorización: que la reserva
 * se aparte de verdad, que un render fallido la devuelva entera, que
 * cancelar no cobre nada, y que un video no se descargue si venció o si
 * quien lo pide no administra el aviso.
 */

let banco: Banco;
let avisoDeRosa: string;

async function abrirTrabajo(usuario: string, clave: string, aviso?: string): Promise<string> {
  return banco.comoUsuario(usuario, async (db) => {
    const { rows } = await db.query<{ id: string }>(
      `select * from public.iniciar_trabajo_ia(
         'video_tour', 'vertical:modern', '{}'::jsonb, $1, $2, 0, 50)`,
      [clave, aviso ?? null],
    );
    return rows[0]!.id;
  });
}

async function saldo(usuario: string): Promise<number> {
  const { rows } = await banco.db.query<{ saldo: number }>(
    `select public.saldo_de_creditos($1) as saldo`,
    [usuario],
  );
  return Number(rows[0]?.saldo ?? 0);
}

async function cargar(usuario: string, monto: number) {
  const actual = await saldo(usuario);
  await banco.db.query(
    `insert into public.credit_transactions (user_id, amount, balance_after, reason)
     values ($1, $2, $3, 'carga de prueba')`,
    [usuario, monto, actual + monto],
  );
}

/** Crea un video listo, con su trabajo, tal como lo dejaría el servidor. */
async function videoListo(
  usuario: string,
  clave: string,
  opciones: { vence?: string | null } = {},
): Promise<string> {
  // Se carga justo lo que este video va a reservar: así el saldo queda
  // como estaba y las pruebas de plata no dependen del orden.
  await cargar(usuario, 3);
  const trabajo = await abrirTrabajo(usuario, clave, avisoDeRosa);
  await banco.comoServicio((db) =>
    db.query(`select public.reservar_creditos_ia($1, 3)`, [trabajo]),
  );
  await banco.comoServicio((db) =>
    db.query(
      `select public.terminar_trabajo_reservado($1, '{}'::jsonb, 'video-http', 'v', 1000, 34000)`,
      [trabajo],
    ),
  );

  const { rows } = await banco.db.query<{ id: string }>(
    `insert into public.property_videos
       (property_id, ai_job_id, created_by, format, template, status,
        storage_path, expires_at)
     values ($1, $2, $3, 'vertical', 'modern', 'ready', 'carpeta/1.mp4', $4)
     returning id`,
    [
      avisoDeRosa,
      trabajo,
      usuario,
      opciones.vence === undefined
        ? new Date(Date.now() + 86_400_000).toISOString()
        : opciones.vence,
    ],
  );
  return rows[0]!.id;
}

beforeAll(async () => {
  banco = await levantarBanco();
  await sembrar(banco);

  const { rows } = await banco.db.query<{ id: string }>(
    `select id from public.properties where owner_id = $1 limit 1`,
    [CUENTAS.rosa],
  );
  avisoDeRosa = rows[0]!.id;
}, 180_000);

afterAll(async () => {
  await banco?.cerrar();
});

// ---------------------------------------------------------------------
// Reserva
// ---------------------------------------------------------------------

describe('la reserva de créditos', () => {
  it('sin saldo no se reserva nada', async () => {
    const trabajo = await abrirTrabajo(CUENTAS.lucia, 'v-sin-saldo');
    await expect(
      banco.comoServicio((db) =>
        db.query(`select public.reservar_creditos_ia($1, 8)`, [trabajo]),
      ),
    ).rejects.toThrow(/No te alcanzan los créditos/);
  });

  it('con saldo, el crédito sale de la cuenta al empezar', async () => {
    await cargar(CUENTAS.rosa, 20);
    const antes = await saldo(CUENTAS.rosa);

    const trabajo = await abrirTrabajo(CUENTAS.rosa, 'v-reserva', avisoDeRosa);
    await banco.comoServicio((db) =>
      db.query(`select public.reservar_creditos_ia($1, 8)`, [trabajo]),
    );

    // Ya se descontó: dos videos en paralelo no pueden gastar el mismo
    // crédito dos veces.
    expect(await saldo(CUENTAS.rosa)).toBe(antes - 8);

    const { rows } = await banco.db.query<{ reserved_credits: number }>(
      `select reserved_credits from public.ai_jobs where id = $1`,
      [trabajo],
    );
    expect(rows[0]?.reserved_credits).toBe(8);
  });

  it('reservar dos veces el mismo trabajo no cobra dos veces', async () => {
    const trabajo = await abrirTrabajo(CUENTAS.rosa, 'v-doble', avisoDeRosa);
    await banco.comoServicio((db) =>
      db.query(`select public.reservar_creditos_ia($1, 2)`, [trabajo]),
    );
    const despues = await saldo(CUENTAS.rosa);

    await banco.comoServicio((db) =>
      db.query(`select public.reservar_creditos_ia($1, 2)`, [trabajo]),
    );
    expect(await saldo(CUENTAS.rosa)).toBe(despues);
  });
});

// ---------------------------------------------------------------------
// Devolución
// ---------------------------------------------------------------------

describe('el render que falla', () => {
  it('devuelve los créditos enteros', async () => {
    const antes = await saldo(CUENTAS.rosa);

    const trabajo = await abrirTrabajo(CUENTAS.rosa, 'v-falla', avisoDeRosa);
    await banco.comoServicio((db) =>
      db.query(`select public.reservar_creditos_ia($1, 6)`, [trabajo]),
    );
    expect(await saldo(CUENTAS.rosa)).toBe(antes - 6);

    await banco.comoServicio((db) =>
      db.query(`select public.devolver_creditos_ia($1, 'falla')`, [trabajo]),
    );
    await banco.comoServicio((db) =>
      db.query(
        `select public.fallar_trabajo_ia($1, 'el proveedor se cayó', 'video-http', 900)`,
        [trabajo],
      ),
    );

    expect(await saldo(CUENTAS.rosa)).toBe(antes);

    const { rows } = await banco.db.query<{ cost_credits: number; reserved_credits: number }>(
      `select cost_credits, reserved_credits from public.ai_jobs where id = $1`,
      [trabajo],
    );
    expect(rows[0]?.cost_credits).toBe(0);
    expect(rows[0]?.reserved_credits).toBe(0);
  });

  it('devolver dos veces no regala créditos', async () => {
    const trabajo = await abrirTrabajo(CUENTAS.rosa, 'v-doble-devolucion', avisoDeRosa);
    await banco.comoServicio((db) =>
      db.query(`select public.reservar_creditos_ia($1, 4)`, [trabajo]),
    );
    await banco.comoServicio((db) =>
      db.query(`select public.devolver_creditos_ia($1, 'falla')`, [trabajo]),
    );
    const despues = await saldo(CUENTAS.rosa);

    await banco.comoServicio((db) =>
      db.query(`select public.devolver_creditos_ia($1, 'falla')`, [trabajo]),
    );
    expect(await saldo(CUENTAS.rosa)).toBe(despues);
  });

  it('la historia queda legible: reserva y después devolución', async () => {
    const { rows } = await banco.db.query<{ reason: string; amount: number }>(
      `select reason, amount from public.credit_transactions
        where user_id = $1 and reason like 'wasi_ai:%'
        order by id`,
      [CUENTAS.rosa],
    );
    expect(rows.some((r) => r.reason.startsWith('wasi_ai:reserva:') && r.amount < 0)).toBe(
      true,
    );
    expect(rows.some((r) => r.reason.startsWith('wasi_ai:devolucion:') && r.amount > 0)).toBe(
      true,
    );
  });

  it('un trabajo cerrado no se queda con la reserva', async () => {
    await expect(
      banco.comoServicio((db) =>
        db.query(
          `insert into public.ai_jobs (user_id, kind, status, error, reserved_credits)
           values ($1, 'video_tour', 'failed', 'x', 5)`,
          [CUENTAS.rosa],
        ),
      ),
    ).rejects.toThrow(/sin_reserva_al_cerrar/);
  });
});

describe('el render que sale bien', () => {
  it('convierte la reserva en costo, sin volver a cobrar', async () => {
    const antes = await saldo(CUENTAS.rosa);

    const trabajo = await abrirTrabajo(CUENTAS.rosa, 'v-bien', avisoDeRosa);
    await banco.comoServicio((db) =>
      db.query(`select public.reservar_creditos_ia($1, 5)`, [trabajo]),
    );
    await banco.comoServicio((db) =>
      db.query(
        `select public.terminar_trabajo_reservado(
           $1, '{"ruta":"a/b.mp4"}'::jsonb, 'video-http', 'v', 90000, 34000)`,
        [trabajo],
      ),
    );

    // Se cobró una sola vez: la de la reserva.
    expect(await saldo(CUENTAS.rosa)).toBe(antes - 5);

    const { rows } = await banco.db.query<{
      cost_credits: number;
      reserved_credits: number;
      progress: number;
      provider_cost_micros: string;
    }>(
      `select cost_credits, reserved_credits, progress, provider_cost_micros
         from public.ai_jobs where id = $1`,
      [trabajo],
    );
    expect(rows[0]?.cost_credits).toBe(5);
    expect(rows[0]?.reserved_credits).toBe(0);
    expect(rows[0]?.progress).toBe(100);
    // El costo real del proveedor queda registrado, aparte de lo cobrado.
    expect(Number(rows[0]?.provider_cost_micros)).toBe(34000);
  });
});

// ---------------------------------------------------------------------
// Progreso y cancelación
// ---------------------------------------------------------------------

describe('el progreso', () => {
  it('solo sube', async () => {
    const trabajo = await abrirTrabajo(CUENTAS.rosa, 'v-progreso', avisoDeRosa);

    await banco.comoServicio((db) =>
      db.query(`select public.avanzar_trabajo_ia($1, 60::smallint, 'ref-1')`, [trabajo]),
    );
    await banco.comoServicio((db) =>
      db.query(`select public.avanzar_trabajo_ia($1, 20::smallint)`, [trabajo]),
    );

    const { rows } = await banco.db.query<{ progress: number; provider_ref: string }>(
      `select progress, provider_ref from public.ai_jobs where id = $1`,
      [trabajo],
    );
    expect(rows[0]?.progress).toBe(60);
    expect(rows[0]?.provider_ref).toBe('ref-1');
  });

  it('y nunca pasa de 100', async () => {
    const trabajo = await abrirTrabajo(CUENTAS.rosa, 'v-tope', avisoDeRosa);
    await banco.comoServicio((db) =>
      db.query(`select public.avanzar_trabajo_ia($1, 400::smallint)`, [trabajo]),
    );

    const { rows } = await banco.db.query<{ progress: number }>(
      `select progress from public.ai_jobs where id = $1`,
      [trabajo],
    );
    expect(rows[0]?.progress).toBe(100);
  });
});

describe('cancelar', () => {
  it('devuelve todo y no cobra nada', async () => {
    await cargar(CUENTAS.rosa, 10);
    const antes = await saldo(CUENTAS.rosa);

    const trabajo = await abrirTrabajo(CUENTAS.rosa, 'v-cancela', avisoDeRosa);
    await banco.comoServicio((db) =>
      db.query(`select public.reservar_creditos_ia($1, 7)`, [trabajo]),
    );
    await banco.db.query(
      `insert into public.property_videos
         (property_id, ai_job_id, created_by, format, template, status)
       values ($1, $2, $3, 'square', 'reel', 'rendering')`,
      [avisoDeRosa, trabajo, CUENTAS.rosa],
    );

    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`select public.cancelar_trabajo_ia($1)`, [trabajo]),
    );

    expect(await saldo(CUENTAS.rosa)).toBe(antes);

    const { rows } = await banco.db.query<{ status: string; cost_credits: number }>(
      `select status, cost_credits from public.ai_jobs where id = $1`,
      [trabajo],
    );
    expect(rows[0]?.status).toBe('canceled');
    expect(rows[0]?.cost_credits).toBe(0);

    const video = await banco.db.query<{ status: string }>(
      `select status from public.property_videos where ai_job_id = $1`,
      [trabajo],
    );
    expect(video.rows[0]?.status).toBe('canceled');
  });

  it('nadie cancela el trabajo de otra persona', async () => {
    const trabajo = await abrirTrabajo(CUENTAS.rosa, 'v-cancela-ajeno', avisoDeRosa);
    await expect(
      banco.comoUsuario(CUENTAS.lucia, (db) =>
        db.query(`select public.cancelar_trabajo_ia($1)`, [trabajo]),
      ),
    ).rejects.toThrow(/no es tuyo/);
  });

  it('cancelar algo que ya terminó no rompe nada', async () => {
    const trabajo = await abrirTrabajo(CUENTAS.rosa, 'v-cancela-tarde', avisoDeRosa);
    await banco.comoServicio((db) =>
      db.query(`select public.terminar_trabajo_reservado($1, '{}'::jsonb, 'p', 'm')`, [
        trabajo,
      ]),
    );

    const { rows } = await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query<{ status: string }>(`select * from public.cancelar_trabajo_ia($1)`, [trabajo]),
    );
    expect(rows[0]?.status).toBe('succeeded');
  });
});

// ---------------------------------------------------------------------
// Descarga autorizada
// ---------------------------------------------------------------------

describe('la descarga', () => {
  it('quien administra el aviso puede', async () => {
    const video = await videoListo(CUENTAS.rosa, 'v-descarga');

    const permitido = await banco.comoUsuario(CUENTAS.rosa, async (db) => {
      const { rows } = await db.query<{ puede_descargar_video: boolean }>(
        `select public.puede_descargar_video($1)`,
        [video],
      );
      return rows[0]!.puede_descargar_video;
    });
    expect(permitido).toBe(true);

    const ruta = await banco.comoUsuario(CUENTAS.rosa, async (db) => {
      const { rows } = await db.query<{ registrar_descarga_de_video: string | null }>(
        `select public.registrar_descarga_de_video($1)`,
        [video],
      );
      return rows[0]!.registrar_descarga_de_video;
    });
    expect(ruta).toBe('carpeta/1.mp4');

    const { rows } = await banco.db.query<{ downloads: number }>(
      `select downloads from public.property_videos where id = $1`,
      [video],
    );
    expect(rows[0]?.downloads).toBe(1);
  });

  it('otra persona no, aunque conozca el identificador', async () => {
    const video = await videoListo(CUENTAS.rosa, 'v-descarga-ajena');

    const ruta = await banco.comoUsuario(CUENTAS.lucia, async (db) => {
      const { rows } = await db.query<{ registrar_descarga_de_video: string | null }>(
        `select public.registrar_descarga_de_video($1)`,
        [video],
      );
      return rows[0]!.registrar_descarga_de_video;
    });
    expect(ruta).toBeNull();
  });

  it('un visitante sin sesión tampoco', async () => {
    const video = await videoListo(CUENTAS.rosa, 'v-descarga-anonima');

    const ruta = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query<{ registrar_descarga_de_video: string | null }>(
        `select public.registrar_descarga_de_video($1)`,
        [video],
      );
      return rows[0]!.registrar_descarga_de_video;
    });
    expect(ruta).toBeNull();
  });

  it('y un video vencido no se descarga ni siendo el dueño', async () => {
    const video = await videoListo(CUENTAS.rosa, 'v-vencido', {
      vence: new Date(Date.now() - 86_400_000).toISOString(),
    });

    const ruta = await banco.comoUsuario(CUENTAS.rosa, async (db) => {
      const { rows } = await db.query<{ registrar_descarga_de_video: string | null }>(
        `select public.registrar_descarga_de_video($1)`,
        [video],
      );
      return rows[0]!.registrar_descarga_de_video;
    });
    expect(ruta).toBeNull();
  });

  it('los videos ajenos ni se ven', async () => {
    const video = await videoListo(CUENTAS.rosa, 'v-ver-ajeno');

    const vistos = await banco.comoUsuario(CUENTAS.lucia, async (db) => {
      const { rows } = await db.query(`select id from public.property_videos where id = $1`, [
        video,
      ]);
      return rows;
    });
    expect(vistos).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// Vencimiento y limpieza
// ---------------------------------------------------------------------

describe('el vencimiento', () => {
  it('los que pasaron su fecha quedan marcados', async () => {
    await videoListo(CUENTAS.rosa, 'v-a-vencer', {
      vence: new Date(Date.now() - 3_600_000).toISOString(),
    });

    const vencidos = await banco.comoServicio(async (db) => {
      const { rows } = await db.query(`select id from public.vencer_videos()`);
      return rows;
    });
    expect(vencidos.length).toBeGreaterThan(0);

    const { rows } = await banco.db.query<{ n: string }>(
      `select count(*) as n from public.property_videos
        where status = 'ready' and expires_at <= now()`,
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it('el archivo sigue estando: marcar no es borrar', async () => {
    const { rows } = await banco.db.query<{ storage_path: string | null }>(
      `select storage_path from public.property_videos where status = 'expired' limit 1`,
    );
    expect(rows[0]?.storage_path).not.toBeNull();
  });
});

describe('la cubeta de videos', () => {
  it('es privada: no hay URL pública que reenviar', async () => {
    const { rows } = await banco.db.query<{ public: boolean }>(
      `select public from storage.buckets where id = 'videos'`,
    );
    expect(rows[0]?.public).toBe(false);
  });
});
