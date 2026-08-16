import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { levantarBanco, sembrar, CUENTAS, AVISOS, type Banco } from './banco';

/**
 * Publicación: borradores, moderación y fotos.
 *
 * Lo que se prueba acá es lo que sostiene el flujo: que un borrador sea
 * privado, que nadie se publique solo, y que el archivo original de cada
 * foto no se pueda borrar.
 */

let banco: Banco;

beforeAll(async () => {
  banco = await levantarBanco();
  await sembrar(banco);
}, 180_000);

afterAll(async () => {
  await banco?.cerrar();
});

describe('borradores', () => {
  it('cada quien ve solo los suyos', async () => {
    const id = await banco.comoUsuario(CUENTAS.rosa, async (db) => {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.listing_drafts (user_id, datos, paso)
         values ($1, '{"titulo":"Un borrador a medias"}'::jsonb, 2)
         returning id`,
        [CUENTAS.rosa],
      );
      return rows[0]!.id;
    });

    const propios = await banco.comoUsuario(CUENTAS.rosa, async (db) => {
      const { rows } = await db.query(`select id from public.listing_drafts`);
      return rows;
    });
    expect(propios).toHaveLength(1);

    const ajenos = await banco.comoUsuario(CUENTAS.lucia, async (db) => {
      const { rows } = await db.query(`select id from public.listing_drafts where id = $1`, [
        id,
      ]);
      return rows;
    });
    expect(ajenos).toHaveLength(0);

    const anonimos = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(`select id from public.listing_drafts`);
      return rows;
    });
    expect(anonimos).toHaveLength(0);
  });

  it('no se puede guardar un borrador a nombre de otra persona', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(
          `insert into public.listing_drafts (user_id, datos) values ($1, '{}'::jsonb)`,
          [CUENTAS.lucia],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('un aviso en edición tiene un solo borrador', async () => {
    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(
        `insert into public.listing_drafts (user_id, property_id, datos)
         values ($1, $2, '{}'::jsonb)`,
        [CUENTAS.rosa, AVISOS.miraflores],
      ),
    );

    // Dos pestañas abiertas crearían dos borradores del mismo aviso y uno
    // pisaría al otro.
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(
          `insert into public.listing_drafts (user_id, property_id, datos)
           values ($1, $2, '{}'::jsonb)`,
          [CUENTAS.rosa, AVISOS.miraflores],
        ),
      ),
    ).rejects.toThrow(/listing_drafts_por_aviso/);
  });

  it('el paso queda dentro del rango del asistente', async () => {
    await expect(
      banco.db.query(
        `insert into public.listing_drafts (user_id, datos, paso) values ($1, '{}'::jsonb, 42)`,
        [CUENTAS.rosa],
      ),
    ).rejects.toThrow(/listing_drafts_paso_check/);
  });
});

describe('moderación', () => {
  it('un aviso nuevo no puede nacer publicado', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(
          `insert into public.properties
             (owner_id, title, description, operation, property_type, currency, price,
              total_area, department, province, district, publication_status, published_at)
           values ($1, 'Aviso que se publica solo',
                   'Descripción suficientemente larga como para pasar la validación de la tabla.',
                   'sale', 'apartment', 'USD', 100000, 70, 'Lima', 'Lima', 'Lince',
                   'published', now())`,
          [CUENTAS.rosa],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('enviar a revisión deja la marca de tiempo', async () => {
    const id = await banco.comoUsuario(CUENTAS.rosa, async (db) => {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.properties
           (owner_id, title, description, operation, property_type, currency, price,
            total_area, department, province, district, publication_status)
         values ($1, 'Departamento listo para revisión',
                 'Descripción suficientemente larga como para pasar la validación de la tabla.',
                 'sale', 'apartment', 'USD', 120000, 80, 'Lima', 'Lima', 'Lince', 'draft')
         returning id`,
        [CUENTAS.rosa],
      );
      return rows[0]!.id;
    });

    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`update public.properties set publication_status = 'in_review' where id = $1`, [
        id,
      ]),
    );

    const { rows } = await banco.db.query<{ submitted_at: string | null }>(
      `select submitted_at from public.properties where id = $1`,
      [id],
    );
    expect(rows[0]?.submitted_at).not.toBeNull();
  });

  it('quien publica no puede aprobarse el aviso', async () => {
    const { rows } = await banco.db.query<{ id: string }>(
      `select id from public.properties where publication_status = 'in_review' limit 1`,
    );
    const id = rows[0]!.id;

    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(
          `update public.properties set publication_status = 'published' where id = $1`,
          [id],
        ),
      ),
    ).rejects.toThrow(/pasar por revisión/);
  });

  it('moderación aprueba y quedan la fecha y quién revisó', async () => {
    const { rows: pendientes } = await banco.db.query<{ id: string }>(
      `select id from public.properties where publication_status = 'in_review' limit 1`,
    );
    const id = pendientes[0]!.id;

    await banco.comoUsuario(CUENTAS.moderacion, (db) =>
      db.query(`update public.properties set publication_status = 'published' where id = $1`, [
        id,
      ]),
    );

    const { rows } = await banco.db.query<{
      publication_status: string;
      reviewed_at: string | null;
      reviewed_by: string | null;
      published_at: string | null;
    }>(
      `select publication_status, reviewed_at, reviewed_by, published_at
         from public.properties where id = $1`,
      [id],
    );

    expect(rows[0]?.publication_status).toBe('published');
    expect(rows[0]?.reviewed_at).not.toBeNull();
    expect(rows[0]?.reviewed_by).toBe(CUENTAS.moderacion);
    expect(rows[0]?.published_at).not.toBeNull();
  });

  it('un rechazo sin explicar no se guarda', async () => {
    const { rows } = await banco.db.query<{ id: string }>(
      `select id from public.properties where publication_status = 'published' limit 1`,
    );

    await expect(
      banco.comoUsuario(CUENTAS.moderacion, (db) =>
        db.query(
          `update public.properties
              set publication_status = 'rejected', rejection_reason = 'no'
            where id = $1`,
          [rows[0]!.id],
        ),
      ),
    ).rejects.toThrow(/rechazo_explicado/);
  });

  it('pausar y reanudar no falsea la antigüedad del aviso', async () => {
    const antes = await banco.db.query<{ published_at: string }>(
      `select published_at from public.properties where id = $1`,
      [AVISOS.miraflores],
    );

    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`update public.properties set publication_status = 'paused' where id = $1`, [
        AVISOS.miraflores,
      ]),
    );
    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`update public.properties set publication_status = 'published' where id = $1`, [
        AVISOS.miraflores,
      ]),
    );

    const despues = await banco.db.query<{ published_at: string }>(
      `select published_at from public.properties where id = $1`,
      [AVISOS.miraflores],
    );

    // Reanudar no vuelve "nuevo" a un aviso de hace meses. Se comparan
    // como texto: el controlador devuelve objetos Date distintos aunque
    // representen el mismo instante.
    expect(String(despues.rows[0]?.published_at)).toBe(String(antes.rows[0]?.published_at));
  });

  it('archivar guarda la fecha y saca el aviso del listado público', async () => {
    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`update public.properties set publication_status = 'archived' where id = $1`, [
        AVISOS.miraflores,
      ]),
    );

    const { rows } = await banco.db.query<{ archived_at: string | null }>(
      `select archived_at from public.properties where id = $1`,
      [AVISOS.miraflores],
    );
    expect(rows[0]?.archived_at).not.toBeNull();

    const publicos = await banco.comoAnonimo(async (db) => {
      const { rows: r } = await db.query(`select id from public.properties where id = $1`, [
        AVISOS.miraflores,
      ]);
      return r;
    });
    expect(publicos).toHaveLength(0);

    // Archivar no borra: el aviso sigue ahí para su dueña.
    const propios = await banco.comoUsuario(CUENTAS.rosa, async (db) => {
      const { rows: r } = await db.query(`select id from public.properties where id = $1`, [
        AVISOS.miraflores,
      ]);
      return r;
    });
    expect(propios).toHaveLength(1);
  });
});

describe('fotos del aviso', () => {
  const carpeta = AVISOS.jesusMaria;

  it('las sube quien administra el aviso', async () => {
    await banco.comoUsuario(CUENTAS.lucia, (db) =>
      db.query(`insert into storage.objects (bucket_id, name) values ('avisos', $1)`, [
        `${carpeta}/1755000000000.webp`,
      ]),
    );

    const { rows } = await banco.db.query(
      `select id from storage.objects where bucket_id = 'avisos'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('nadie sube fotos al aviso de otra persona', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(`insert into storage.objects (bucket_id, name) values ('avisos', $1)`, [
          `${carpeta}/colada.webp`,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('se puede subir al borrador propio, antes de que el aviso exista', async () => {
    const borrador = await banco.comoUsuario(CUENTAS.lucia, async (db) => {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.listing_drafts (user_id, datos) values ($1, '{}'::jsonb) returning id`,
        [CUENTAS.lucia],
      );
      return rows[0]!.id;
    });

    await banco.comoUsuario(CUENTAS.lucia, (db) =>
      db.query(`insert into storage.objects (bucket_id, name) values ('avisos', $1)`, [
        `${borrador}/1755000000001.webp`,
      ]),
    );

    const { rows } = await banco.db.query<{ n: number }>(
      `select count(*)::int as n from storage.objects where name like $1`,
      [`${borrador}/%`],
    );
    expect(rows[0]?.n).toBe(1);
  });

  it('una carpeta que no es de nadie queda afuera', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.lucia, (db) =>
        db.query(
          `insert into storage.objects (bucket_id, name)
           values ('avisos', 'cualquier-cosa/foto.webp')`,
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('EL ORIGINAL NO SE PUEDE BORRAR', async () => {
    await banco.comoUsuario(CUENTAS.lucia, (db) =>
      db.query(`insert into storage.objects (bucket_id, name) values ('avisos', $1)`, [
        `${carpeta}/original/1755000000000.bin`,
      ]),
    );

    const borradas = await banco.comoUsuario(CUENTAS.lucia, (db) =>
      db.query(`delete from storage.objects where name like $1`, [`${carpeta}/original/%`]),
    );

    // La política de borrado excluye la subcarpeta "original".
    expect(borradas.affectedRows ?? 0).toBe(0);

    const { rows } = await banco.db.query<{ n: number }>(
      `select count(*)::int as n from storage.objects where name like $1`,
      [`${carpeta}/original/%`],
    );
    expect(rows[0]?.n).toBe(1);
  });

  it('la versión que se muestra sí se puede quitar', async () => {
    const borradas = await banco.comoUsuario(CUENTAS.lucia, (db) =>
      db.query(`delete from storage.objects where name = $1`, [
        `${carpeta}/1755000000000.webp`,
      ]),
    );
    expect(borradas.affectedRows ?? 0).toBe(1);
  });

  it('la cubeta declara su límite de peso y sus tipos', async () => {
    const { rows } = await banco.db.query<{
      public: boolean;
      file_size_limit: string;
      allowed_mime_types: string[];
    }>(
      `select public, file_size_limit, allowed_mime_types
         from storage.buckets where id = 'avisos'`,
    );

    expect(rows[0]?.public).toBe(true);
    expect(Number(rows[0]?.file_size_limit)).toBe(15 * 1024 * 1024);
    expect(rows[0]?.allowed_mime_types).toContain('image/webp');
    expect(rows[0]?.allowed_mime_types).not.toContain('application/pdf');
  });
});
