import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { levantarBanco, sembrar, CUENTAS, type Banco } from './banco';

/**
 * Proyectos inmobiliarios: esquema, transiciones y RLS.
 *
 * Un proyecto es la primera cosa de Wasipe que **no pertenece a una
 * persona sino a una empresa**, y eso cambia quién puede verlo y tocarlo.
 * Por eso acá no alcanza con probar «el dueño sí, un extraño no»: hay que
 * probar que la inmobiliaria A no llega a lo de la B, que es el modo en
 * que este tipo de permiso se rompe.
 *
 * El borrador de un proyecto es información comercial de verdad: el
 * precio de preventa antes del lanzamiento. Que se filtre no es una
 * molestia, es una filtración.
 */

let banco: Banco;

// Dos inmobiliarias distintas, cada una con su gente. La segunda existe
// solo para intentar entrar a lo de la primera.
const AGENCIA_A = 'a0000001-0000-4000-8000-000000000001';
const AGENCIA_B = 'a0000002-0000-4000-8000-000000000002';
const PROYECTO_A = 'e0000001-0000-4000-8000-000000000001';
const PROYECTO_B = 'e0000002-0000-4000-8000-000000000002';

/**
 * Deja el proyecto listo para publicarse: una tipología y una foto.
 *
 * Es idempotente a propósito. La primera versión insertaba una portada
 * siempre, y al llamarla sobre un proyecto que ya tenía una chocaba con
 * `project_media_una_portada` —el índice haciendo exactamente su
 * trabajo—. Un ayudante de prueba que no se puede llamar dos veces
 * obliga a que las pruebas dependan del orden, que es lo que se está
 * tratando de evitar.
 */
async function completar(id: string) {
  await banco.db.exec(`
    insert into public.project_typologies
      (project_id, name, bedrooms, bathrooms, total_area, built_area,
       currency, price_from, price_to, units_total, units_available)
    select '${id}', '2 dormitorios', 2, 2, 70, 62, 'USD', 95000, 120000, 40, 40
     where not exists (
       select 1 from public.project_typologies where project_id = '${id}'
     );

    insert into public.project_media (project_id, url, storage_path, is_cover)
    select '${id}', 'https://ejemplo/portada.webp', '${id}/portada.webp', true
     where not exists (
       select 1 from public.project_media where project_id = '${id}'
     );
  `);
}

beforeAll(async () => {
  banco = await levantarBanco();
  await sembrar(banco);

  await banco.db.exec(`
    insert into public.agencies (id, name, slug, created_by) values
      ('${AGENCIA_A}', 'Constructora A', 'constructora-a', '${CUENTAS.rosa}'),
      ('${AGENCIA_B}', 'Constructora B', 'constructora-b', '${CUENTAS.lucia}');

    insert into public.agency_members (agency_id, user_id, role, can_publish) values
      ('${AGENCIA_A}', '${CUENTAS.rosa}', 'agency_admin', true),
      ('${AGENCIA_B}', '${CUENTAS.lucia}', 'agency_admin', true);

    insert into public.projects
      (id, slug, agency_id, created_by, name, department, province, district)
    values
      ('${PROYECTO_A}', 'torre-a', '${AGENCIA_A}', '${CUENTAS.rosa}',
       'Torre A', 'Lima', 'Lima', 'Miraflores'),
      ('${PROYECTO_B}', 'torre-b', '${AGENCIA_B}', '${CUENTAS.lucia}',
       'Torre B', 'Lima', 'Lima', 'Surco');
  `);
}, 180_000);

afterAll(async () => {
  await banco?.cerrar();
});

// ---------------------------------------------------------------------
// Esquema y restricciones
// ---------------------------------------------------------------------

describe('el esquema dice lo que un proyecto es y lo que no', () => {
  it('el proyecto no guarda precio: lo guardan sus tipologías', async () => {
    const { rows } = await banco.db.query(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'projects'`,
    );
    const columnas = rows.map((r) => (r as { column_name: string }).column_name);

    // Esto es el fondo del sprint: meter un precio acá reintroduce la
    // media verdad que el modelo viejo obligaba a publicar.
    expect(columnas).not.toContain('price');
    expect(columnas).not.toContain('bedrooms');

    // Y no hay una segunda columna que cuente la aprobación.
    expect(columnas).not.toContain('verification_status');
    expect(columnas).toContain('publication_status');
  });

  it('un rango de precio al revés no entra', async () => {
    await expect(
      banco.db.exec(`
        insert into public.project_typologies
          (project_id, name, bedrooms, bathrooms, currency, price_from, price_to,
           units_total, units_available)
        values ('${PROYECTO_A}', 'Invertida', 2, 1, 'USD', 200000, 100000, 10, 10);
      `),
    ).rejects.toThrow(/rango_de_precio_coherente/);
  });

  it('no puede haber más unidades disponibles que existentes', async () => {
    await expect(
      banco.db.exec(`
        insert into public.project_typologies
          (project_id, name, bedrooms, bathrooms, currency, price_from, price_to,
           units_total, units_available)
        values ('${PROYECTO_A}', 'Imposible', 2, 1, 'USD', 100000, 120000, 10, 80);
      `),
    ).rejects.toThrow(/disponibles_no_superan_el_total/);
  });

  it('el área construida no puede exceder el área total', async () => {
    await expect(
      banco.db.exec(`
        insert into public.project_typologies
          (project_id, name, bedrooms, bathrooms, total_area, built_area,
           currency, price_from, price_to, units_total, units_available)
        values ('${PROYECTO_A}', 'Elástica', 2, 1, 60, 90, 'USD', 1, 2, 5, 5);
      `),
    ).rejects.toThrow(/area_construida_cabe/);
  });

  it('una consulta sin destino no entra', async () => {
    // Con los dos nulos corta antes el disparador que fija el dueño —no
    // encuentra a quién asignarla— y ese mensaje llega primero que el
    // check. Lo que importa es que no entre; por qué exactamente, no.
    await expect(
      banco.db.exec(`
        insert into public.inquiries
          (property_id, project_id, owner_id, sender_name, sender_email, message)
        values (null, null, '${CUENTAS.rosa}', 'Quien pregunta', 'a@b.pe', 'Hola, quiero información');
      `),
    ).rejects.toThrow();
  });

  it('una consulta con dos destinos tampoco: la rechaza el check', async () => {
    await expect(
      banco.db.exec(`
        insert into public.inquiries
          (property_id, project_id, owner_id, sender_name, sender_email, message)
        values ('c0000001-0000-4000-8000-000000000001', '${PROYECTO_A}',
                '${CUENTAS.rosa}', 'Quien pregunta', 'a@b.pe', 'Hola, quiero información');
      `),
    ).rejects.toThrow(/consulta_sobre_una_sola_cosa/);
  });

  it('solo puede haber una portada por proyecto', async () => {
    await banco.db.exec(`
      insert into public.project_media (project_id, url, storage_path, is_cover)
      values ('${PROYECTO_B}', 'https://ejemplo/a.webp', '${PROYECTO_B}/a.webp', true);
    `);
    await expect(
      banco.db.exec(`
        insert into public.project_media (project_id, url, storage_path, is_cover)
        values ('${PROYECTO_B}', 'https://ejemplo/b.webp', '${PROYECTO_B}/b.webp', true);
      `),
    ).rejects.toThrow(/project_media_una_portada/);
  });
});

// ---------------------------------------------------------------------
// Transiciones
// ---------------------------------------------------------------------

describe('un proyecto no se publica solo', () => {
  it('nace en borrador aunque se pida otra cosa', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.exec(`
          insert into public.projects
            (slug, agency_id, created_by, name, department, province, district, publication_status)
          values ('atajo', '${AGENCIA_A}', '${CUENTAS.rosa}', 'Atajo',
                  'Lima', 'Lima', 'Miraflores', 'published');
        `),
      ),
    ).rejects.toThrow(/empieza en borrador/);
  });

  it('la inmobiliaria no puede saltarse la revisión', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.exec(
          `update public.projects set publication_status = 'published' where id = '${PROYECTO_A}';`,
        ),
      ),
    ).rejects.toThrow(/tiene que pasar por revisión/);
  });

  it('sí puede enviarlo a revisión', async () => {
    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.exec(
        `update public.projects set publication_status = 'in_review' where id = '${PROYECTO_A}';`,
      ),
    );
    const { rows } = await banco.db.query(
      `select publication_status, submitted_at from public.projects where id = $1`,
      [PROYECTO_A],
    );
    expect((rows[0] as { publication_status: string }).publication_status).toBe('in_review');
    // La marca de tiempo la pone la base, no la aplicación.
    expect((rows[0] as { submitted_at: Date | null }).submitted_at).not.toBeNull();
  });

  it('no puede rechazarse a sí misma para inventar un motivo', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.exec(
          `update public.projects set publication_status = 'rejected' where id = '${PROYECTO_A}';`,
        ),
      ),
    ).rejects.toThrow(/Solo el equipo de Wasipe/);
  });

  it('tampoco puede tocar los contadores', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.exec(`update public.projects set views_count = 9999 where id = '${PROYECTO_A}';`),
      ),
    ).rejects.toThrow(/contadores no se editan/);
  });

  it('moderación NO puede aprobar un proyecto sin tipología', async () => {
    // La comprobación vale también para quien modera: aprobar un proyecto
    // vacío no es un privilegio, es un error.
    await expect(
      banco.comoUsuario(CUENTAS.moderacion, (db) =>
        db.exec(
          `update public.projects set publication_status = 'published' where id = '${PROYECTO_A}';`,
        ),
      ),
    ).rejects.toThrow(/sin al menos una tipología/);
  });

  it('ni sin foto, aunque ya tenga tipología', async () => {
    await banco.db.exec(`
      insert into public.project_typologies
        (project_id, name, bedrooms, bathrooms, currency, price_from, price_to,
         units_total, units_available)
      values ('${PROYECTO_A}', '1 dormitorio', 1, 1, 'USD', 80000, 90000, 20, 20);
    `);

    await expect(
      banco.comoUsuario(CUENTAS.moderacion, (db) =>
        db.exec(
          `update public.projects set publication_status = 'published' where id = '${PROYECTO_A}';`,
        ),
      ),
    ).rejects.toThrow(/sin al menos una foto/);
  });

  it('con tipología y foto, moderación lo publica y la base fecha el hecho', async () => {
    await banco.db.exec(`
      insert into public.project_media (project_id, url, storage_path, is_cover)
      values ('${PROYECTO_A}', 'https://ejemplo/portada.webp', '${PROYECTO_A}/portada.webp', true);
    `);

    await banco.comoUsuario(CUENTAS.moderacion, (db) =>
      db.exec(
        `update public.projects set publication_status = 'published' where id = '${PROYECTO_A}';`,
      ),
    );

    const { rows } = await banco.db.query(
      `select publication_status, published_at, reviewed_at from public.projects where id = $1`,
      [PROYECTO_A],
    );
    const fila = rows[0] as { publication_status: string; published_at: Date; reviewed_at: Date };
    expect(fila.publication_status).toBe('published');
    expect(fila.published_at).not.toBeNull();
    expect(fila.reviewed_at).not.toBeNull();
  });

  it('reanudar una pausa no falsea la antigüedad', async () => {
    const antes = (
      await banco.db.query(`select published_at from public.projects where id = $1`, [PROYECTO_A])
    ).rows[0] as { published_at: Date };

    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.exec(
        `update public.projects set publication_status = 'paused' where id = '${PROYECTO_A}';`,
      ),
    );
    // Desde pausado sí puede volver a publicar sin revisión: no cambió nada.
    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.exec(
        `update public.projects set publication_status = 'published' where id = '${PROYECTO_A}';`,
      ),
    );

    const despues = (
      await banco.db.query(`select published_at from public.projects where id = $1`, [PROYECTO_A])
    ).rows[0] as { published_at: Date };

    expect(String(despues.published_at)).toBe(String(antes.published_at));
  });
});

// ---------------------------------------------------------------------
// RLS
// ---------------------------------------------------------------------

describe('quién ve qué', () => {
  it('un visitante sin sesión ve el publicado y nada más', async () => {
    const filas = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(`select id, name from public.projects`);
      return rows as { id: string }[];
    });

    expect(filas.map((f) => f.id)).toEqual([PROYECTO_A]);
  });

  it('y tampoco ve las tipologías del borrador ajeno', async () => {
    // Los precios de preventa antes del lanzamiento son el dato comercial
    // que más vale de un proyecto.
    const filas = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(
        `select id from public.project_typologies where project_id = $1`,
        [PROYECTO_B],
      );
      return rows;
    });
    expect(filas).toHaveLength(0);
  });

  it('un proyecto de una inmobiliaria dada de baja deja de verse', async () => {
    await banco.db.exec(`update public.agencies set is_active = false where id = '${AGENCIA_A}';`);
    const filas = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(`select id from public.projects`);
      return rows;
    });
    expect(filas).toHaveLength(0);
    await banco.db.exec(`update public.agencies set is_active = true where id = '${AGENCIA_A}';`);
  });

  it('moderación ve todo, incluidos los borradores', async () => {
    const filas = await banco.comoUsuario(CUENTAS.moderacion, async (db) => {
      const { rows } = await db.query(`select id from public.projects`);
      return rows;
    });
    expect(filas.length).toBeGreaterThanOrEqual(2);
  });
});

describe('aislamiento entre inmobiliarias', () => {
  it('la inmobiliaria B no ve el borrador de la A', async () => {
    // Se pone A en borrador para que lo único que pudiera mostrarlo sea
    // la membresía, no la publicación.
    await banco.db.exec(
      `update public.projects set publication_status = 'draft' where id = '${PROYECTO_A}';`,
    );

    const filas = await banco.comoUsuario(CUENTAS.lucia, async (db) => {
      const { rows } = await db.query(`select id from public.projects where id = $1`, [PROYECTO_A]);
      return rows;
    });
    expect(filas).toHaveLength(0);
  });

  it('B no puede editar el proyecto de A', async () => {
    const antes = 'Torre A';
    await banco.comoUsuario(CUENTAS.lucia, (db) =>
      db.exec(`update public.projects set name = 'Robado' where id = '${PROYECTO_A}';`),
    );

    // RLS no lanza error en un update que no alcanza ninguna fila: la
    // deja pasar sin tocar nada. Por eso se comprueba el dato, no la
    // excepción; esperar un throw acá daría un falso verde.
    const { rows } = await banco.db.query(`select name from public.projects where id = $1`, [
      PROYECTO_A,
    ]);
    expect((rows[0] as { name: string }).name).toBe(antes);
  });

  it('B no puede colgarle una tipología al proyecto de A', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.lucia, (db) =>
        db.exec(`
          insert into public.project_typologies
            (project_id, name, bedrooms, bathrooms, currency, price_from, price_to,
             units_total, units_available)
          values ('${PROYECTO_A}', 'Metida', 1, 1, 'USD', 1, 2, 1, 1);
        `),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('B no puede crear un proyecto a nombre de A', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.lucia, (db) =>
        db.exec(`
          insert into public.projects
            (slug, agency_id, created_by, name, department, province, district)
          values ('suplantado', '${AGENCIA_A}', '${CUENTAS.lucia}', 'Suplantado',
                  'Lima', 'Lima', 'Miraflores');
        `),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('y quien no es de ninguna inmobiliaria tampoco crea proyectos', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.martin, (db) =>
        db.exec(`
          insert into public.projects
            (slug, agency_id, created_by, name, department, province, district)
          values ('ajeno', '${AGENCIA_A}', '${CUENTAS.martin}', 'Ajeno',
                  'Lima', 'Lima', 'Miraflores');
        `),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('las consultas de un proyecto no son públicas', () => {
  // Este bloque no depende de lo que hayan dejado los anteriores: se
  // asegura su propio estado. Una prueba que solo pasa si otra corrió
  // antes falla el día que alguien la ejecute sola, y el fallo no dice
  // nada sobre el producto.
  beforeAll(async () => {
    await completar(PROYECTO_A);
    await banco.comoUsuario(CUENTAS.moderacion, (db) =>
      db.exec(
        `update public.projects set publication_status = 'published' where id = '${PROYECTO_A}';`,
      ),
    );
  });

  it('se pueden hacer sobre un proyecto publicado y suman al contador', async () => {

    await banco.comoAnonimo((db) =>
      db.exec(`
        insert into public.inquiries
          (project_id, owner_id, sender_name, sender_email, message)
        values ('${PROYECTO_A}', '${CUENTAS.rosa}', 'Quien pregunta', 'quien@ejemplo.pe',
                'Hola, quisiera saber el precio de las de dos dormitorios');
      `),
    );

    const { rows } = await banco.db.query(
      `select inquiries_count from public.projects where id = $1`,
      [PROYECTO_A],
    );
    expect((rows[0] as { inquiries_count: number }).inquiries_count).toBeGreaterThanOrEqual(1);
  });

  it('pero nadie de afuera las lee', async () => {
    const anon = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(`select id from public.inquiries where project_id is not null`);
      return rows;
    });
    expect(anon).toHaveLength(0);

    // Ni la inmobiliaria de al lado.
    const otra = await banco.comoUsuario(CUENTAS.lucia, async (db) => {
      const { rows } = await db.query(`select id from public.inquiries where project_id is not null`);
      return rows;
    });
    expect(otra).toHaveLength(0);
  });

  it('la inmobiliaria dueña sí las lee', async () => {
    const suyas = await banco.comoUsuario(CUENTAS.rosa, async (db) => {
      const { rows } = await db.query(`select id from public.inquiries where project_id is not null`);
      return rows;
    });
    expect(suyas.length).toBeGreaterThanOrEqual(1);
  });

  it('y no se puede consultar un proyecto que no está publicado', async () => {
    await expect(
      banco.comoAnonimo((db) =>
        db.exec(`
          insert into public.inquiries
            (project_id, owner_id, sender_name, sender_email, message)
          values ('${PROYECTO_B}', '${CUENTAS.lucia}', 'Curioso', 'c@ejemplo.pe',
                  'Quiero saber de este proyecto que todavía no salió');
        `),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});
