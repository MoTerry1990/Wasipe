/**
 * Confirma a qué proyecto se estaría migrando, y en qué estado está.
 *
 * Se corre ANTES de `db:push`. Todo lo que hace es leer: no crea, no
 * altera y no borra nada, ni en la base ni en el disco.
 *
 * ### Qué cambió en el sprint 24 (P-39)
 *
 * La versión anterior respondía «¿la base está vacía?» y salía con código
 * 2 cuando no lo estaba. Se escribió para la primera migración, cuando
 * vacía era lo correcto; desde entonces la base siempre tiene tablas, así
 * que el 2 pasó a ser permanente y la regla «con código 2 no se migra»
 * habría prohibido toda migración incremental para siempre.
 *
 * Ahora distingue cinco estados y reserva el bloqueo para lo que de
 * verdad no se deshace: el proyecto equivocado y el entorno equivocado.
 * Que la base tenga tablas es lo normal, no una alarma.
 *
 * La decisión vive en `verificar-proyecto.logica.mjs`, aparte y sin
 * entrada ni salida, para que se pueda probar sin una base de verdad.
 *
 * Uso:
 *   node scripts/verificar-proyecto.mjs
 *   node scripts/verificar-proyecto.mjs --json
 *   node scripts/verificar-proyecto.mjs --permitir-produccion
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { decidir, referenciaDe, referenciaDeUsuario, CODIGOS } from './verificar-proyecto.logica.mjs';

const verde = (t) => `\x1b[32m${t}\x1b[0m`;
const rojo = (t) => `\x1b[31m${t}\x1b[0m`;
const gris = (t) => `\x1b[90m${t}\x1b[0m`;
const amarillo = (t) => `\x1b[33m${t}\x1b[0m`;

const COMO_JSON = process.argv.includes('--json');
const PERMITIR_PRODUCCION = process.argv.includes('--permitir-produccion');

// ---------------------------------------------------------------------
// Leer .env.local sin imprimir nada
// ---------------------------------------------------------------------

function cargar() {
  const ruta = join(process.cwd(), '.env.local');
  if (!existsSync(ruta)) return;

  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const corte = limpia.indexOf('=');
    if (corte < 1) continue;
    const nombre = limpia.slice(0, corte).trim();
    const valor = limpia
      .slice(corte + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (valor && !process.env[nombre]) process.env[nombre] = valor;
  }
}

cargar();

const urlDeLaApp = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const cadena = process.env.SUPABASE_DB_URL ?? '';
const entorno = (process.env.NEXT_PUBLIC_ENTORNO ?? '').trim();

/**
 * De dónde sale la referencia del proyecto en cada caso.
 *
 * Con la conexión directa está en el anfitrión (`db.<ref>.supabase.co`).
 * Con el *pooler* el anfitrión es regional y compartido, así que lo único
 * que identifica al proyecto es el usuario: `postgres.<ref>`. Hay que
 * mirar los dos o la comprobación se vuelve ciega justo con el pooler,
 * que es la conexión que se usa hoy.
 */
function referenciaDeLaCadena(texto) {
  if (!texto) return null;
  try {
    const u = new URL(texto);
    return referenciaDe(u.hostname) ?? referenciaDeUsuario(u.username);
  } catch {
    return null;
  }
}

async function mirarLaBase(texto) {
  const u = new URL(texto);
  const cliente = new pg.Client({
    host: u.hostname,
    port: Number(u.port) || 5432,
    user: u.username,
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1) || 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  });

  await cliente.connect();
  try {
    const tablas = (
      await cliente.query(
        "select count(*)::int n from information_schema.tables where table_schema = 'public'",
      )
    ).rows[0].n;

    // Si el esquema de migraciones no existe, es una base virgen: cero
    // aplicadas, no un error.
    let aplicadas = [];
    const hay = (
      await cliente.query(
        "select count(*)::int n from information_schema.tables where table_schema = 'supabase_migrations' and table_name = 'schema_migrations'",
      )
    ).rows[0].n;

    if (hay > 0) {
      aplicadas = (
        await cliente.query(
          'select version from supabase_migrations.schema_migrations order by version',
        )
      ).rows.map((r) => String(r.version));
    }

    return { tablas, aplicadas };
  } finally {
    await cliente.end();
  }
}

function migracionesEnDisco() {
  const carpeta = join(process.cwd(), 'supabase', 'migrations');
  if (!existsSync(carpeta)) return [];
  return readdirSync(carpeta)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => f.split('_')[0])
    .sort();
}

// ---------------------------------------------------------------------
// Correr
// ---------------------------------------------------------------------

const refDeLaApp = referenciaDeLaCadena(urlDeLaApp);
const refDeLaBase = referenciaDeLaCadena(cadena);

let veredicto;

if (!urlDeLaApp || !cadena) {
  veredicto = decidir({ fallo: 'configuracion' });
} else {
  try {
    const { tablas, aplicadas } = await mirarLaBase(cadena);
    veredicto = decidir({
      refDeLaApp,
      refDeLaBase,
      entorno,
      tablas,
      aplicadas,
      enDisco: migracionesEnDisco(),
      permitirProduccion: PERMITIR_PRODUCCION,
    });
  } catch (error) {
    // La referencia se comprueba igual: si el proyecto es el equivocado,
    // eso importa más que el motivo por el que no conectó.
    veredicto =
      refDeLaApp && refDeLaBase && refDeLaApp !== refDeLaBase
        ? decidir({ refDeLaApp, refDeLaBase, entorno, tablas: 0, aplicadas: [], enDisco: [] })
        : decidir({ fallo: error.message });
  }
}

/**
 * Se asigna `process.exitCode` en vez de llamar a `process.exit()`: en
 * Windows, cortar el proceso con una conexión todavía abierta hace que
 * libuv aborte y ese aborto pisa el código de salida con un 127. Justo el
 * código que este script existe para comunicar.
 */
process.exitCode = veredicto.codigo;

if (COMO_JSON) {
  console.log(
    JSON.stringify(
      {
        estado: veredicto.estado,
        codigo: veredicto.codigo,
        proyecto: refDeLaBase,
        entorno: entorno || null,
        pendientes: veredicto.pendientes,
        desconocidas: veredicto.desconocidas ?? [],
      },
      null,
      2,
    ),
  );
} else {
  const color =
    veredicto.codigo === CODIGOS.CONTINUAR
      ? verde
      : veredicto.codigo === CODIGOS.BLOQUEO
        ? rojo
        : amarillo;

  console.log('\nVerificación previa a las migraciones');
  console.log(gris('Solo lectura. No se crea, altera ni borra nada.\n'));

  if (refDeLaBase) console.log(`  Proyecto: ${verde(refDeLaBase)}`);
  if (entorno) console.log(`  Entorno:  ${entorno}`);
  console.log();

  console.log(color(`  ${veredicto.titulo}`));
  for (const linea of veredicto.detalle) console.log(gris(`    ${linea}`));

  if (veredicto.pendientes?.length) {
    console.log();
    console.log('  Se aplicarían:');
    for (const v of veredicto.pendientes) console.log(`    ${v}`);
  }

  if (veredicto.desconocidas?.length) {
    console.log();
    console.log(amarillo('  Aplicadas que no están en el repositorio:'));
    for (const v of veredicto.desconocidas) console.log(`    ${v}`);
    console.log(gris('    Alguien migró desde otro lado, o se borró un archivo.'));
  }

  console.log();
}
