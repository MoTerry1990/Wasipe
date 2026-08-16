import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { levantarBanco, sembrar, CUENTAS, AVISOS, type Banco } from './banco';

/**
 * Fotos editadas con IA, contra la base de verdad.
 *
 * Las siete promesas del sprint viven acá y no en el código que llama:
 * la foto original no se sobrescribe, toda edición lleva etiqueta, nada
 * entra al aviso sin confirmación, un intento fallido no cobra, la
 * revisión de seguridad la hace Wasipe y lo retirado no se borra.
 */

let banco: Banco;

/** Una foto original del aviso de Rosa. */
let fotoOriginal: string;
let avisoDeRosa: string;

async function trabajoAceptado(
  usuario: string,
  clave: string,
  operacion = 'lighting',
  familia: 'photo_enhance' | 'virtual_staging' = 'photo_enhance',
  aviso?: string,
): Promise<string> {
  const id = await banco.comoUsuario(usuario, async (db) => {
    const { rows } = await db.query<{ id: string }>(
      `select * from public.iniciar_trabajo_ia($1, $2, '{}'::jsonb, $3, $4, 0, 50)`,
      [familia, operacion, clave, aviso ?? null],
    );
    return rows[0]!.id;
  });

  await banco.comoServicio((db) =>
    db.query(
      `select public.terminar_trabajo_ia($1, '{"propuesta":"https://x/y.webp"}'::jsonb,
                                         'imagen-http', 'modelo', 0, 500)`,
      [id],
    ),
  );
  await banco.comoUsuario(usuario, (db) =>
    db.query(`select public.aceptar_trabajo_ia($1)`, [id]),
  );
  return id;
}

async function adjuntar(
  usuario: string,
  trabajoId: string,
  edicion = 'lighting',
  original = fotoOriginal,
) {
  return banco.comoUsuario(usuario, async (db) => {
    const { rows } = await db.query<{
      id: string;
      ai_label: string | null;
      review_status: string;
      is_staged: boolean;
      original_media_id: string;
      sort_order: number;
      is_cover: boolean;
    }>(
      `select * from public.adjuntar_foto_editada(
         $1, $2, 'https://ejemplo/editada.webp', 'carpeta/ia/1.webp', $3, 1600, 1200, 90000)`,
      [trabajoId, original, edicion],
    );
    return rows[0]!;
  });
}

beforeAll(async () => {
  banco = await levantarBanco();
  await sembrar(banco);

  const { rows } = await banco.db.query<{ id: string; property_id: string }>(
    `select m.id, m.property_id
       from public.property_media m
       join public.properties p on p.id = m.property_id
      where p.owner_id = $1 and not m.ai_edited
      limit 1`,
    [CUENTAS.rosa],
  );
  fotoOriginal = rows[0]!.id;
  avisoDeRosa = rows[0]!.property_id;
}, 180_000);

afterAll(async () => {
  await banco?.cerrar();
});

// ---------------------------------------------------------------------
// La original no se toca
// ---------------------------------------------------------------------

describe('la foto original', () => {
  it('no se puede reemplazar el archivo original de una foto', async () => {
    await banco.db.query(
      `update public.property_media set original_storage_path = $2 where id = $1`,
      [fotoOriginal, 'carpeta/original/1.jpg'],
    );

    await expect(
      banco.db.query(
        `update public.property_media set original_storage_path = 'otro/archivo.jpg'
          where id = $1`,
        [fotoOriginal],
      ),
    ).rejects.toThrow(/no se reemplaza/);
  });

  it('una foto no se convierte en edición: la edición es otra fila', async () => {
    await expect(
      banco.db.query(`update public.property_media set ai_edited = true where id = $1`, [
        fotoOriginal,
      ]),
    ).rejects.toThrow(/se agrega como foto nueva/);
  });

  it('y no se puede borrar mientras una edición dependa de ella', async () => {
    const trabajo = await trabajoAceptado(CUENTAS.rosa, 'f-borrar', 'lighting');
    const editada = await adjuntar(CUENTAS.rosa, trabajo);

    await expect(
      banco.db.query(`delete from public.property_media where id = $1`, [fotoOriginal]),
    ).rejects.toThrow(/foreign key|violates/i);

    await banco.db.query(`delete from public.property_media where id = $1`, [editada.id]);
  });
});

// ---------------------------------------------------------------------
// Etiquetas
// ---------------------------------------------------------------------

describe('las etiquetas', () => {
  it('un retoque dice que la imagen fue modificada', async () => {
    const trabajo = await trabajoAceptado(CUENTAS.rosa, 'f-etiqueta-1', 'declutter');
    const editada = await adjuntar(CUENTAS.rosa, trabajo, 'declutter');

    expect(editada.ai_label).toBe('Imagen modificada con Wasi AI');
    expect(editada.is_staged).toBe(false);
  });

  it('el amoblamiento virtual dice que es referencial', async () => {
    const trabajo = await trabajoAceptado(
      CUENTAS.rosa,
      'f-etiqueta-2',
      'staging',
      'virtual_staging',
    );
    const editada = await adjuntar(CUENTAS.rosa, trabajo, 'staging');

    expect(editada.ai_label).toBe('Amoblamiento virtual — imagen referencial');
    expect(editada.is_staged).toBe(true);
  });

  it('la etiqueta la genera la base: no se puede escribir a mano', async () => {
    await expect(
      banco.db.query(`update public.property_media set ai_label = 'Foto real' where ai_edited`),
    ).rejects.toThrow(/generated|can only be updated to DEFAULT/i);
  });

  it('y no existe imagen editada sin decir qué se le hizo', async () => {
    await expect(
      banco.db.query(
        `insert into public.property_media
           (property_id, url, ai_edited, original_media_id, review_status)
         values ($1, 'https://x/sin-decir.webp', true, $2, 'pending')`,
        [avisoDeRosa, fotoOriginal],
      ),
    ).rejects.toThrow(/edicion_declara_que_hizo/);
  });
});

// ---------------------------------------------------------------------
// Confirmación
// ---------------------------------------------------------------------

describe('nada entra al aviso sin confirmación', () => {
  it('no se adjunta el resultado de un trabajo sin aceptar', async () => {
    const id = await banco.comoUsuario(CUENTAS.rosa, async (db) => {
      const { rows } = await db.query<{ id: string }>(
        `select * from public.iniciar_trabajo_ia(
           'photo_enhance', 'lighting', '{}'::jsonb, 'f-sin-aceptar', null, 0, 50)`,
      );
      return rows[0]!.id;
    });
    await banco.comoServicio((db) =>
      db.query(
        `select public.terminar_trabajo_ia($1, '{}'::jsonb, 'imagen-http', 'm', 0, 100)`,
        [id],
      ),
    );

    await expect(adjuntar(CUENTAS.rosa, id)).rejects.toThrow(/tienes que aceptar/);
  });

  it('ni el de un trabajo que falló', async () => {
    const id = await banco.comoUsuario(CUENTAS.rosa, async (db) => {
      const { rows } = await db.query<{ id: string }>(
        `select * from public.iniciar_trabajo_ia(
           'photo_enhance', 'lighting', '{}'::jsonb, 'f-fallido', null, 0, 50)`,
      );
      return rows[0]!.id;
    });
    await banco.comoServicio((db) =>
      db.query(`select public.fallar_trabajo_ia($1, 'se cayó', 'imagen-http', 100)`, [id]),
    );

    await expect(adjuntar(CUENTAS.rosa, id)).rejects.toThrow(/no terminó bien/);
  });

  it('ni el de otra persona', async () => {
    const trabajo = await trabajoAceptado(CUENTAS.rosa, 'f-ajeno');
    await expect(adjuntar(CUENTAS.lucia, trabajo)).rejects.toThrow(/no es tuyo/);
  });

  it('y tampoco se inserta una edición a mano, sin trabajo aceptado', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(
          `insert into public.property_media
             (property_id, url, ai_edited, original_media_id, edit_kind, review_status)
           values ($1, 'https://x/colada.webp', true, $2, 'lighting', 'pending')`,
          [avisoDeRosa, fotoOriginal],
        ),
      ),
    ).rejects.toThrow(/que hayas aceptado/);
  });

  it('la edición se agrega como foto nueva, al final y sin robar la portada', async () => {
    const antes = await banco.db.query<{ n: string }>(
      `select count(*) as n from public.property_media where property_id = $1`,
      [avisoDeRosa],
    );

    const trabajo = await trabajoAceptado(CUENTAS.rosa, 'f-nueva');
    const editada = await adjuntar(CUENTAS.rosa, trabajo);

    const despues = await banco.db.query<{ n: string }>(
      `select count(*) as n from public.property_media where property_id = $1`,
      [avisoDeRosa],
    );

    expect(Number(despues.rows[0]!.n)).toBe(Number(antes.rows[0]!.n) + 1);
    expect(editada.is_cover).toBe(false);
    expect(editada.original_media_id).toBe(fotoOriginal);
  });

  it('no se edita una edición: se parte siempre del original', async () => {
    const primero = await trabajoAceptado(CUENTAS.rosa, 'f-cadena-1');
    const editada = await adjuntar(CUENTAS.rosa, primero);

    const segundo = await trabajoAceptado(CUENTAS.rosa, 'f-cadena-2');
    await expect(adjuntar(CUENTAS.rosa, segundo, 'lighting', editada.id)).rejects.toThrow(
      /No se edita una edición/,
    );
  });
});

// ---------------------------------------------------------------------
// Reintentos
// ---------------------------------------------------------------------

describe('la cola de trabajos', () => {
  it('cuenta cada intento, incluido el primero', async () => {
    const id = await banco.comoUsuario(CUENTAS.martin, async (db) => {
      const { rows } = await db.query<{ id: string; attempts: number }>(
        `select * from public.iniciar_trabajo_ia(
           'photo_enhance', 'lighting', '{}'::jsonb, 'r-cuenta', null, 0, 50)`,
      );
      expect(rows[0]!.attempts).toBe(1);
      return rows[0]!.id;
    });

    await banco.comoServicio((db) =>
      db.query(`select public.fallar_trabajo_ia($1, 'se cayó', 'imagen-http', 100)`, [id]),
    );
    const reabierto = await banco.comoServicio(async (db) => {
      const { rows } = await db.query<{ attempts: number }>(
        `select * from public.reintentar_trabajo_ia($1)`,
        [id],
      );
      return rows[0]!;
    });
    expect(reabierto.attempts).toBe(2);
  });

  it('se acaba: al tercer intento ya no reabre', async () => {
    const id = await banco.comoUsuario(CUENTAS.martin, async (db) => {
      const { rows } = await db.query<{ id: string }>(
        `select * from public.iniciar_trabajo_ia(
           'photo_enhance', 'lighting', '{}'::jsonb, 'r-agota', null, 0, 50)`,
      );
      return rows[0]!.id;
    });

    for (let i = 0; i < 2; i++) {
      await banco.comoServicio((db) =>
        db.query(`select public.fallar_trabajo_ia($1, 'se cayó', 'imagen-http', 100)`, [id]),
      );
      await banco.comoServicio((db) =>
        db.query(`select * from public.reintentar_trabajo_ia($1)`, [id]),
      );
    }
    await banco.comoServicio((db) =>
      db.query(`select public.fallar_trabajo_ia($1, 'se cayó', 'imagen-http', 100)`, [id]),
    );

    const { rows } = await banco.comoServicio((db) =>
      db.query<{ reintentar_trabajo_ia: unknown }>(`select public.reintentar_trabajo_ia($1)`, [
        id,
      ]),
    );
    expect(rows[0]?.reintentar_trabajo_ia).toBeNull();
  });

  it('ningún intento fallido cobra', async () => {
    const { rows: antes } = await banco.db.query<{ saldo: number }>(
      `select public.saldo_de_creditos($1) as saldo`,
      [CUENTAS.martin],
    );

    const { rows } = await banco.db.query<{ n: string }>(
      `select count(*) as n from public.ai_jobs
        where status = 'failed' and cost_credits > 0`,
    );
    expect(Number(rows[0]!.n)).toBe(0);
    expect(Number(antes[0]!.saldo)).toBe(0);
  });
});

// ---------------------------------------------------------------------
// Revisión de seguridad
// ---------------------------------------------------------------------

describe('la revisión de seguridad', () => {
  it('toda edición nace pendiente de revisión', async () => {
    const trabajo = await trabajoAceptado(CUENTAS.rosa, 'v-nace');
    const editada = await adjuntar(CUENTAS.rosa, trabajo);
    expect(editada.review_status).toBe('pending');
  });

  it('quien publica no se aprueba sus propias imágenes', async () => {
    const trabajo = await trabajoAceptado(CUENTAS.rosa, 'v-auto');
    const editada = await adjuntar(CUENTAS.rosa, trabajo);

    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(`update public.property_media set review_status = 'cleared' where id = $1`, [
          editada.id,
        ]),
      ),
    ).rejects.toThrow(/la realiza el equipo de Wasipe/);

    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(`select public.revisar_foto($1, 'cleared')`, [editada.id]),
      ),
    ).rejects.toThrow(/Solo el equipo de Wasipe/);
  });

  it('moderación sí, y retirar exige explicar por qué', async () => {
    const trabajo = await trabajoAceptado(CUENTAS.rosa, 'v-modera');
    const editada = await adjuntar(CUENTAS.rosa, trabajo);

    await expect(
      banco.comoUsuario(CUENTAS.moderacion, (db) =>
        db.query(`select public.revisar_foto($1, 'blocked')`, [editada.id]),
      ),
    ).rejects.toThrow(/explicar por qué/);

    await banco.comoUsuario(CUENTAS.moderacion, (db) =>
      db.query(`select public.revisar_foto($1, 'blocked', 'Tapó una rajadura del techo')`, [
        editada.id,
      ]),
    );

    const { rows } = await banco.db.query<{
      review_status: string;
      review_reason: string;
      reviewed_by: string;
    }>(
      `select review_status, review_reason, reviewed_by from public.property_media
         where id = $1`,
      [editada.id],
    );

    expect(rows[0]?.review_status).toBe('blocked');
    expect(rows[0]?.review_reason).toContain('rajadura');
    expect(rows[0]?.reviewed_by).toBe(CUENTAS.moderacion);
  });

  it('retirar no borra: la imagen y su registro siguen ahí', async () => {
    const { rows } = await banco.db.query(
      `select id from public.property_media where review_status = 'blocked'`,
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it('pero deja de verse para el público', async () => {
    const bloqueada = await banco.db.query<{ id: string; property_id: string }>(
      `select id, property_id from public.property_media where review_status = 'blocked' limit 1`,
    );
    const id = bloqueada.rows[0]!.id;

    // Se publica el aviso para que la política pública entre en juego.
    await banco.db.query(
      `update public.properties set publication_status = 'published', published_at = now()
        where id = $1`,
      [bloqueada.rows[0]!.property_id],
    );

    const visibles = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(`select id from public.property_media where id = $1`, [
        id,
      ]);
      return rows;
    });
    expect(visibles).toHaveLength(0);
  });

  it('y moderación sigue viéndola, que para eso la retiró', async () => {
    const bloqueada = await banco.db.query<{ id: string }>(
      `select id from public.property_media where review_status = 'blocked' limit 1`,
    );

    const vistas = await banco.comoUsuario(CUENTAS.moderacion, async (db) => {
      const { rows } = await db.query(`select id from public.property_media where id = $1`, [
        bloqueada.rows[0]!.id,
      ]);
      return rows;
    });
    expect(vistas).toHaveLength(1);
  });

  it('una foto original nunca entra a la cola de revisión', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.moderacion, (db) =>
        db.query(`select public.revisar_foto($1, 'cleared')`, [fotoOriginal]),
      ),
    ).rejects.toThrow(/no fue editada con IA/);
  });
});

// ---------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------

describe('el archivo original en storage', () => {
  it('no se sobrescribe', async () => {
    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`insert into storage.objects (bucket_id, name) values ('avisos', $1)`, [
        `${AVISOS.miraflores}/original/1.jpg`,
      ]),
    );

    const resultado = await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(
        `update storage.objects set name = $1 where bucket_id = 'avisos' and name = $2`,
        [`${AVISOS.miraflores}/original/1.jpg`, `${AVISOS.miraflores}/original/1.jpg`],
      ),
    );
    expect(resultado.affectedRows ?? 0).toBe(0);
  });

  it('ni se borra', async () => {
    const resultado = await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`delete from storage.objects where bucket_id = 'avisos' and name = $1`, [
        `${AVISOS.miraflores}/original/1.jpg`,
      ]),
    );
    expect(resultado.affectedRows ?? 0).toBe(0);
  });

  it('lo que sale de la IA sí se puede borrar: vive en su propia carpeta', async () => {
    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`insert into storage.objects (bucket_id, name) values ('avisos', $1)`, [
        `${AVISOS.miraflores}/ia/9.webp`,
      ]),
    );

    const resultado = await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`delete from storage.objects where bucket_id = 'avisos' and name = $1`, [
        `${AVISOS.miraflores}/ia/9.webp`,
      ]),
    );
    expect(resultado.affectedRows ?? 0).toBe(1);
  });
});
