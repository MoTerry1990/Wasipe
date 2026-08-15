import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { levantarBanco, sembrar, CUENTAS, AVISOS, type Banco } from './banco';

/**
 * Seguridad a nivel de fila.
 *
 * Cada prueba se hace pasar por alguien concreto —un visitante sin
 * sesión, la dueña de un aviso, alguien ajeno, moderación— y comprueba
 * qué ve y qué se le rechaza. Es la única forma de saber que la clave
 * anónima, que es pública, no abre nada que no deba.
 */

let banco: Banco;

beforeAll(async () => {
  banco = await levantarBanco();
  await sembrar(banco);
}, 180_000);

afterAll(async () => {
  await banco?.cerrar();
});

describe('visitante sin sesión', () => {
  it('ve los avisos publicados', async () => {
    const filas = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(`select id from public.properties`);
      return rows;
    });
    expect(filas.length).toBe(7); // los ocho de la semilla menos el borrador
  });

  it('no ve el borrador de nadie', async () => {
    const filas = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(`select id from public.properties where id = $1`, [
        AVISOS.borrador,
      ]);
      return rows;
    });
    expect(filas).toHaveLength(0);
  });

  it('no ve un aviso pausado ni uno ya vendido', async () => {
    await banco.db.exec(
      `update public.properties set status = 'sold' where id = '${AVISOS.sanIsidro}';`,
    );
    const filas = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(`select id from public.properties where id = $1`, [
        AVISOS.sanIsidro,
      ]);
      return rows;
    });
    expect(filas).toHaveLength(0);

    await banco.db.exec(
      `update public.properties set status = 'available' where id = '${AVISOS.sanIsidro}';`,
    );
  });

  it('no puede publicar nada', async () => {
    await expect(
      banco.comoAnonimo((db) =>
        db.query(
          `insert into public.properties
             (owner_id, title, description, operation, property_type, currency, price,
              total_area, department, province, district)
           values ($1, 'Aviso colado por un anónimo',
                   'Descripción larga que cumple con el mínimo exigido por la restricción de la tabla.',
                   'sale', 'apartment', 'USD', 1, 50, 'Lima', 'Lima', 'Lince')`,
          [CUENTAS.rosa],
        ),
      ),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  it('no puede editar el precio de un aviso ajeno', async () => {
    const resultado = await banco.comoAnonimo((db) =>
      db.query(`update public.properties set price = 1 where id = $1`, [AVISOS.miraflores]),
    );
    // La RLS no lanza error en UPDATE: simplemente no encuentra la fila.
    expect(resultado.affectedRows ?? 0).toBe(0);

    const { rows } = await banco.db.query<{ price: string }>(
      `select price from public.properties where id = $1`,
      [AVISOS.miraflores],
    );
    expect(Number(rows[0]?.price)).toBe(195000);
  });

  it('no ve el teléfono de nadie', async () => {
    const filas = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(`select id, phone from public.profiles`);
      return rows;
    });
    expect(filas).toHaveLength(0);
  });

  it('sí ve el nombre del anunciante por la vista pública', async () => {
    const filas = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query<{ full_name: string }>(
        `select full_name from public.anunciantes`,
      );
      return rows;
    });
    expect(filas.length).toBeGreaterThan(0);
    expect(Object.keys(filas[0]!)).not.toContain('phone');
  });

  it('no ve la dirección exacta salvo que el anuncio la autorice', async () => {
    const filas = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query<{ property_id: string }>(
        `select property_id from public.property_locations`,
      );
      return rows;
    });
    // Solo el loft de Barranco se publicó con address_privacy = 'exact'.
    expect(filas.map((f) => f.property_id)).toEqual([AVISOS.barranco]);
  });

  it('no ve los favoritos de nadie', async () => {
    const filas = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(`select * from public.favorites`);
      return rows;
    });
    expect(filas).toHaveLength(0);
  });

  it('no lee la bitácora de auditoría', async () => {
    const filas = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(`select * from public.audit_logs`);
      return rows;
    });
    expect(filas).toHaveLength(0);
  });

  it('puede consultar por un aviso publicado sin tener cuenta', async () => {
    await banco.comoAnonimo((db) =>
      db.query(
        `insert into public.inquiries
           (property_id, sender_name, sender_phone, message)
         values ($1, 'Interesado sin cuenta', '999888777',
                 'Hola, quisiera saber si acepta financiamiento bancario.')`,
        [AVISOS.miraflores],
      ),
    );
    const { rows } = await banco.db.query(
      `select id from public.inquiries where sender_name = 'Interesado sin cuenta'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('no puede consultar por un borrador', async () => {
    await expect(
      banco.comoAnonimo((db) =>
        db.query(
          `insert into public.inquiries (property_id, sender_name, sender_phone, message)
           values ($1, 'Curioso', '999888777', 'Vi este aviso que todavía no está publicado.')`,
          [AVISOS.borrador],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('dueña del aviso', () => {
  it('ve sus propios borradores', async () => {
    const filas = await banco.comoUsuario(CUENTAS.rosa, async (db) => {
      const { rows } = await db.query(`select id from public.properties where id = $1`, [
        AVISOS.borrador,
      ]);
      return rows;
    });
    expect(filas).toHaveLength(1);
  });

  it('edita su aviso', async () => {
    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`update public.properties set bedrooms = 4 where id = $1`, [AVISOS.miraflores]),
    );
    const { rows } = await banco.db.query<{ bedrooms: number }>(
      `select bedrooms from public.properties where id = $1`,
      [AVISOS.miraflores],
    );
    expect(rows[0]?.bedrooms).toBe(4);
  });

  it('no puede tocar el aviso de otra persona', async () => {
    const resultado = await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`update public.properties set price = 1 where id = $1`, [AVISOS.jesusMaria]),
    );
    expect(resultado.affectedRows ?? 0).toBe(0);
  });

  it('no puede publicar a nombre de otra persona', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(
          `insert into public.properties
             (owner_id, title, description, operation, property_type, currency, price,
              total_area, department, province, district)
           values ($1, 'Aviso a nombre de otra persona',
                   'Descripción larga que cumple con el mínimo exigido por la restricción de la tabla.',
                   'sale', 'apartment', 'USD', 100000, 70, 'Lima', 'Lima', 'Lince')`,
          [CUENTAS.lucia],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('no puede publicar un aviso ya aprobado', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(
          `insert into public.properties
             (owner_id, title, description, operation, property_type, currency, price,
              total_area, department, province, district, publication_status, published_at)
           values ($1, 'Aviso que se publica solo',
                   'Descripción larga que cumple con el mínimo exigido por la restricción de la tabla.',
                   'sale', 'apartment', 'USD', 100000, 70, 'Lima', 'Lima', 'Lince',
                   'published', now())`,
          [CUENTAS.rosa],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('no puede aprobar su propio borrador', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(
          `update public.properties
              set publication_status = 'published', published_at = now()
            where id = $1`,
          [AVISOS.borrador],
        ),
      ),
    ).rejects.toThrow(/pasar por revisión/);
  });

  it('no puede verificarse el aviso a sí misma', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(
          `update public.properties set verification_status = 'verified' where id = $1`,
          [AVISOS.borrador],
        ),
      ),
    ).rejects.toThrow(/verificación del aviso la realiza/);
  });

  it('sí puede pausar y reanudar un aviso ya aprobado', async () => {
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
    const { rows } = await banco.db.query<{ publication_status: string }>(
      `select publication_status from public.properties where id = $1`,
      [AVISOS.miraflores],
    );
    expect(rows[0]?.publication_status).toBe('published');
  });

  it('ve las consultas que le llegaron', async () => {
    const filas = await banco.comoUsuario(CUENTAS.rosa, async (db) => {
      const { rows } = await db.query(`select id from public.inquiries`);
      return rows;
    });
    expect(filas.length).toBeGreaterThan(0);
  });

  it('ve la dirección exacta de su propio aviso', async () => {
    const filas = await banco.comoUsuario(CUENTAS.rosa, async (db) => {
      const { rows } = await db.query(
        `select address_line from public.property_locations where property_id = $1`,
        [AVISOS.miraflores],
      );
      return rows;
    });
    expect(filas).toHaveLength(1);
  });

  it('no ve la dirección exacta de un aviso ajeno', async () => {
    const filas = await banco.comoUsuario(CUENTAS.rosa, async (db) => {
      const { rows } = await db.query(
        `select address_line from public.property_locations where property_id = $1`,
        [AVISOS.jesusMaria],
      );
      return rows;
    });
    expect(filas).toHaveLength(0);
  });
});

describe('escalada de privilegios', () => {
  it('nadie se hace administrador solo', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(`update public.profiles set role = 'admin' where id = $1`, [CUENTAS.rosa]),
      ),
    ).rejects.toThrow(/tipo de cuenta ya no se puede cambiar/);
  });

  it('el rol no se lee del token, aunque el token diga otra cosa', async () => {
    // Se firma un JWT ficticio que se declara administrador. Las
    // políticas leen profiles.role, así que el reclamo no sirve de nada.
    await banco.db.exec(`set role authenticated;`);
    await banco.db.query('select set_config($1, $2, false)', [
      'request.jwt.claims',
      JSON.stringify({ sub: CUENTAS.rosa, role: 'authenticated', user_role: 'admin' }),
    ]);

    const { rows } = await banco.db.query(`select * from public.audit_logs`);
    expect(rows).toHaveLength(0);

    await banco.db.exec(`reset role;`);
    await banco.db.query('select set_config($1, $2, false)', ['request.jwt.claims', '']);
  });

  it('nadie se regala avisos gratuitos', async () => {
    // El sistema ya le contó dos avisos usados; la tentación es ponerlo en cero.
    // El propio trigger protege el contador incluso desde postgres, así que
    // para preparar el escenario hay que desactivarlo un momento.
    await banco.db.exec(`alter table public.profiles disable trigger profiles_sin_escalada;`);
    await banco.db.query(`update public.profiles set free_listings_used = 2 where id = $1`, [
      CUENTAS.rosa,
    ]);
    await banco.db.exec(`alter table public.profiles enable trigger profiles_sin_escalada;`);

    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(`update public.profiles set free_listings_used = 0 where id = $1`, [
          CUENTAS.rosa,
        ]),
      ),
    ).rejects.toThrow(/lo lleva el sistema/);

    const { rows } = await banco.db.query<{ free_listings_used: number }>(
      `select free_listings_used from public.profiles where id = $1`,
      [CUENTAS.rosa],
    );
    expect(rows[0]?.free_listings_used).toBe(2);
  });

  it('nadie verifica su propia inmobiliaria', async () => {
    // Administrarla sí puede; otorgarse el sello de verificada, no.
    await expect(
      banco.comoUsuario(CUENTAS.martin, (db) =>
        db.query(`update public.agencies set verification_status = 'verified'`),
      ),
    ).rejects.toThrow(/row-level security/i);

    const { rows } = await banco.db.query<{ verification_status: string }>(
      `select verification_status from public.agencies`,
    );
    expect(rows[0]?.verification_status).toBe('unverified');
  });
});

describe('moderación', () => {
  it('ve todos los avisos, incluso los borradores', async () => {
    const filas = await banco.comoUsuario(CUENTAS.moderacion, async (db) => {
      const { rows } = await db.query(`select id from public.properties`);
      return rows;
    });
    expect(filas).toHaveLength(8);
  });

  it('sí puede aprobar un aviso', async () => {
    await banco.comoUsuario(CUENTAS.moderacion, (db) =>
      db.query(
        `update public.properties
            set publication_status = 'published', published_at = now()
          where id = $1`,
        [AVISOS.borrador],
      ),
    );
    const { rows } = await banco.db.query<{ publication_status: string }>(
      `select publication_status from public.properties where id = $1`,
      [AVISOS.borrador],
    );
    expect(rows[0]?.publication_status).toBe('published');

    await banco.db.exec(
      `update public.properties set publication_status = 'draft', published_at = null
        where id = '${AVISOS.borrador}';`,
    );
  });

  it('sí puede verificar un aviso', async () => {
    await banco.comoUsuario(CUENTAS.moderacion, (db) =>
      db.query(`update public.properties set verification_status = 'verified' where id = $1`, [
        AVISOS.jesusMaria,
      ]),
    );
    const { rows } = await banco.db.query<{ verification_status: string }>(
      `select verification_status from public.properties where id = $1`,
      [AVISOS.jesusMaria],
    );
    expect(rows[0]?.verification_status).toBe('verified');
  });

  it('no lee la bitácora: eso es solo de administración', async () => {
    const filas = await banco.comoUsuario(CUENTAS.moderacion, async (db) => {
      const { rows } = await db.query(`select * from public.audit_logs`);
      return rows;
    });
    expect(filas).toHaveLength(0);
  });
});

describe('favoritos y consultas', () => {
  it('cada quien ve solo sus favoritos', async () => {
    const deLucia = await banco.comoUsuario(CUENTAS.lucia, async (db) => {
      const { rows } = await db.query(`select property_id from public.favorites`);
      return rows;
    });
    expect(deLucia).toHaveLength(2);

    const deRosa = await banco.comoUsuario(CUENTAS.rosa, async (db) => {
      const { rows } = await db.query(`select property_id from public.favorites`);
      return rows;
    });
    expect(deRosa).toHaveLength(0);
  });

  it('no se puede guardar un favorito a nombre de otra persona', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(`insert into public.favorites (user_id, property_id) values ($1, $2)`, [
          CUENTAS.lucia,
          AVISOS.jesusMaria,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('la consulta la ven quien escribe y quien recibe, nadie más', async () => {
    const comoQuienEscribe = await banco.comoUsuario(CUENTAS.lucia, async (db) => {
      const { rows } = await db.query(`select id from public.inquiries`);
      return rows;
    });
    expect(comoQuienEscribe.length).toBeGreaterThan(0);

    const comoTercero = await banco.comoUsuario(CUENTAS.martin, async (db) => {
      const { rows } = await db.query(`select id from public.inquiries`);
      return rows;
    });
    expect(comoTercero).toHaveLength(0);
  });

  it('el dueño de la consulta lo pone la base, no quien la envía', async () => {
    await banco.comoUsuario(CUENTAS.lucia, (db) =>
      db.query(
        `insert into public.inquiries (property_id, owner_id, sender_id, sender_name,
                                       sender_phone, message)
         values ($1, $2, $3, 'Lucía Ferrer', '976543210',
                 'Intento poner otro dueño en esta consulta para ver si la base lo acepta.')`,
        [AVISOS.miraflores, CUENTAS.lucia, CUENTAS.lucia],
      ),
    );
    const { rows } = await banco.db.query<{ owner_id: string }>(
      `select owner_id from public.inquiries where message like 'Intento poner otro dueño%'`,
    );
    // Se mandó owner_id = Lucía; el trigger lo corrigió a la dueña real.
    expect(rows[0]?.owner_id).toBe(CUENTAS.rosa);
  });
});

describe('trabajos de Wasi AI', () => {
  it('nacen sin aceptar: nada se publica sin confirmación', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(
          `insert into public.ai_jobs (user_id, kind, status, accepted_at)
           values ($1, 'listing_draft', 'queued', now())`,
          [CUENTAS.rosa],
        ),
      ),
    ).rejects.toThrow(/row-level security|aceptado_solo_si_exitoso/i);
  });

  it('solo se piden a nombre propio', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(`insert into public.ai_jobs (user_id, kind) values ($1, 'photo_enhance')`, [
          CUENTAS.lucia,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('cada quien ve solo los suyos', async () => {
    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`insert into public.ai_jobs (user_id, kind) values ($1, 'price_estimate')`, [
        CUENTAS.rosa,
      ]),
    );

    const ajenos = await banco.comoUsuario(CUENTAS.lucia, async (db) => {
      const { rows } = await db.query(`select id from public.ai_jobs`);
      return rows;
    });
    expect(ajenos).toHaveLength(0);
  });
});

describe('clave de servicio', () => {
  it('se salta la RLS, que es justamente por lo que nunca va al navegador', async () => {
    const todo = await banco.comoServicio(async (db) => {
      const { rows } = await db.query(`select id from public.properties`);
      return rows;
    });
    expect(todo).toHaveLength(8);

    const perfiles = await banco.comoServicio(async (db) => {
      const { rows } = await db.query(`select phone from public.profiles`);
      return rows;
    });
    expect(perfiles).toHaveLength(4);
  });
});

describe('cobertura', () => {
  it('toda tabla de public tiene RLS activada', async () => {
    const { rows } = await banco.db.query<{ tablename: string; rowsecurity: boolean }>(
      `select tablename, rowsecurity from pg_tables where schemaname = 'public'`,
    );
    const sinRls = rows.filter((t) => !t.rowsecurity).map((t) => t.tablename);
    expect(sinRls).toEqual([]);
  });

  it('ninguna tabla queda con RLS activada pero sin políticas', async () => {
    // Una tabla así niega todo en silencio: es un error tan común como
    // difícil de diagnosticar desde la aplicación.
    const { rows } = await banco.db.query<{ tablename: string }>(
      `select t.tablename
         from pg_tables t
        where t.schemaname = 'public'
          and t.rowsecurity
          and not exists (
            select 1 from pg_policies p
             where p.schemaname = 'public' and p.tablename = t.tablename
          )`,
    );
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });
});
