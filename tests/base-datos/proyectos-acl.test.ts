import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { levantarBanco, sembrar, CUENTAS, type Banco } from './banco';

/**
 * Los permisos de ejecución, con las ACL de verdad.
 *
 * Este archivo existe por un fallo que el resto de la suite **no podía
 * ver**. `levantarBanco()` termina con un
 * `grant execute on all functions ... to anon, authenticated`, que es
 * razonable —Supabase concede algo parecido— pero corre **después** de
 * aplicar las migraciones, así que anula cualquier `revoke` que una
 * migración haya hecho. Con eso, 40 pruebas de proyectos pasaban en verde
 * sobre un permiso que en producción no existe.
 *
 * Lo que estaba roto: `code` tenía `default public.nuevo_codigo_proyecto()`
 * y esa función tenía el `execute` revocado. **Un DEFAULT de columna se
 * evalúa con los privilegios de quien inserta**, así que un `agency_admin`
 * con permiso de RLS para crear el proyecto igual se estrellaba contra
 * «permission denied for function nuevo_codigo_proyecto». En PGlite no se
 * veía; contra Supabase habría fallado el primer día.
 *
 * Por eso acá se vuelven a aplicar las revocaciones de la migración antes
 * de probar nada: es la única forma de que la prueba mire el mismo mundo
 * que el servidor.
 */

let banco: Banco;

const AGENCIA = 'a0000005-0000-4000-8000-000000000005';

/** Las revocaciones tal como las escribe la migración, releídas del archivo. */
function revocacionesDeLaMigracion(): string {
  const carpeta = join(__dirname, '..', '..', 'supabase', 'migrations');
  const archivo = readdirSync(carpeta).find((f) => f.includes('_proyectos.sql'));
  const sql = readFileSync(join(carpeta, archivo!), 'utf8');

  // Se toman del propio archivo y no de una copia: una copia se
  // desactualiza el día que alguien agregue una función, y esta prueba
  // seguiría en verde sin cubrirla.
  //
  // Se extraen SENTENCIAS completas, no líneas sueltas: varias ocupan
  // cuatro renglones y quedarse con el primero produce SQL inválido.
  const sentencias = sql.match(/^\s*(revoke|grant)\s+execute[\s\S]*?;/gim) ?? [];

  // Sin esto la prueba podría pasar por no comprobar nada: si el archivo
  // dejara de tener revocaciones, el harness quedaría con su grant
  // general y todo daría verde sobre permisos que no existen.
  if (sentencias.length < 5) {
    throw new Error(
      `Se esperaban las revocaciones de la migración y se encontraron ${sentencias.length}`,
    );
  }

  return sentencias.join('\n');
}

beforeAll(async () => {
  banco = await levantarBanco();
  await sembrar(banco);

  // Deshacer el grant general del harness, reaplicando lo que dice la
  // migración. A partir de acá, las ACL son las de producción.
  await banco.db.exec(revocacionesDeLaMigracion());

  await banco.db.exec(`
    insert into public.agencies (id, name, slug, created_by)
    values ('${AGENCIA}', 'Constructora D', 'constructora-d', '${CUENTAS.rosa}');

    insert into public.agency_members (agency_id, user_id, role, can_publish) values
      ('${AGENCIA}', '${CUENTAS.rosa}', 'agency_admin', true),
      ('${AGENCIA}', '${CUENTAS.martin}', 'agent', true);
  `);
}, 180_000);

afterAll(async () => {
  await banco?.cerrar();
});

describe('crear un proyecto con las ACL reales', () => {
  it('el administrador inserta sin dar `code` y la base lo genera', async () => {
    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.exec(`
        insert into public.projects
          (slug, agency_id, created_by, name, department, province, district)
        values ('acl-uno', '${AGENCIA}', '${CUENTAS.rosa}', 'ACL uno',
                'Lima', 'Lima', 'Surco');
      `),
    );

    const { rows } = await banco.db.query(`select code from public.projects where slug = $1`, [
      'acl-uno',
    ]);
    expect((rows[0] as { code: string }).code).toMatch(/^PRY-\d{6}$/);
  });

  it('dos proyectos seguidos reciben códigos distintos', async () => {
    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.exec(`
        insert into public.projects
          (slug, agency_id, created_by, name, department, province, district)
        values ('acl-dos', '${AGENCIA}', '${CUENTAS.rosa}', 'ACL dos',
                'Lima', 'Lima', 'Surco');
      `),
    );

    const { rows } = await banco.db.query(
      `select code from public.projects where slug in ('acl-uno','acl-dos')`,
    );
    const codigos = rows.map((r) => (r as { code: string }).code);
    expect(new Set(codigos).size).toBe(2);
  });

  it('el código lo pone la base: lo que mande el cliente se ignora', async () => {
    // El contrato es normalizar, no rechazar. Rechazar obligaría a cada
    // formulario a acordarse de no mandarlo; sobrescribir hace que
    // mandarlo no sirva de nada.
    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.exec(`
        insert into public.projects
          (code, slug, agency_id, created_by, name, department, province, district)
        values ('PRY-000000', 'acl-tres', '${AGENCIA}', '${CUENTAS.rosa}', 'ACL tres',
                'Lima', 'Lima', 'Surco');
      `),
    );

    const { rows } = await banco.db.query(`select code from public.projects where slug = $1`, [
      'acl-tres',
    ]);
    expect((rows[0] as { code: string }).code).not.toBe('PRY-000000');
    expect((rows[0] as { code: string }).code).toMatch(/^PRY-\d{6}$/);
  });

  it('y tampoco se puede cambiar después', async () => {
    const antes = (
      await banco.db.query(`select code from public.projects where slug = $1`, ['acl-uno'])
    ).rows[0] as { code: string };

    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.exec(`update public.projects set code = 'PRY-999999' where slug = 'acl-uno';`),
    );

    const despues = (
      await banco.db.query(`select code from public.projects where slug = $1`, ['acl-uno'])
    ).rows[0] as { code: string };

    expect(despues.code).toBe(antes.code);
  });

  it('ni siquiera moderación puede cambiar el código', async () => {
    // Esta prueba encontró un agujero real: la primera versión daba por
    // sentado que el índice único frenaría el cambio, y no lo frenaba —el
    // código elegido estaba libre—. Un `agency_admin` podía renombrar el
    // identificador con el que la gente busca su proyecto y con el que
    // salieron los correos. Ahora el disparador lo devuelve a su valor,
    // para todos.
    const antes = (
      await banco.db.query(`select code from public.projects where slug = $1`, ['acl-dos'])
    ).rows[0] as { code: string };

    await banco.comoUsuario(CUENTAS.moderacion, (db) =>
      db.exec(`update public.projects set code = 'PRY-888888' where slug = 'acl-dos';`),
    );

    const despues = (
      await banco.db.query(`select code from public.projects where slug = $1`, ['acl-dos'])
    ).rows[0] as { code: string };

    expect(despues.code).toBe(antes.code);
  });
});

describe('quién NO puede crear un proyecto', () => {
  it('un corredor de la misma inmobiliaria, no', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.martin, (db) =>
        db.exec(`
          insert into public.projects
            (slug, agency_id, created_by, name, department, province, district)
          values ('acl-agent', '${AGENCIA}', '${CUENTAS.martin}', 'Del corredor',
                  'Lima', 'Lima', 'Surco');
        `),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('un visitante sin sesión, tampoco', async () => {
    await expect(
      banco.comoAnonimo((db) =>
        db.exec(`
          insert into public.projects
            (slug, agency_id, created_by, name, department, province, district)
          values ('acl-anon', '${AGENCIA}', '${CUENTAS.rosa}', 'De nadie',
                  'Lima', 'Lima', 'Surco');
        `),
      ),
    ).rejects.toThrow();
  });
});

describe('las funciones internas no se llaman desde el cliente', () => {
  for (const [rol, correr] of [
    ['anónimo', (sql: string) => banco.comoAnonimo((db) => db.exec(sql))],
    ['autenticado', (sql: string) => banco.comoUsuario(CUENTAS.rosa, (db) => db.exec(sql))],
  ] as const) {
    it(`${rol} no puede generar códigos de proyecto a pedido`, async () => {
      await expect(correr(`select public.nuevo_codigo_proyecto();`)).rejects.toThrow(
        /permission denied/i,
      );
    });

    it(`${rol} no puede invocar los disparadores a mano`, async () => {
      for (const fn of ['public.preparar_proyecto_nuevo()', 'public.proteger_estados_proyecto()']) {
        await expect(correr(`select ${fn};`)).rejects.toThrow(/permission denied/i);
      }
    });
  }
});

describe('las funciones que RLS necesita sí se pueden ejecutar', () => {
  // La contraparte de lo anterior: si se revocara de más, la lectura
  // pública de proyectos dejaría de funcionar y el síntoma sería «no hay
  // proyectos», que no se parece en nada a un problema de permisos.
  it('un visitante sin sesión puede evaluar `proyecto_publico`', async () => {
    const filas = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(
        `select public.proyecto_publico(id) as visible from public.projects limit 1`,
      );
      return rows;
    });
    expect(filas.length).toBeGreaterThanOrEqual(0);
  });

  it('y un autenticado puede evaluar las tres de pertenencia', async () => {
    const { rows } = await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(
        `select public.administra_proyecto(p.id) a,
                public.miembro_del_proyecto(p.id) m,
                public.dueno_de_proyecto(p.id) d
           from public.projects p where p.slug = 'acl-uno'`,
      ),
    );
    const fila = rows[0] as { a: boolean; m: boolean; d: string };
    expect(fila.a).toBe(true);
    expect(fila.m).toBe(true);
    expect(fila.d).toBe(CUENTAS.rosa);
  });

  it('un visitante sin sesión ve un proyecto publicado de punta a punta', async () => {
    await banco.db.exec(`
      insert into public.project_typologies
        (project_id, name, bedrooms, bathrooms, currency, price_from, price_to,
         units_total, units_available)
      select id, '2 dormitorios', 2, 2, 'USD', 90000, 110000, 20, 20
        from public.projects where slug = 'acl-uno';

      insert into public.project_media (project_id, url, storage_path, is_cover)
      select id, 'https://ejemplo/p.webp', 'p.webp', true
        from public.projects where slug = 'acl-uno';
    `);

    await banco.comoUsuario(CUENTAS.moderacion, (db) =>
      db.exec(`update public.projects set publication_status = 'published' where slug = 'acl-uno';`),
    );

    const filas = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query(`select code from public.projects where slug = 'acl-uno'`);
      return rows;
    });
    expect(filas).toHaveLength(1);
  });
});
