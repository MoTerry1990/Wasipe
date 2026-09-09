import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { levantarBanco, sembrar, CUENTAS, type Banco } from './banco';

/**
 * Proyectos: administrar no es lo mismo que pertenecer.
 *
 * Va en su propio archivo porque necesita un reparto distinto —un
 * corredor dentro de la misma inmobiliaria que la administradora— y
 * mezclarlo con el de esquema y RLS haría que cada prueba tuviera que
 * saber qué dejó la anterior.
 *
 * Los dos roles son los que ya existían en `agency_members`:
 * `agency_admin` y `agent`. No se inventó ninguno.
 *
 * La diferencia no es burocrática. En preventa el precio es la decisión
 * comercial de la empresa; quien atiende consultas necesita ver el
 * proyecto para responder, no para cambiarle el precio.
 */

let banco: Banco;

const AGENCIA = 'a0000003-0000-4000-8000-000000000003';
const PROYECTO = 'e0000003-0000-4000-8000-000000000003';

/** Tipología y foto, idempotente: hace falta para poder publicar. */
async function completar(id: string) {
  await banco.db.exec(`
    insert into public.project_typologies
      (project_id, name, bedrooms, bathrooms, currency, price_from, price_to,
       units_total, units_available)
    select '${id}', '3 dormitorios', 3, 2, 'USD', 150000, 190000, 30, 30
     where not exists (select 1 from public.project_typologies where project_id = '${id}');

    insert into public.project_media (project_id, url, storage_path, is_cover)
    select '${id}', 'https://ejemplo/portada.webp', '${id}/portada.webp', true
     where not exists (select 1 from public.project_media where project_id = '${id}');
  `);
}

beforeAll(async () => {
  banco = await levantarBanco();
  await sembrar(banco);

  await banco.db.exec(`
    insert into public.agencies (id, name, slug, created_by)
    values ('${AGENCIA}', 'Constructora C', 'constructora-c', '${CUENTAS.rosa}');

    insert into public.agency_members (agency_id, user_id, role, can_publish) values
      ('${AGENCIA}', '${CUENTAS.rosa}', 'agency_admin', true),
      -- Martín es corredor de la MISMA inmobiliaria. Existe para probar
      -- que pertenecer no alcanza para escribir.
      ('${AGENCIA}', '${CUENTAS.martin}', 'agent', true);

    insert into public.projects
      (id, slug, agency_id, created_by, name, department, province, district)
    values ('${PROYECTO}', 'torre-c', '${AGENCIA}', '${CUENTAS.rosa}',
            'Torre C', 'Lima', 'Lima', 'San Isidro');
  `);
  await completar(PROYECTO);
}, 180_000);

afterAll(async () => {
  await banco?.cerrar();
});

describe('el corredor lee lo de su inmobiliaria', () => {
  it('ve el borrador', async () => {
    const filas = await banco.comoUsuario(CUENTAS.martin, async (db) => {
      const { rows } = await db.query(`select id from public.projects where id = $1`, [PROYECTO]);
      return rows;
    });
    expect(filas).toHaveLength(1);
  });

  it('ve sus tipologías y sus fotos, aunque no esté publicado', async () => {
    const { tipologias, fotos } = await banco.comoUsuario(CUENTAS.martin, async (db) => ({
      tipologias: (
        await db.query(`select id from public.project_typologies where project_id = $1`, [PROYECTO])
      ).rows,
      fotos: (await db.query(`select id from public.project_media where project_id = $1`, [PROYECTO]))
        .rows,
    }));
    expect(tipologias.length).toBeGreaterThan(0);
    expect(fotos.length).toBeGreaterThan(0);
  });
});

describe('pero no escribe nada del proyecto', () => {
  // RLS no lanza error en un `update` que no alcanza ninguna fila: lo deja
  // pasar sin tocar nada. Por eso acá se comprueba el dato y no la
  // excepción — esperar un `throw` daría un falso verde.

  it('no cambia los datos del proyecto', async () => {
    await banco.comoUsuario(CUENTAS.martin, (db) =>
      db.exec(`update public.projects set name = 'Renombrada' where id = '${PROYECTO}';`),
    );
    const { rows } = await banco.db.query(`select name from public.projects where id = $1`, [
      PROYECTO,
    ]);
    expect((rows[0] as { name: string }).name).toBe('Torre C');
  });

  it('no lo envía a revisión', async () => {
    await banco.comoUsuario(CUENTAS.martin, (db) =>
      db.exec(
        `update public.projects set publication_status = 'in_review' where id = '${PROYECTO}';`,
      ),
    );
    const { rows } = await banco.db.query(
      `select publication_status from public.projects where id = $1`,
      [PROYECTO],
    );
    expect((rows[0] as { publication_status: string }).publication_status).toBe('draft');
  });

  it('no cambia precios ni disponibilidad', async () => {
    const antes = await banco.db.query(
      `select price_from, units_available from public.project_typologies
        where project_id = $1 limit 1`,
      [PROYECTO],
    );

    await banco.comoUsuario(CUENTAS.martin, (db) =>
      db.exec(`
        update public.project_typologies
           set price_from = 1, units_available = 0
         where project_id = '${PROYECTO}';
      `),
    );

    const despues = await banco.db.query(
      `select price_from, units_available from public.project_typologies
        where project_id = $1 limit 1`,
      [PROYECTO],
    );
    expect(despues.rows[0]).toEqual(antes.rows[0]);
  });

  it('no agrega tipologías, fotos ni características', async () => {
    const sentencias = [
      `insert into public.project_typologies
         (project_id, name, bedrooms, bathrooms, currency, price_from, price_to,
          units_total, units_available)
       values ('${PROYECTO}', 'Metida', 1, 1, 'USD', 1, 2, 1, 1);`,
      `insert into public.project_media (project_id, url, storage_path)
       values ('${PROYECTO}', 'https://ejemplo/x.webp', '${PROYECTO}/x.webp');`,
      `insert into public.project_features (project_id, feature)
       values ('${PROYECTO}', 'piscina');`,
    ];

    for (const sentencia of sentencias) {
      await expect(
        banco.comoUsuario(CUENTAS.martin, (db) => db.exec(sentencia)),
      ).rejects.toThrow(/row-level security/i);
    }
  });

  it('ni borra el proyecto', async () => {
    await banco.comoUsuario(CUENTAS.martin, (db) =>
      db.exec(`delete from public.projects where id = '${PROYECTO}';`),
    );
    const { rows } = await banco.db.query(`select id from public.projects where id = $1`, [
      PROYECTO,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('no crea proyectos, ni siquiera en su propia inmobiliaria', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.martin, (db) =>
        db.exec(`
          insert into public.projects
            (slug, agency_id, created_by, name, department, province, district)
          values ('del-corredor', '${AGENCIA}', '${CUENTAS.martin}', 'Del corredor',
                  'Lima', 'Lima', 'San Isidro');
        `),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('lo que el corredor sí puede: atender', () => {
  it('lee y marca las consultas de los proyectos de su inmobiliaria', async () => {
    await banco.comoUsuario(CUENTAS.moderacion, (db) =>
      db.exec(
        `update public.projects set publication_status = 'published' where id = '${PROYECTO}';`,
      ),
    );

    await banco.comoAnonimo((db) =>
      db.exec(`
        insert into public.inquiries
          (project_id, owner_id, sender_name, sender_email, message)
        values ('${PROYECTO}', '${CUENTAS.rosa}', 'Interesada', 'ella@ejemplo.pe',
                'Hola, quisiera saber si quedan de tres dormitorios');
      `),
    );

    const suyas = await banco.comoUsuario(CUENTAS.martin, async (db) => {
      const { rows } = await db.query(`select id from public.inquiries where project_id = $1`, [
        PROYECTO,
      ]);
      return rows;
    });
    expect(suyas).toHaveLength(1);

    // Y marcarla como leída, que es atenderla.
    await banco.comoUsuario(CUENTAS.martin, (db) =>
      db.exec(`update public.inquiries set status = 'read' where project_id = '${PROYECTO}';`),
    );
    const { rows } = await banco.db.query(
      `select status from public.inquiries where project_id = $1`,
      [PROYECTO],
    );
    expect((rows[0] as { status: string }).status).toBe('read');
  });
});

// ---------------------------------------------------------------------
// El resquicio del disparador anidado
// ---------------------------------------------------------------------

describe('estar dentro de un disparador no autoriza nada más', () => {
  /**
   * `pg_trigger_depth() > 1` deja pasar el incremento de contadores, y esa
   * excepción es justo el tipo de cosa que se convierte en una escalada de
   * privilegios si nadie la acota: cualquier disparador escrito después
   * —o una línea agregada a uno existente— podría aprovechar el mismo
   * camino para cambiar el estado de publicación y saltarse la revisión.
   *
   * Así que acá se escribe ese disparador hostil a propósito y se exige
   * que la base lo rechace.
   */
  it('un disparador anidado no puede colar otro cambio junto al contador', async () => {
    // El campo que se intenta cambiar es `agency_id` —transferir el
    // proyecto a otra inmobiliaria— y no `publication_status`, y la razón
    // importa: el estado de publicación ya lo cuidan las guardas de
    // permiso, así que usarlo acá haría que la prueba pasara sin ejercitar
    // nunca la comprobación que dice estar probando. `agency_id` no lo
    // cuida ninguna otra regla: si el resquicio existiera, esto lo abriría.
    const otra = 'a0000004-0000-4000-8000-000000000004';
    await banco.db.exec(`
      insert into public.agencies (id, name, slug, created_by)
      values ('${otra}', 'Ajena', 'ajena', '${CUENTAS.lucia}')
      on conflict do nothing;

      create or replace function public.disparador_hostil()
      returns trigger
      language plpgsql
      security definer
      set search_path = public, pg_temp
      as $hostil$
      begin
        update public.projects
           set inquiries_count = inquiries_count + 1,
               agency_id = '${otra}'
         where id = new.project_id;
        return new;
      end;
      $hostil$;

      create trigger inquiries_hostil
        after insert on public.inquiries
        for each row execute function public.disparador_hostil();
    `);

    try {
      await expect(
        banco.db.exec(`
          insert into public.inquiries
            (project_id, owner_id, sender_name, sender_email, message)
          values ('${PROYECTO}', '${CUENTAS.rosa}', 'Atacante', 'a@ejemplo.pe',
                  'Mensaje cualquiera, lo que importa es el disparador anidado');
        `),
      ).rejects.toThrow(/solo puede mover los contadores/);

      // Y el proyecto sigue siendo de su inmobiliaria.
      const { rows } = await banco.db.query(`select agency_id from public.projects where id = $1`, [
        PROYECTO,
      ]);
      expect((rows[0] as { agency_id: string }).agency_id).toBe(AGENCIA);
    } finally {
      // Se desmonta pase lo que pase. La primera versión de esta prueba lo
      // desmontaba al final y, cuando falló, el disparador quedó instalado
      // y contaminó la prueba siguiente con un incremento de más.
      await banco.db.exec(`
        drop trigger if exists inquiries_hostil on public.inquiries;
        drop function if exists public.disparador_hostil();
      `);
    }
  });

  it('y el incremento legítimo, solo, sigue pasando', async () => {
    // La contraparte de la prueba anterior: si el arreglo hubiera sido
    // «prohibir todo cambio en profundidad», esto quedaría roto y las
    // consultas dejarían de contarse sin que nadie lo notara.
    await banco.comoUsuario(CUENTAS.moderacion, (db) =>
      db.exec(
        `update public.projects set publication_status = 'published' where id = '${PROYECTO}';`,
      ),
    );

    const antes = (
      await banco.db.query(`select inquiries_count from public.projects where id = $1`, [PROYECTO])
    ).rows[0] as { inquiries_count: number };

    await banco.comoAnonimo((db) =>
      db.exec(`
        insert into public.inquiries
          (project_id, owner_id, sender_name, sender_email, message)
        values ('${PROYECTO}', '${CUENTAS.rosa}', 'Interesado', 'el@ejemplo.pe',
                'Hola, quisiera información sobre las áreas comunes');
      `),
    );

    const despues = (
      await banco.db.query(`select inquiries_count from public.projects where id = $1`, [PROYECTO])
    ).rows[0] as { inquiries_count: number };

    expect(despues.inquiries_count).toBe(antes.inquiries_count + 1);
  });
});
