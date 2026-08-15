import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { levantarBanco, sembrar, CUENTAS, type Banco } from './banco';

/**
 * Cuentas: bienvenida, distritos de interés y almacenamiento.
 *
 * Lo que se comprueba acá es que la autorización aguante aunque alguien
 * salte la interfaz por completo y hable directo con la base.
 */

let banco: Banco;

/** Cuenta recién registrada: sin bienvenida terminada. */
const NUEVA = '55555555-5555-4555-8555-555555555555';

beforeAll(async () => {
  banco = await levantarBanco();
  await sembrar(banco);

  await banco.db.query(
    `insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
             'recien.llegado@ejemplo.pe', '{"full_name":"Recién Llegado"}'::jsonb)`,
    [NUEVA],
  );
}, 180_000);

afterAll(async () => {
  await banco?.cerrar();
});

describe('registro', () => {
  it('crea el perfil solo, con el rol menos privilegiado', async () => {
    const { rows } = await banco.db.query<{ role: string; onboarded_at: string | null }>(
      `select role, onboarded_at from public.profiles where id = $1`,
      [NUEVA],
    );
    expect(rows[0]?.role).toBe('buyer');
    expect(rows[0]?.onboarded_at).toBeNull();
  });

  it('ignora el rol que venga en los metadatos del registro', async () => {
    const colado = '66666666-6666-4666-8666-666666666666';
    await banco.db.query(
      `insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
               'vivo@ejemplo.pe', '{"full_name":"Muy Vivo","role":"admin"}'::jsonb)`,
      [colado],
    );

    const { rows } = await banco.db.query<{ role: string }>(
      `select role from public.profiles where id = $1`,
      [colado],
    );
    expect(rows[0]?.role).toBe('buyer');
  });
});

describe('bienvenida', () => {
  it('deja elegir el tipo de cuenta una vez', async () => {
    await banco.comoUsuario(NUEVA, (db) =>
      db.query(
        `update public.profiles
            set role = 'owner', full_name = 'Recién Llegado', phone = '987654321',
                preferred_contact = 'whatsapp', intent = 'sell', onboarded_at = now()
          where id = $1`,
        [NUEVA],
      ),
    );

    const { rows } = await banco.db.query<{ role: string; intent: string }>(
      `select role, intent from public.profiles where id = $1`,
      [NUEVA],
    );
    expect(rows[0]?.role).toBe('owner');
    expect(rows[0]?.intent).toBe('sell');
  });

  it('y no una segunda vez', async () => {
    await expect(
      banco.comoUsuario(NUEVA, (db) =>
        db.query(`update public.profiles set role = 'agent' where id = $1`, [NUEVA]),
      ),
    ).rejects.toThrow(/ya no se puede cambiar/);
  });

  it('nunca deja elegir un rol de Wasipe, ni durante la bienvenida', async () => {
    const otro = '77777777-7777-4777-8777-777777777777';
    await banco.db.query(
      `insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
               'ambicioso@ejemplo.pe', '{"full_name":"Muy Ambicioso"}'::jsonb)`,
      [otro],
    );

    // Bienvenida sin terminar, así que el cambio de rol está permitido…
    // pero solo hacia los cuatro tipos que puede elegir una persona.
    await expect(
      banco.comoUsuario(otro, (db) =>
        db.query(`update public.profiles set role = 'admin' where id = $1`, [otro]),
      ),
    ).rejects.toThrow(/no se puede elegir/);

    await expect(
      banco.comoUsuario(otro, (db) =>
        db.query(`update public.profiles set role = 'moderator' where id = $1`, [otro]),
      ),
    ).rejects.toThrow(/no se puede elegir/);
  });

  it('no deja escribir el perfil de otra persona', async () => {
    const resultado = await banco.comoUsuario(NUEVA, (db) =>
      db.query(`update public.profiles set full_name = 'Secuestrado' where id = $1`, [
        CUENTAS.rosa,
      ]),
    );
    expect(resultado.affectedRows ?? 0).toBe(0);
  });
});

describe('distritos de interés', () => {
  it('cada quien ve solo los suyos', async () => {
    const deLucia = await banco.comoUsuario(CUENTAS.lucia, async (db) => {
      const { rows } = await db.query(`select district from public.profile_districts`);
      return rows;
    });
    expect(deLucia).toHaveLength(3);

    const deRosa = await banco.comoUsuario(CUENTAS.rosa, async (db) => {
      const { rows } = await db.query(`select district from public.profile_districts`);
      return rows;
    });
    expect(deRosa).toHaveLength(0);
  });

  it('no se pueden guardar a nombre de otra persona', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(
          `insert into public.profile_districts (user_id, district) values ($1, 'Surco')`,
          [CUENTAS.lucia],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('un visitante sin sesión no ve ninguno', async () => {
    const filas = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(`select * from public.profile_districts`);
      return rows;
    });
    expect(filas).toHaveLength(0);
  });
});

describe('almacenamiento de imágenes', () => {
  it('las cubetas quedan creadas con su límite de peso y sus tipos', async () => {
    const { rows } = await banco.db.query<{
      id: string;
      public: boolean;
      file_size_limit: string;
      allowed_mime_types: string[];
    }>(
      `select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id`,
    );

    expect(rows.map((r) => r.id)).toEqual(['avatares', 'logos']);
    for (const cubeta of rows) {
      expect(cubeta.public).toBe(true);
      expect(Number(cubeta.file_size_limit)).toBe(2 * 1024 * 1024);
    }
    // El SVG puede traer scripts: sirve para un logo, no para un avatar.
    expect(rows[0]?.allowed_mime_types).not.toContain('image/svg+xml');
    expect(rows[1]?.allowed_mime_types).toContain('image/svg+xml');
  });

  it('cada quien sube su foto a su propia carpeta', async () => {
    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`insert into storage.objects (bucket_id, name) values ('avatares', $1)`, [
        `${CUENTAS.rosa}/1755000000000.webp`,
      ]),
    );

    const { rows } = await banco.db.query(
      `select id from storage.objects where bucket_id = 'avatares'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('nadie escribe en la carpeta de otra persona', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(`insert into storage.objects (bucket_id, name) values ('avatares', $1)`, [
          `${CUENTAS.lucia}/suplantada.webp`,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('ni suelta un archivo en la raíz de la cubeta', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(
          `insert into storage.objects (bucket_id, name) values ('avatares', 'suelta.webp')`,
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('un visitante sin sesión no sube nada', async () => {
    await expect(
      banco.comoAnonimo((db) =>
        db.query(`insert into storage.objects (bucket_id, name) values ('avatares', $1)`, [
          `${CUENTAS.rosa}/colada.webp`,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('las fotos de perfil sí se pueden ver sin sesión', async () => {
    const filas = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(`select name from storage.objects`);
      return rows;
    });
    expect(filas.length).toBeGreaterThan(0);
  });

  it('el logo lo sube quien administra la inmobiliaria', async () => {
    const agencia = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    await banco.comoUsuario(CUENTAS.martin, (db) =>
      db.query(`insert into storage.objects (bucket_id, name) values ('logos', $1)`, [
        `${agencia}/1755000000000.png`,
      ]),
    );

    const { rows } = await banco.db.query(
      `select id from storage.objects where bucket_id = 'logos'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('y nadie más, aunque conozca el identificador', async () => {
    const agencia = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(`insert into storage.objects (bucket_id, name) values ('logos', $1)`, [
          `${agencia}/logo-falso.png`,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});
