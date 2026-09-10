import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import type { Page } from '@playwright/test';

/**
 * Andamiaje para la prueba autenticada del panel de proyectos.
 *
 * **Solo para pruebas.** Vive bajo `tests/`, no lo importa ningún archivo
 * de `app/`, `features/` ni `lib/`, y por lo tanto no entra en el paquete
 * que se despliega. Hay una prueba de unidad que lo comprueba.
 *
 * Usa la conexión privilegiada de `.env.local` **únicamente para armar y
 * desarmar el escenario**: crear dos inmobiliarias y sus membresías, y
 * borrarlas al terminar. El panel nunca usa esta conexión; ahí manda la
 * sesión de la persona y la RLS.
 *
 * La contraseña de las cuentas de prueba no se escribe acá ni se imprime:
 * se lee de `supabase/seed.sql`, que es de donde salieron esas cuentas.
 */

const RAIZ = join(__dirname, '..', '..');

/** Las cuentas sembradas que usa la prueba. Los correos no son secretos. */
export const CUENTAS = {
  /** Administra la inmobiliaria de prueba. */
  administradora: 'rosa.quispe@ejemplo.pe',
  /** Corredora de la MISMA inmobiliaria. */
  corredor: 'lucia.ferrer@ejemplo.pe',
  /**
   * Administra OTRA inmobiliaria: la «Costa Verde» que ya trae la
   * semilla. Se usa esa y no una nueva porque Martín ya es miembro de
   * ella, y sumarlo a una segunda lo dejaría con dos membresías —el caso
   * que el panel ahora rechaza a propósito—. La prueba lo descubrió sola:
   * el corredor veía «perteneces a más de una inmobiliaria» en vez de la
   * lista, que es exactamente lo que debe pasar.
   */
  ajena: 'martin.alarcon@ejemplo.pe',
  /**
   * No pertenece a ninguna inmobiliaria. Sirve para comprobar que el menú
   * no le ofrezca «Proyectos»: una puerta que da a una pared es peor que
   * ninguna puerta.
   */
  sinInmobiliaria: 'moderacion@ejemplo.pe',
} as const;

/**
 * Un escenario por proyecto de Playwright.
 *
 * Escritorio y móvil corren a la vez contra la MISMA base de desarrollo.
 * Con un solo juego de inmobiliarias, la limpieza de uno le borraría el
 * piso al otro a mitad de camino, y el fallo aparecería en la prueba
 * equivocada. Cada proyecto tiene las suyas.
 */
export type Escenario = { agenciaA: string; marca: string };

export function escenarioDe(proyecto: string): Escenario {
  // El sufijo entra en el UUID para que sea válido y distinto por
  // proyecto: `escritorio` -> ...e5c, `movil` -> ...m0v.
  const clave = proyecto.slice(0, 3).toLowerCase().replace(/[^a-f0-9]/g, '0');
  return {
    agenciaA: `aaaa1111-0000-4000-8000-00000025b${clave}`.slice(0, 36),
    marca: `e2e-25b-${proyecto}`,
  };
}

/**
 * Lee una variable, sin imprimirla nunca.
 *
 * El entorno del proceso gana sobre `.env.local`, que es el mismo orden
 * que usa Next. Además de ser coherente, hace que el guardián se pueda
 * **falsificar**: se puede correr la prueba diciéndole que esto es
 * producción y comprobar que se niega. Un guardián que no se puede
 * ejercitar es una declaración de intenciones.
 */
function variable(nombre: string): string {
  const delProceso = process.env[nombre];
  if (delProceso !== undefined && delProceso !== '') return delProceso.trim();

  const texto = readFileSync(join(RAIZ, '.env.local'), 'utf8');
  const m = texto.match(new RegExp('^' + nombre + '=(.*)$', 'm'));
  return m ? m[1]!.trim().replace(/^["']|["']$/g, '') : '';
}

/** La referencia del proyecto de Supabase, mire donde mire. */
function referenciaDe(cadena: string): string | null {
  if (!cadena) return null;
  try {
    const u = new URL(cadena);
    const porAnfitrion = u.hostname.match(/^(?:db\.)?([a-z0-9]+)\.supabase\.(?:co|net)$/i);
    if (porAnfitrion) return porAnfitrion[1]!;
    // Con el *pooler* el anfitrión es regional y compartido: lo único que
    // identifica al proyecto es el usuario, `postgres.<referencia>`.
    const porUsuario = u.username.match(/^postgres\.([a-z0-9]+)$/i);
    return porUsuario ? porUsuario[1]! : null;
  } catch {
    return null;
  }
}

/**
 * Esta prueba escribe en una base de verdad. Antes de tocar nada, se
 * confirma que sea la de desarrollo.
 *
 * No es una formalidad: el guion crea una inmobiliaria, la llena y la
 * borra. Contra producción eso sería un incidente, y el error no se vería
 * hasta después. Si algo no cuadra, se corta acá y no se ejecuta ni una
 * sentencia.
 */
export function confirmarEntornoDeDesarrollo(): { proyecto: string; entorno: string } {
  const entorno = variable('NEXT_PUBLIC_ENTORNO') || '(sin definir)';
  const refApp = referenciaDe(variable('NEXT_PUBLIC_SUPABASE_URL'));
  const refBase = referenciaDe(variable('SUPABASE_DB_URL'));

  if (entorno === 'produccion') {
    throw new Error(
      'NEXT_PUBLIC_ENTORNO dice «produccion»: esta prueba escribe en la base y no corre contra producción.',
    );
  }
  if (!refApp || !refBase) {
    throw new Error('No se pudo determinar a qué proyecto de Supabase apunta .env.local');
  }
  if (refApp !== refBase) {
    throw new Error(
      'La aplicación y la cadena de base apuntan a proyectos distintos: no se ejecuta nada.',
    );
  }

  // La referencia no es un secreto —viaja en cada petición del navegador—
  // pero igual se recorta: alcanza para reconocerla en un registro.
  return { proyecto: refApp.slice(0, 8) + '…', entorno };
}

function conexion() {
  const texto = readFileSync(join(RAIZ, '.env.local'), 'utf8');
  const url = new URL(texto.match(/^SUPABASE_DB_URL=(.*)$/m)![1]!.trim());
  return new pg.Client({
    host: url.hostname,
    port: Number(url.port) || 5432,
    user: url.username,
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1) || 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  });
}

/** La contraseña de demostración, leída de la semilla. Nunca se imprime. */
export function claveDeDemostracion(): string {
  const semilla = readFileSync(join(RAIZ, 'supabase', 'seed.sql'), 'utf8');
  const m = semilla.match(/crypt\('([^']+)'/);
  if (!m) throw new Error('No se encontró la clave de demostración en la semilla');
  return m[1]!;
}

async function conBase<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = conexion();
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/**
 * Deja el escenario listo: dos inmobiliarias y tres membresías.
 *
 * Es idempotente: si una corrida anterior murió sin limpiar, esto la
 * pisa en vez de chocar contra una clave repetida.
 */
export async function prepararEscenario(e: Escenario): Promise<void> {
  // Primero el entorno. Si no es desarrollo, nada de lo de abajo ocurre.
  confirmarEntornoDeDesarrollo();

  await limpiarEscenario(e);

  await conBase(async (c) => {
    const perfil = async (correo: string) =>
      (await c.query('select id from auth.users where email = $1', [correo])).rows[0]?.id as string;

    const admin = await perfil(CUENTAS.administradora);
    const corredor = await perfil(CUENTAS.corredor);

    if (!admin || !corredor) {
      throw new Error('Faltan cuentas de la semilla en la base de desarrollo');
    }

    // Nadie de los dos puede tener ya una membresía: el panel rechaza a
    // quien pertenece a varias inmobiliarias, y una prueba que caiga en
    // ese caso sin querer falla por el motivo equivocado. Mejor decirlo
    // acá que descifrarlo desde una pantalla.
    const yaSon = await c.query(
      'select count(*)::int n from public.agency_members where user_id = any($1)',
      [[admin, corredor]],
    );
    if (Number(yaSon.rows[0].n) > 0) {
      throw new Error(
        'Las cuentas de prueba ya pertenecen a una inmobiliaria: el escenario no sería válido',
      );
    }

    await c.query(
      `insert into public.agencies (id, name, slug, created_by)
       values ($1, 'Constructora ${e.marca}', 'constructora-${e.marca}', $2)`,
      [e.agenciaA, admin],
    );

    await c.query(
      `insert into public.agency_members (agency_id, user_id, role, can_publish) values
         ($1, $2, 'agency_admin', true),
         ($1, $3, 'agent', true)`,
      [e.agenciaA, admin, corredor],
    );
  });
}

/**
 * Barre todo lo que la prueba pudo haber creado.
 *
 * Se llama al empezar y al terminar, y borra por la marca y no por una
 * lista de ids: si una prueba creó un proyecto que no anotamos, igual
 * cae. Los proyectos se borran antes que las inmobiliarias por la clave
 * foránea, y las tipologías caen solas por `on delete cascade`.
 */
export async function limpiarEscenario(e: Escenario): Promise<void> {
  confirmarEntornoDeDesarrollo();

  await conBase(async (c) => {
    await c.query('delete from public.projects where agency_id = $1', [e.agenciaA]);
    await c.query('delete from public.agency_members where agency_id = $1', [e.agenciaA]);
    await c.query('delete from public.agencies where id = $1', [e.agenciaA]);
  });
}

/** Cuántas filas quedaron de la prueba. Para comprobar la limpieza. */
export async function residuo(e: Escenario) {
  return conBase(async (c) => {
    const q = async (sql: string, p: string[] = []) => Number((await c.query(sql, p)).rows[0]!.n);
    return {
      agencias: await q("select count(*)::int n from public.agencies where slug like $1", [
        `%${e.marca}%`,
      ]),
      miembros: await q(
        'select count(*)::int n from public.agency_members where agency_id = $1',
        [e.agenciaA],
      ),
      proyectos: await q('select count(*)::int n from public.projects where agency_id = $1', [
        e.agenciaA,
      ]),
    };
  });
}

/** Pone un proyecto en un estado dado. Para probar la regla de borrador. */
export async function forzarEstado(codigo: string, estado: string): Promise<void> {
  confirmarEntornoDeDesarrollo();

  await conBase(async (c) => {
    // Se salta el disparador de transiciones a propósito: acá no se está
    // probando el flujo de aprobación —eso es 25D— sino qué hace el panel
    // cuando encuentra un proyecto que ya no es borrador.
    await c.query('alter table public.projects disable trigger projects_transiciones');
    try {
      await c.query('update public.projects set publication_status = $2 where code = $1', [
        codigo,
        estado,
      ]);
    } finally {
      await c.query('alter table public.projects enable trigger projects_transiciones');
    }
  });
}

/** Entra por el formulario de verdad, como entraría una persona. */
export async function entrar(page: Page, correo: string): Promise<void> {
  await page.goto('/ingresar');
  await page.getByLabel(/correo/i).first().fill(correo);
  await page.getByLabel(/contraseña/i).first().fill(claveDeDemostracion());
  await page.getByRole('button', { name: /ingresar|iniciar/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/ingresar'), { timeout: 20_000 });
}
