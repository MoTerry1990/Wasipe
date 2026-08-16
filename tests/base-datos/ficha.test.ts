import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { levantarBanco, sembrar, CUENTAS, AVISOS, type Banco } from './banco';

/**
 * Contactos, teléfono, eventos y límite de envíos.
 *
 * Lo que se comprueba acá es lo que sostiene la privacidad de la ficha:
 * que el teléfono no se pueda listar, que el contacto le llegue a quien
 * corresponde, y que las estadísticas no guarden datos personales.
 */

let banco: Banco;

beforeAll(async () => {
  banco = await levantarBanco();
  await sembrar(banco);
}, 180_000);

afterAll(async () => {
  await banco?.cerrar();
});

describe('el teléfono no se puede listar', () => {
  it('un visitante sin sesión no lee ningún teléfono de profiles', async () => {
    const filas = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(`select phone, whatsapp from public.profiles`);
      return rows;
    });
    // Cero: la RLS de profiles no expone a nadie.
    expect(filas).toHaveLength(0);
  });

  it('la vista pública del anunciante no trae teléfono ni correo', async () => {
    const { rows } = await banco.db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_name = 'anunciantes'`,
    );
    const columnas = rows.map((r) => r.column_name);
    expect(columnas).not.toContain('phone');
    expect(columnas).not.toContain('whatsapp');
    expect(columnas).not.toContain('email');
  });

  it('la función lo entrega de a uno, para un aviso publicado', async () => {
    const filas = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query<{ telefono: string; nombre: string }>(
        `select * from public.telefono_de_contacto($1, 'sesion-de-prueba')`,
        [AVISOS.miraflores],
      );
      return rows;
    });

    expect(filas).toHaveLength(1);
    expect(filas[0]?.telefono).toBe('987654321');
    expect(filas[0]?.nombre).toBe('Rosa Quispe');
  });

  it('no devuelve nada para un aviso en borrador', async () => {
    const filas = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(
        `select * from public.telefono_de_contacto($1, 'sesion-de-prueba')`,
        [AVISOS.borrador],
      );
      return rows;
    });
    expect(filas).toHaveLength(0);
  });

  it('deja el pedido anotado como evento', async () => {
    const { rows } = await banco.db.query<{ n: number }>(
      `select count(*)::int as n from public.lead_events
        where property_id = $1 and kind = 'phone_reveal'`,
      [AVISOS.miraflores],
    );
    expect(rows[0]!.n).toBeGreaterThan(0);
  });

  it('si el aviso es de una inmobiliaria, el contacto es el de la empresa', async () => {
    const filas = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query<{ nombre: string; telefono: string }>(
        `select * from public.telefono_de_contacto($1, 'otra-sesion')`,
        [AVISOS.sanIsidro],
      );
      return rows;
    });
    expect(filas[0]?.nombre).toBe('Inmobiliaria Costa Verde');
    expect(filas[0]?.telefono).toBe('014567890');
  });
});

describe('límite de envíos', () => {
  it('deja pasar hasta el límite y después corta', async () => {
    const resultados: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const { rows } = await banco.db.query<{ consumir_cupo: boolean }>(
        `select public.consumir_cupo('prueba', 'sesion-a', 3, 3600)`,
      );
      resultados.push(rows[0]!.consumir_cupo);
    }
    expect(resultados).toEqual([true, true, true, false]);
  });

  it('cada sesión tiene su propio cupo', async () => {
    const { rows } = await banco.db.query<{ consumir_cupo: boolean }>(
      `select public.consumir_cupo('prueba', 'sesion-b', 3, 3600)`,
    );
    expect(rows[0]!.consumir_cupo).toBe(true);
  });

  it('la tabla de cupos no se puede leer ni escribir desde el cliente', async () => {
    // RLS activa y sin políticas: nadie entra. El único acceso es la
    // función, que es SECURITY DEFINER.
    const filas = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(`select * from public.rate_limits`);
      return rows;
    });
    expect(filas).toHaveLength(0);

    await expect(
      banco.comoAnonimo((db) =>
        db.query(
          `insert into public.rate_limits (bucket, clave, ventana, usos)
           values ('trampa', 'x', now(), -999)`,
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('eventos de la ficha', () => {
  it('se anotan sin ningún dato personal', async () => {
    await banco.comoAnonimo((db) =>
      db.query(`select public.registrar_evento($1, 'whatsapp', 'hash-de-sesion', 'ficha')`, [
        AVISOS.miraflores,
      ]),
    );

    const { rows } = await banco.db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_name = 'lead_events'`,
    );
    const columnas = rows.map((r) => r.column_name);

    // Ni IP, ni correo, ni teléfono, ni identificador de persona.
    for (const prohibida of ['ip', 'email', 'phone', 'user_id', 'viewer_id']) {
      expect(columnas, `lead_events no debería tener ${prohibida}`).not.toContain(prohibida);
    }
  });

  it('un aviso en borrador no acepta eventos', async () => {
    await banco.comoAnonimo((db) =>
      db.query(`select public.registrar_evento($1, 'share', 'hash', 'ficha')`, [
        AVISOS.borrador,
      ]),
    );

    const { rows } = await banco.db.query<{ n: number }>(
      `select count(*)::int as n from public.lead_events where property_id = $1`,
      [AVISOS.borrador],
    );
    expect(rows[0]!.n).toBe(0);
  });

  it('solo el anunciante ve la actividad de su aviso', async () => {
    const propia = await banco.comoUsuario(CUENTAS.rosa, async (db) => {
      const { rows } = await db.query(`select id from public.lead_events`);
      return rows;
    });
    expect(propia.length).toBeGreaterThan(0);

    const ajena = await banco.comoUsuario(CUENTAS.lucia, async (db) => {
      const { rows } = await db.query(`select id from public.lead_events`);
      return rows;
    });
    expect(ajena).toHaveLength(0);

    const anonima = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(`select id from public.lead_events`);
      return rows;
    });
    expect(anonima).toHaveLength(0);
  });
});

describe('pedidos de visita', () => {
  it('llegan a quien publica, aunque el cliente mande otro dueño', async () => {
    const manana = new Date(Date.now() + 86_400_000).toISOString();

    await banco.comoUsuario(CUENTAS.lucia, (db) =>
      db.query(
        `insert into public.inquiries
           (property_id, owner_id, sender_id, sender_name, sender_phone, message, kind, preferred_visit_at)
         values ($1, $2, $2, 'Lucía Ferrer', '976543210',
                 'Quisiera visitarlo el sábado por la mañana si se puede.', 'visit', $3)`,
        [AVISOS.miraflores, CUENTAS.lucia, manana],
      ),
    );

    const { rows } = await banco.db.query<{ owner_id: string; kind: string }>(
      `select owner_id, kind from public.inquiries where kind = 'visit'`,
    );

    // Se mandó owner_id = Lucía; el trigger lo corrigió a la dueña real.
    expect(rows[0]?.owner_id).toBe(CUENTAS.rosa);
    expect(rows[0]?.kind).toBe('visit');
  });

  it('una visita sin fecha no se guarda', async () => {
    await expect(
      banco.db.query(
        `insert into public.inquiries
           (property_id, sender_name, sender_phone, message, kind)
         values ($1, 'Alguien', '999888777',
                 'Quiero visitar la propiedad cuando se pueda.', 'visit')`,
        [AVISOS.miraflores],
      ),
    ).rejects.toThrow(/visita_con_fecha/);
  });
});

describe('propiedades parecidas', () => {
  it('el índice que las sostiene existe', async () => {
    const { rows } = await banco.db.query<{ indexname: string }>(
      `select indexname from pg_indexes where tablename = 'properties'`,
    );
    expect(rows.map((r) => r.indexname)).toContain('properties_parecidas_idx');
  });

  it('la consulta se queda en el mismo distrito, tipo y rango de precio', async () => {
    const { rows } = await banco.db.query<{ id: string; district: string; price_usd: string }>(
      `select id, district, price_usd from public.properties
        where publication_status = 'published' and status = 'available'
          and operation = 'sale' and property_type = 'apartment'
          and district = 'Miraflores'
          and id <> $1
          and price_usd between 195000 * 0.65 and 195000 * 1.35`,
      [AVISOS.miraflores],
    );

    // La semilla no tiene otro departamento en Miraflores en ese rango:
    // lo que importa es que el de San Isidro (US$ 420,000) NO aparezca.
    expect(rows.every((f) => f.district === 'Miraflores')).toBe(true);
    expect(rows.map((f) => f.id)).not.toContain(AVISOS.sanIsidro);
  });
});
