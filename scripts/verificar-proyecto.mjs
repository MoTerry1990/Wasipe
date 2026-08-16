/**
 * Confirma a qué proyecto de Supabase estamos conectados y si está vacío.
 *
 * Se corre ANTES de aplicar ninguna migración, y por dos motivos que no
 * son el mismo:
 *
 *  1. **Al proyecto correcto.** Aplicar 27 migraciones al proyecto
 *     equivocado no se deshace con un botón. Si esa base tenía datos, hay
 *     que restaurar una copia; si no los tenía, quedan 27 migraciones
 *     donde nadie las esperaba.
 *
 *  2. **A una base vacía.** Si ya hay tablas, algo se aplicó antes y hay
 *     que mirar qué, no encima de qué.
 *
 * Todo lo que hace es leer. No crea, no altera y no borra nada.
 *
 * Uso:
 *   node scripts/verificar-proyecto.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const verde = (t) => `\x1b[32m${t}\x1b[0m`;
const rojo = (t) => `\x1b[31m${t}\x1b[0m`;
const gris = (t) => `\x1b[90m${t}\x1b[0m`;
const amarillo = (t) => `\x1b[33m${t}\x1b[0m`;

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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

console.log('\nVerificación previa a las migraciones');
console.log(gris('Solo lectura. No se crea, altera ni borra nada.\n'));

if (!url || !anon) {
  console.log(rojo('Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY.'));
  console.log(gris('Complétalas en .env.local y vuelve a correr esto.\n'));
  process.exit(1);
}

// ---------------------------------------------------------------------
// A qué proyecto apunta
// ---------------------------------------------------------------------

/**
 * La referencia del proyecto sale del subdominio: `abcdefgh.supabase.co`.
 * NO es un secreto —viaja en cada petición del navegador— y es
 * justamente lo que hay que mirar para saber si es el proyecto correcto.
 */
let referencia = null;
let anfitrion = null;

try {
  anfitrion = new URL(url).host;
  referencia = anfitrion.split('.')[0];
} catch {
  console.log(rojo(`La URL no tiene forma de dirección: ${url.slice(0, 30)}…`));
  process.exit(1);
}

console.log(`  Anfitrión:  ${anfitrion}`);
console.log(`  Proyecto:   ${verde(referencia)}`);

// La clave anónima se comprueba solo por forma y por largo. Nunca se
// imprime: es pública, pero imprimirla la deja en el historial del shell
// para nada.
console.log(`  Clave anon: ${anon.length} caracteres, empieza en «${anon.slice(0, 3)}…»`);
console.log();

if (!/^[a-z]{20}$/.test(referencia)) {
  console.log(
    amarillo('  ⚠  La referencia no tiene la forma habitual. Confírmala en el panel.\n'),
  );
}

// ---------------------------------------------------------------------
// Qué hay dentro
// ---------------------------------------------------------------------

/**
 * PostgREST publica su esquema en la raíz de la API. Es una petición de
 * solo lectura y no necesita permisos especiales: devuelve qué tablas ve
 * el rol anónimo.
 *
 * Con la base vacía no hay nada que ver, que es exactamente lo que se
 * quiere confirmar antes de migrar.
 */
async function mirarLaBase() {
  const respuesta = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  });

  if (!respuesta.ok) {
    return { ok: false, motivo: `La API respondió ${respuesta.status}` };
  }

  const esquema = await respuesta.json();
  const tablas = Object.keys(esquema?.definitions ?? esquema?.paths ?? {})
    .filter((t) => t !== '/' && !t.startsWith('/rpc/'))
    .map((t) => t.replace(/^\//, ''));

  return { ok: true, tablas };
}

try {
  const resultado = await mirarLaBase();

  if (!resultado.ok) {
    console.log(rojo(`  No se pudo consultar: ${resultado.motivo}`));
    console.log(gris('  Revisa que la URL y la clave sean del mismo proyecto.\n'));
    process.exit(1);
  }

  const { tablas } = resultado;

  if (tablas.length === 0) {
    console.log(verde('  ✓ La base está vacía. Se puede migrar.'));
    console.log(gris('    Ninguna tabla publicada en el esquema público.\n'));
    process.exit(0);
  }

  console.log(amarillo(`  ⚠ La base YA tiene ${tablas.length} tabla(s):`));
  for (const tabla of tablas.slice(0, 20)) console.log(`      ${tabla}`);
  if (tablas.length > 20) console.log(`      … y ${tablas.length - 20} más`);
  console.log();
  console.log(amarillo('  No se migra encima sin mirar. Copia de seguridad primero.\n'));
  process.exit(2);
} catch (error) {
  console.log(rojo(`  Falló la conexión: ${error.message}`));
  console.log(gris('  ¿El proyecto está activo? ¿La URL es la correcta?\n'));
  process.exit(1);
}
