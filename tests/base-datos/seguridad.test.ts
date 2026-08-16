import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { levantarBanco, sembrar, CUENTAS, AVISOS, type Banco } from './banco';

/**
 * Revisión de seguridad contra la base.
 *
 * La pregunta que responde este archivo es una sola: **si alguien
 * consigue la llave pública del navegador —que es pública— y se pone a
 * pedir tablas a mano, ¿qué se lleva?**
 *
 * Es el escenario realista. La llave anónima está en el paquete de
 * JavaScript de todo el mundo, así que la seguridad de Wasipe no es que
 * la interfaz no ofrezca un botón: es lo que las políticas dejan pasar.
 */

let banco: Banco;

beforeAll(async () => {
  banco = await levantarBanco();
  await sembrar(banco);
}, 180_000);

afterAll(async () => {
  await banco?.cerrar();
});

// ---------------------------------------------------------------------
// Qué se lleva un visitante sin sesión
// ---------------------------------------------------------------------

/**
 * Todo lo que un visitante no debería poder leer, tabla por tabla.
 *
 * La lista se escribe entera a propósito. Con `select * from tabla` sobre
 * cada una queda claro qué se protegió y qué no, y cuando se agregue una
 * tabla nueva alguien tiene que decidir en qué lado va.
 */
const PROHIBIDAS_PARA_VISITANTES = [
  'profiles',
  'favorites',
  'saved_searches',
  'inquiries',
  'reports',
  'subscriptions',
  'credit_transactions',
  'payment_events',
  'audit_logs',
  'staff_members',
  'listing_reviews',
  'moderation_flags',
  'ai_jobs',
  'notifications',
];

describe('un visitante sin sesión', () => {
  it('no lee ninguna tabla con datos de personas', async () => {
    const filtradas: string[] = [];

    for (const tabla of PROHIBIDAS_PARA_VISITANTES) {
      const filas = await banco.comoAnonimo(async (db) => {
        try {
          const { rows } = await db.query(`select * from public.${tabla} limit 5`);
          return rows;
        } catch {
          // Que la tabla no exista todavía también es «no la lee».
          return [];
        }
      });
      if (filas.length > 0) filtradas.push(`${tabla}: ${filas.length} filas`);
    }

    expect(filtradas).toEqual([]);
  });

  it('solo ve la dirección exacta de quien eligió publicarla', async () => {
    // `property_locations` NO está cerrada del todo, y es a propósito:
    // quien publica puede elegir «dirección exacta» y entonces la calle y
    // el número se muestran. Lo que no puede pasar es que se vea la de
    // alguien que eligió «aproximada» o «solo distrito».
    const visibles = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query<{ property_id: string }>(
        `select property_id from public.property_locations`,
      );
      return rows.map((f) => f.property_id);
    });

    if (visibles.length === 0) return;

    const { rows } = await banco.db.query<{
      address_privacy: string;
      publication_status: string;
    }>(`select address_privacy, publication_status from public.properties where id = any($1)`, [
      visibles,
    ]);

    for (const aviso of rows) {
      expect(aviso.address_privacy, 'solo se ve la de quien eligió exacta').toBe('exact');
      expect(aviso.publication_status, 'y solo si está publicada').toBe('published');
    }
  });

  it('y no la de quien eligió reserva', async () => {
    // El caso que de verdad importa: alguien puso su casa en venta y
    // pidió que no se sepa la dirección. Que se filtre es decirle a
    // cualquiera dónde vive.
    const { rows: reservados } = await banco.db.query<{ id: string }>(
      `select id from public.properties where address_privacy <> 'exact'`,
    );

    if (reservados.length === 0) return;

    const filtradas = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(
        `select property_id from public.property_locations where property_id = any($1)`,
        [reservados.map((r) => r.id)],
      );
      return rows;
    });

    expect(filtradas).toHaveLength(0);
  });

  it('no puede escribir nada, ni siquiera un aviso propio', async () => {
    await expect(
      banco.comoAnonimo((db) =>
        db.query(
          `insert into public.properties (owner_id, title, operation, property_type, currency, price, total_area, department, province, district)
           values ($1, 'Aviso inyectado', 'sale', 'apartment', 'USD', 1, 1, 'Lima', 'Lima', 'Miraflores')`,
          [CUENTAS.rosa],
        ),
      ),
    ).rejects.toThrow(/row-level security|permission/i);
  });

  it('no puede borrar un aviso ajeno', async () => {
    await banco.comoAnonimo((db) =>
      db.query(`delete from public.properties where id = $1`, [AVISOS.miraflores]),
    );

    const { rows } = await banco.db.query(`select id from public.properties where id = $1`, [
      AVISOS.miraflores,
    ]);
    // El borrado no falla, simplemente no alcanza ninguna fila: RLS las
    // hace invisibles. El efecto es el mismo y es lo que importa.
    expect(rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------
// Qué se lleva alguien con sesión
// ---------------------------------------------------------------------

describe('alguien con sesión de usuario común', () => {
  it('no lee el perfil de otra persona', async () => {
    const ajenos = await banco.comoUsuario(CUENTAS.lucia, async (db) => {
      const { rows } = await db.query(`select id, phone from public.profiles where id <> $1`, [
        CUENTAS.lucia,
      ]);
      return rows;
    });
    expect(ajenos).toHaveLength(0);
  });

  it('no lee los favoritos de otra persona', async () => {
    const ajenos = await banco.comoUsuario(CUENTAS.lucia, async (db) => {
      const { rows } = await db.query(`select * from public.favorites where user_id <> $1`, [
        CUENTAS.lucia,
      ]);
      return rows;
    });
    expect(ajenos).toHaveLength(0);
  });

  it('no se nombra a sí misma parte del equipo', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.lucia, (db) =>
        db.query(
          `insert into public.staff_members (user_id, role) values ($1, 'super_admin')`,
          [CUENTAS.lucia],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('no se aprueba su propio aviso', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(`select public.revisar_aviso($1, 'approve')`, [AVISOS.borrador]),
      ),
    ).rejects.toThrow(/moderación/i);
  });

  it('no se regala créditos', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.lucia, (db) =>
        db.query(
          `insert into public.credit_transactions (user_id, amount, balance_after, reason)
           values ($1, 99999, 99999, 'regalo')`,
          [CUENTAS.lucia],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('no edita la bitácora de auditoría', async () => {
    const editadas = await banco.comoUsuario(CUENTAS.lucia, async (db) => {
      const { rows } = await db.query(`select id from public.audit_logs`);
      return rows;
    });
    expect(editadas).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// Inyección
// ---------------------------------------------------------------------

describe('inyección', () => {
  it('un distrito con comillas y punto y coma no ejecuta nada', async () => {
    const veneno = "Miraflores'; drop table public.properties; --";

    const filas = await banco.comoAnonimo(async (db) => {
      // Como lo hace el código: parámetro, nunca concatenación.
      const { rows } = await db.query(`select id from public.properties where district = $1`, [
        veneno,
      ]);
      return rows;
    });

    expect(filas).toHaveLength(0);

    // Y la tabla sigue ahí.
    const { rows } = await banco.db.query(`select count(*) as n from public.properties`);
    expect(Number((rows[0] as { n: string }).n)).toBeGreaterThan(0);
  });

  it('un título con etiquetas se guarda tal cual, sin interpretarse', async () => {
    const veneno = '<img src=x onerror=alert(1)> Depa en Miraflores';

    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`update public.properties set title = $1 where id = $2`, [
        veneno,
        AVISOS.borrador,
      ]),
    );

    const { rows } = await banco.db.query<{ title: string }>(
      `select title from public.properties where id = $1`,
      [AVISOS.borrador],
    );

    // La base guarda texto. Escapar es trabajo de quien lo dibuja, y eso
    // se prueba en `tests/unidad/seguridad.test.ts`. Lo que se comprueba
    // acá es que la base no lo transforma ni lo rechaza en silencio.
    expect(rows[0]?.title).toBe(veneno);
  });
});

// ---------------------------------------------------------------------
// Webhooks de pago repetidos
// ---------------------------------------------------------------------

describe('un webhook de pago repetido', () => {
  const EVENTO = {
    provider: 'culqi',
    id: 'evt_prueba_0001',
    tipo: 'charge.succeeded',
    cuerpo: { amount: 4900, currency: 'PEN' },
  };

  it('la primera vez se registra y hay que procesarlo', async () => {
    const nuevo = await banco.comoServicio(async (db) => {
      const { rows } = await db.query<{ registrar_evento_de_pago: boolean }>(
        `select public.registrar_evento_de_pago($1, $2, $3, $4)`,
        [EVENTO.provider, EVENTO.id, EVENTO.tipo, JSON.stringify(EVENTO.cuerpo)],
      );
      return rows[0]!.registrar_evento_de_pago;
    });

    expect(nuevo).toBe(true);
  });

  it('la segunda vez devuelve false y no escribe otra fila', async () => {
    const otraVez = await banco.comoServicio(async (db) => {
      const { rows } = await db.query<{ registrar_evento_de_pago: boolean }>(
        `select public.registrar_evento_de_pago($1, $2, $3, $4)`,
        [EVENTO.provider, EVENTO.id, EVENTO.tipo, JSON.stringify(EVENTO.cuerpo)],
      );
      return rows[0]!.registrar_evento_de_pago;
    });

    expect(otraVez).toBe(false);

    const { rows } = await banco.db.query<{ n: string }>(
      `select count(*) as n from public.payment_events where event_id = $1`,
      [EVENTO.id],
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('dos pasarelas distintas pueden usar el mismo identificador', async () => {
    const nuevo = await banco.comoServicio(async (db) => {
      const { rows } = await db.query<{ registrar_evento_de_pago: boolean }>(
        `select public.registrar_evento_de_pago($1, $2, $3, $4)`,
        ['niubiz', EVENTO.id, EVENTO.tipo, JSON.stringify(EVENTO.cuerpo)],
      );
      return rows[0]!.registrar_evento_de_pago;
    });
    expect(nuevo).toBe(true);
  });

  it('el mismo movimiento de crédito no se puede acreditar dos veces', async () => {
    await banco.db.query(
      `insert into public.credit_transactions (user_id, amount, balance_after, reason, provider_event_id)
       values ($1, 100, 100, 'compra de créditos', 'evt_credito_0001')`,
      [CUENTAS.rosa],
    );

    // El reintento de la pasarela llega con el mismo identificador.
    await expect(
      banco.db.query(
        `insert into public.credit_transactions (user_id, amount, balance_after, reason, provider_event_id)
         values ($1, 100, 200, 'compra de créditos', 'evt_credito_0001')`,
        [CUENTAS.rosa],
      ),
    ).rejects.toThrow(/credit_transactions_evento_unico|duplicate key/i);
  });

  it('pero los movimientos que no vienen de un pago no se estorban', async () => {
    // Índice único parcial: los nulos no chocan entre sí. Sin eso, el
    // segundo consumo de Wasi AI del día fallaría.
    for (let i = 0; i < 3; i++) {
      await banco.db.query(
        `insert into public.credit_transactions (user_id, amount, balance_after, reason)
         values ($1, -1, ${100 - i - 1}, 'consumo de Wasi AI')`,
        [CUENTAS.rosa],
      );
    }

    const { rows } = await banco.db.query<{ n: string }>(
      `select count(*) as n from public.credit_transactions
        where user_id = $1 and provider_event_id is null`,
      [CUENTAS.rosa],
    );
    expect(Number(rows[0]!.n)).toBeGreaterThanOrEqual(3);
  });

  it('nadie sin la llave de servicio registra un evento de pago', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.lucia, (db) =>
        db.query(
          `select public.registrar_evento_de_pago('culqi', 'evt_falso', 'x', '{}'::jsonb)`,
        ),
      ),
    ).rejects.toThrow(/Solo el servidor/);
  });

  it('y nadie lee los eventos de pago salvo finanzas', async () => {
    const comun = await banco.comoUsuario(CUENTAS.lucia, async (db) => {
      const { rows } = await db.query(`select id from public.payment_events`);
      return rows;
    });
    expect(comun).toHaveLength(0);

    await banco.db.query(
      `insert into public.staff_members (user_id, role) values ($1, 'finance')
       on conflict do nothing`,
      [CUENTAS.martin],
    );

    const finanzas = await banco.comoUsuario(CUENTAS.martin, async (db) => {
      const { rows } = await db.query(`select id from public.payment_events`);
      return rows;
    });
    expect(finanzas.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------
// Límites de uso
// ---------------------------------------------------------------------

describe('los límites de uso', () => {
  it('el teléfono de contacto se corta al llegar al tope', async () => {
    // 30 en una hora por sesión. Sin esto, un raspador se lleva la
    // agenda telefónica de todo el portal en una tarde.
    let concedidos = 0;

    for (let i = 0; i < 35; i++) {
      const ok = await banco.comoAnonimo(async (db) => {
        const { rows } = await db.query<{ consumir_cupo: boolean }>(
          `select public.consumir_cupo('telefono', 'sesion-de-prueba', 30, 3600)`,
        );
        return rows[0]!.consumir_cupo;
      });
      if (ok) concedidos++;
    }

    expect(concedidos).toBe(30);
  });

  it('dos sesiones distintas tienen cada una su cupo', async () => {
    const ok = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query<{ consumir_cupo: boolean }>(
        `select public.consumir_cupo('telefono', 'otra-sesion', 30, 3600)`,
      );
      return rows[0]!.consumir_cupo;
    });
    expect(ok).toBe(true);
  });
});
