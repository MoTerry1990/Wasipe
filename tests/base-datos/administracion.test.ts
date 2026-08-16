import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { levantarBanco, sembrar, CUENTAS, AVISOS, type Banco } from './banco';

/**
 * Administración y moderación contra la base de verdad.
 *
 * Las seis promesas del sprint se comprueban acá, porque es donde de
 * verdad se cumplen: quien no es del equipo no llega a los datos, cada
 * decisión queda escrita y no se puede borrar, un aviso rechazado deja de
 * ser público, y ninguna decisión que le duela a alguien se puede tomar
 * sin escribir por qué.
 */

let banco: Banco;

/** Alguien del equipo, con el puesto que se le dé. */
async function nombrar(usuario: string, puesto: string) {
  await banco.db.query(
    `insert into public.staff_members (user_id, role) values ($1, $2::public.staff_role)
     on conflict do nothing`,
    [usuario, puesto],
  );
}

async function quitar(usuario: string) {
  await banco.db.query(`delete from public.staff_members where user_id = $1`, [usuario]);
}

beforeAll(async () => {
  banco = await levantarBanco();
  await sembrar(banco);
  // Martín es moderador; Lucía no es del equipo.
  await nombrar(CUENTAS.martin, 'moderator');
}, 180_000);

afterAll(async () => {
  await banco?.cerrar();
});

// ---------------------------------------------------------------------
// Quien no es del equipo no llega
// ---------------------------------------------------------------------

describe('separación de funciones', () => {
  it('quien no es del equipo no ve las banderas', async () => {
    await banco.db.query(
      `insert into public.moderation_flags (property_id, kind, score)
       values ($1, 'manual', 50) on conflict do nothing`,
      [AVISOS.miraflores],
    );

    const visibles = await banco.comoUsuario(CUENTAS.lucia, async (db) => {
      const { rows } = await db.query(`select id from public.moderation_flags`);
      return rows;
    });
    expect(visibles).toHaveLength(0);
  });

  it('ni las ve un visitante sin sesión', async () => {
    const visibles = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(`select id from public.moderation_flags`);
      return rows;
    });
    expect(visibles).toHaveLength(0);
  });

  it('moderación sí', async () => {
    const visibles = await banco.comoUsuario(CUENTAS.martin, async (db) => {
      const { rows } = await db.query(`select id from public.moderation_flags`);
      return rows;
    });
    expect(visibles.length).toBeGreaterThan(0);
  });

  it('quien no es del equipo no lee la bitácora', async () => {
    const visibles = await banco.comoUsuario(CUENTAS.lucia, async (db) => {
      const { rows } = await db.query(`select id from public.audit_logs`);
      return rows;
    });
    expect(visibles).toHaveLength(0);
  });

  it('moderación no ve los créditos de nadie: no es lo suyo', async () => {
    await banco.db.query(
      `insert into public.credit_transactions (user_id, amount, balance_after, reason)
       values ($1, 10, 10, 'carga de prueba')`,
      [CUENTAS.rosa],
    );

    const visibles = await banco.comoUsuario(CUENTAS.martin, async (db) => {
      const { rows } = await db.query(
        `select id from public.credit_transactions where user_id = $1`,
        [CUENTAS.rosa],
      );
      return rows;
    });
    expect(visibles).toHaveLength(0);
  });

  it('finanzas sí', async () => {
    await nombrar(CUENTAS.lucia, 'finance');

    const visibles = await banco.comoUsuario(CUENTAS.lucia, async (db) => {
      const { rows } = await db.query(
        `select id from public.credit_transactions where user_id = $1`,
        [CUENTAS.rosa],
      );
      return rows;
    });
    expect(visibles.length).toBeGreaterThan(0);

    await quitar(CUENTAS.lucia);
  });

  it('solo administración general nombra personal', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.martin, (db) =>
        db.query(`insert into public.staff_members (user_id, role) values ($1, 'moderator')`, [
          CUENTAS.rosa,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('y quien la tiene, sí', async () => {
    await nombrar(CUENTAS.moderacion, 'super_admin');

    await banco.comoUsuario(CUENTAS.moderacion, (db) =>
      db.query(`insert into public.staff_members (user_id, role) values ($1, 'support')`, [
        CUENTAS.rosa,
      ]),
    );

    const { rows } = await banco.db.query(
      `select role from public.staff_members where user_id = $1`,
      [CUENTAS.rosa],
    );
    expect(rows).toHaveLength(1);

    await quitar(CUENTAS.rosa);
  });
});

// ---------------------------------------------------------------------
// Toda decisión queda escrita
// ---------------------------------------------------------------------

describe('revisar un aviso', () => {
  it('quien no es moderador no revisa nada', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(`select public.revisar_aviso($1, 'approve')`, [AVISOS.borrador]),
      ),
    ).rejects.toThrow(/Solo el equipo de moderación/);
  });

  it('rechazar sin motivo no se puede', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.martin, (db) =>
        db.query(`select public.revisar_aviso($1, 'reject', 'no va')`, [AVISOS.borrador]),
      ),
    ).rejects.toThrow(/Explica en una frase por qué/);
  });

  it('rechazar con motivo deja el aviso rechazado y el motivo a la vista', async () => {
    await banco.comoUsuario(CUENTAS.martin, (db) =>
      db.query(`select public.revisar_aviso($1, 'reject', $2)`, [
        AVISOS.borrador,
        'Las fotos 2 y 3 son de otro departamento.',
      ]),
    );

    const { rows } = await banco.db.query<{
      publication_status: string;
      rejection_reason: string;
      reviewed_by: string;
    }>(
      `select publication_status, rejection_reason, reviewed_by
         from public.properties where id = $1`,
      [AVISOS.borrador],
    );

    expect(rows[0]?.publication_status).toBe('rejected');
    expect(rows[0]?.rejection_reason).toContain('otro departamento');
    expect(rows[0]?.reviewed_by).toBe(CUENTAS.martin);
  });

  it('y queda la decisión escrita, con quién la tomó', async () => {
    const { rows } = await banco.db.query<{ decision: string; reviewer_id: string }>(
      `select decision, reviewer_id from public.listing_reviews
        where property_id = $1 order by id desc limit 1`,
      [AVISOS.borrador],
    );
    expect(rows[0]?.decision).toBe('reject');
    expect(rows[0]?.reviewer_id).toBe(CUENTAS.martin);
  });

  it('y también en la bitácora de auditoría', async () => {
    const { rows } = await banco.db.query<{ n: string }>(
      `select count(*) as n from public.audit_logs
        where action = 'revisar_aviso' and entity_id = $1`,
      [AVISOS.borrador],
    );
    expect(Number(rows[0]!.n)).toBeGreaterThan(0);
  });

  it('un aviso rechazado deja de ser público', async () => {
    const visibles = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(`select id from public.properties where id = $1`, [
        AVISOS.borrador,
      ]);
      return rows;
    });
    expect(visibles).toHaveLength(0);
  });

  it('pedir cambios lo devuelve a borrador, que es desde donde se corrige', async () => {
    await banco.comoUsuario(CUENTAS.martin, (db) =>
      db.query(`select public.revisar_aviso($1, 'request_changes', $2)`, [
        AVISOS.borrador,
        'Falta el área techada y el precio parece un cero de más.',
      ]),
    );

    const { rows } = await banco.db.query<{ publication_status: string }>(
      `select publication_status from public.properties where id = $1`,
      [AVISOS.borrador],
    );
    expect(rows[0]?.publication_status).toBe('draft');
  });

  it('pausar saca el aviso de circulación', async () => {
    await banco.comoUsuario(CUENTAS.martin, (db) =>
      db.query(`select public.revisar_aviso($1, 'pause', $2)`, [
        AVISOS.miraflores,
        'Nos llegaron dos denuncias por el precio; lo miramos.',
      ]),
    );

    const visibles = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(`select id from public.properties where id = $1`, [
        AVISOS.miraflores,
      ]);
      return rows;
    });
    expect(visibles).toHaveLength(0);
  });

  it('aprobar sí puede ir sin motivo', async () => {
    await banco.comoUsuario(CUENTAS.martin, (db) =>
      db.query(`select public.revisar_aviso($1, 'approve')`, [AVISOS.miraflores]),
    );

    const { rows } = await banco.db.query<{ publication_status: string }>(
      `select publication_status from public.properties where id = $1`,
      [AVISOS.miraflores],
    );
    expect(rows[0]?.publication_status).toBe('published');
  });

  it('quien publica ve las decisiones sobre su aviso', async () => {
    const suyas = await banco.comoUsuario(CUENTAS.rosa, async (db) => {
      const { rows } = await db.query<{ decision: string; reason: string }>(
        `select decision, reason from public.listing_reviews where property_id = $1`,
        [AVISOS.miraflores],
      );
      return rows;
    });
    expect(suyas.length).toBeGreaterThan(0);
    expect(suyas.some((r) => r.reason?.includes('denuncias'))).toBe(true);
  });

  it('pero no las de un aviso ajeno', async () => {
    const ajenas = await banco.comoUsuario(CUENTAS.lucia, async (db) => {
      const { rows } = await db.query(
        `select id from public.listing_reviews where property_id = $1`,
        [AVISOS.miraflores],
      );
      return rows;
    });
    expect(ajenas).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// Lo escrito no se borra
// ---------------------------------------------------------------------

describe('la bitácora es inmutable', () => {
  it('no se puede editar, ni con conexión directa', async () => {
    await expect(
      banco.db.query(`update public.audit_logs set action = 'nada' where id > 0`),
    ).rejects.toThrow(/no se edita ni se borra/);
  });

  it('ni borrar', async () => {
    await expect(banco.db.query(`delete from public.audit_logs where id > 0`)).rejects.toThrow(
      /no se edita ni se borra/,
    );
  });

  it('y las revisiones tampoco', async () => {
    await expect(
      banco.db.query(`update public.listing_reviews set reason = 'otro' where id > 0`),
    ).rejects.toThrow(/no se edita ni se borra/);
    await expect(
      banco.db.query(`delete from public.listing_reviews where id > 0`),
    ).rejects.toThrow(/no se edita ni se borra/);
  });
});

// ---------------------------------------------------------------------
// Banderas
// ---------------------------------------------------------------------

describe('las banderas', () => {
  it('marcar un aviso no lo despublica', async () => {
    const antes = await banco.db.query<{ publication_status: string }>(
      `select publication_status from public.properties where id = $1`,
      [AVISOS.sanIsidro],
    );

    await banco.comoServicio((db) =>
      db.query(`select public.marcar_aviso($1)`, [AVISOS.sanIsidro]),
    );

    const despues = await banco.db.query<{ publication_status: string }>(
      `select publication_status from public.properties where id = $1`,
      [AVISOS.sanIsidro],
    );
    expect(despues.rows[0]?.publication_status).toBe(antes.rows[0]?.publication_status);
  });

  it('una foto repetida en dos avisos se marca', async () => {
    await banco.db.query(
      `update public.property_media set image_hash = 'huella-de-prueba'
        where property_id in ($1, $2)`,
      [AVISOS.sanIsidro, AVISOS.jesusMaria],
    );

    await banco.comoServicio((db) =>
      db.query(`select public.marcar_aviso($1)`, [AVISOS.sanIsidro]),
    );

    const { rows } = await banco.db.query<{ kind: string }>(
      `select kind from public.moderation_flags
        where property_id = $1 and kind = 'repeated_image' and status = 'open'`,
      [AVISOS.sanIsidro],
    );
    expect(rows).toHaveLength(1);
  });

  it('no se marca dos veces lo mismo', async () => {
    await banco.comoServicio((db) =>
      db.query(`select public.marcar_aviso($1)`, [AVISOS.sanIsidro]),
    );

    const { rows } = await banco.db.query<{ n: string }>(
      `select count(*) as n from public.moderation_flags
        where property_id = $1 and kind = 'repeated_image' and status = 'open'`,
      [AVISOS.sanIsidro],
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('cerrarla exige una nota', async () => {
    const { rows } = await banco.db.query<{ id: string }>(
      `select id from public.moderation_flags where status = 'open' limit 1`,
    );

    await expect(
      banco.comoUsuario(CUENTAS.martin, (db) =>
        db.query(`select public.resolver_bandera($1, 'dismissed', '')`, [rows[0]!.id]),
      ),
    ).rejects.toThrow(/resolucion_explicada|check constraint/i);
  });

  it('con nota se cierra y queda en la bitácora', async () => {
    const { rows } = await banco.db.query<{ id: string }>(
      `select id from public.moderation_flags where status = 'open' limit 1`,
    );

    await banco.comoUsuario(CUENTAS.martin, (db) =>
      db.query(`select public.resolver_bandera($1, 'dismissed', $2)`, [
        rows[0]!.id,
        'Es la misma inmobiliaria republicando su propia foto.',
      ]),
    );

    const cerrada = await banco.db.query<{ status: string; resolved_by: string }>(
      `select status, resolved_by from public.moderation_flags where id = $1`,
      [rows[0]!.id],
    );
    expect(cerrada.rows[0]?.status).toBe('dismissed');
    expect(cerrada.rows[0]?.resolved_by).toBe(CUENTAS.martin);

    const bitacora = await banco.db.query<{ n: string }>(
      `select count(*) as n from public.audit_logs where action = 'resolver_bandera'`,
    );
    expect(Number(bitacora.rows[0]!.n)).toBeGreaterThan(0);
  });

  it('quien no es del equipo no puede resolver ninguna', async () => {
    await banco.db.query(
      `insert into public.moderation_flags (property_id, kind, score)
       values ($1, 'manual', 40) on conflict do nothing`,
      [AVISOS.jesusMaria],
    );
    const { rows } = await banco.db.query<{ id: string }>(
      `select id from public.moderation_flags where status = 'open' limit 1`,
    );

    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(`select public.resolver_bandera($1, 'confirmed', 'lo que sea')`, [
          rows[0]!.id,
        ]),
      ),
    ).rejects.toThrow(/Solo el equipo de moderación/);
  });
});

// ---------------------------------------------------------------------
// Verificación
// ---------------------------------------------------------------------

describe('verificar una inmobiliaria', () => {
  const agencia = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  it('solo el equipo de Wasipe la otorga', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(`select public.verificar_anunciante($1, 'verified')`, [agencia]),
      ),
    ).rejects.toThrow(/Solo el equipo de Wasipe/);
  });

  it('rechazar exige decir por qué', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.martin, (db) =>
        db.query(`select public.verificar_anunciante($1, 'rejected', 'no')`, [agencia]),
      ),
    ).rejects.toThrow(/tiene que decir por qué/);
  });

  it('verificar queda anotado', async () => {
    await banco.comoUsuario(CUENTAS.martin, (db) =>
      db.query(`select public.verificar_anunciante($1, 'verified')`, [agencia]),
    );

    const { rows } = await banco.db.query<{ verification_status: string }>(
      `select verification_status from public.agencies where id = $1`,
      [agencia],
    );
    expect(rows[0]?.verification_status).toBe('verified');

    const bitacora = await banco.db.query<{ n: string }>(
      `select count(*) as n from public.audit_logs where action = 'verificar_anunciante'`,
    );
    expect(Number(bitacora.rows[0]!.n)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------
// Duplicados
// ---------------------------------------------------------------------

describe('la detección de duplicados', () => {
  it('encuentra un aviso casi idéntico en el mismo distrito', async () => {
    const { rows: original } = await banco.db.query<{
      title: string;
      district: string;
      province: string;
      operation: string;
      property_type: string;
      total_area: string;
      price: string;
      currency: string;
      description: string;
    }>(
      `select title, district, province, operation, property_type, total_area,
              price, currency, description
         from public.properties where id = $1`,
      [AVISOS.sanIsidro],
    );
    const uno = original[0]!;

    await banco.db.query(
      `insert into public.properties
         (owner_id, title, description, operation, property_type, currency, price,
          total_area, department, province, district, publication_status, status, published_at)
       values ($1, $2, $3, $4::public.listing_operation, $5::public.property_type,
               $6::public.currency, $7, $8, 'Lima', $9, $10, 'published', 'available', now())`,
      [
        CUENTAS.rosa,
        uno.title,
        uno.description,
        uno.operation,
        uno.property_type,
        uno.currency,
        uno.price,
        uno.total_area,
        uno.province,
        uno.district,
      ],
    );

    const candidatos = await banco.comoUsuario(CUENTAS.martin, async (db) => {
      const { rows } = await db.query<{ similitud: number; misma_area: boolean }>(
        `select * from public.posibles_duplicados($1, 5)`,
        [AVISOS.sanIsidro],
      );
      return rows;
    });

    expect(candidatos.length).toBeGreaterThan(0);
    expect(Number(candidatos[0]!.similitud)).toBeGreaterThan(0.9);
    expect(candidatos[0]!.misma_area).toBe(true);
  });

  it('y no confunde avisos de distritos distintos', async () => {
    const candidatos = await banco.comoUsuario(CUENTAS.martin, async (db) => {
      const { rows } = await db.query<{ id: string }>(
        `select id from public.posibles_duplicados($1, 5)`,
        [AVISOS.barranco],
      );
      return rows;
    });
    expect(candidatos).toHaveLength(0);
  });
});
