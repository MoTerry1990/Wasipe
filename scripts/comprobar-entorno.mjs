/**
 * Dice qué variables están y cuáles faltan, sin mostrar ningún valor.
 *
 * Es la parte importante. Un secreto impreso en una terminal queda en el
 * historial del shell, en el desplazamiento, y en cualquier captura de
 * pantalla que alguien saque después para pedir ayuda. Así que acá solo
 * salen tres cosas: si está, cuántos caracteres tiene, y sus primeros
 * tres. Con eso alcanza para saber si alguien pegó la clave equivocada.
 *
 * Uso:
 *   node scripts/comprobar-entorno.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Lee `.env.local` además del entorno del proceso.
 *
 * Node no carga ese archivo solo, así que sin esto el script decía que
 * faltaba todo aunque estuviera completo. Un verificador que no puede
 * verificar es peor que ninguno: da confianza falsa en las dos
 * direcciones.
 *
 * Los valores se leen para poder decir cuántos caracteres tienen. No se
 * imprimen nunca.
 */
function cargarEnvLocal() {
  const ruta = join(process.cwd(), '.env.local');
  if (!existsSync(ruta)) return { encontrado: false };

  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;

    const corte = limpia.indexOf('=');
    if (corte < 1) continue;

    const nombre = limpia.slice(0, corte).trim();
    // Se quitan las comillas si alguien las pegó junto con el valor.
    const valor = limpia
      .slice(corte + 1)
      .trim()
      .replace(/^["']|["']$/g, '');

    // El entorno del proceso manda: si alguien exportó la variable a
    // mano, es la que va a usar la aplicación.
    if (valor && !process.env[nombre]) process.env[nombre] = valor;
  }

  return { encontrado: true };
}

const envLocal = cargarEnvLocal();

const VARIABLES = [
  // [nombre, obligatoria, publicaAProposito, para qué]
  ['NEXT_PUBLIC_SUPABASE_URL', true, true, 'Dirección del proyecto de Supabase'],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', true, true, 'Autenticar desde el navegador'],
  [
    'SUPABASE_SERVICE_ROLE_KEY',
    true,
    false,
    'Operaciones del servidor sobre datos de terceros',
  ],
  ['SUPABASE_DB_URL', false, false, 'Conexión directa, solo para migrar'],

  ['NEXT_PUBLIC_URL_SITIO', true, true, 'Canónicas, sitemap y Open Graph'],
  ['NEXT_PUBLIC_ENTORNO', false, true, 'Separar Preview de producción'],

  ['NEXT_PUBLIC_SENTRY_DSN', false, true, 'Dónde mandar los errores'],
  ['SENTRY_AUTH_TOKEN', false, false, 'Subir source maps en el build'],

  ['IA_PROVEEDOR', false, false, 'Qué adaptador de texto usa Wasi AI'],
  ['ANTHROPIC_API_KEY', false, false, 'Clave del proveedor de texto'],

  ['NEXT_PUBLIC_MAPBOX_TOKEN', false, true, 'Cartografía de fondo del mapa'],

  ['PAGOS_EN_VIVO', true, false, 'El interruptor de cobros reales'],
  ['CULQI_SECRET_KEY', false, false, 'Cobrar de verdad'],
];

const verde = (t) => `\x1b[32m${t}\x1b[0m`;
const rojo = (t) => `\x1b[31m${t}\x1b[0m`;
const gris = (t) => `\x1b[90m${t}\x1b[0m`;
const amarillo = (t) => `\x1b[33m${t}\x1b[0m`;

/** Lo único que se muestra de un valor. Nunca el valor. */
function huella(valor) {
  if (!valor) return '—';
  const inicio = valor.slice(0, 3);
  return `${valor.length} car., empieza en «${inicio}…»`;
}

let faltanObligatorias = 0;
let problemas = 0;

console.log('\nVariables de entorno de Wasipe');
console.log(gris('Ningún valor se imprime. Solo largo y prefijo.\n'));

for (const [nombre, obligatoria, publica, paraQue] of VARIABLES) {
  const valor = process.env[nombre];
  const estado = valor ? verde('presente') : obligatoria ? rojo('FALTA') : gris('sin definir');

  console.log(`${estado.padEnd(20)} ${nombre}`);
  console.log(`${' '.repeat(12)} ${gris(paraQue)}`);
  if (valor) console.log(`${' '.repeat(12)} ${gris(huella(valor))}`);

  if (!valor && obligatoria) faltanObligatorias++;

  // Lo que de verdad hay que cazar: un secreto con prefijo de navegador.
  if (valor && nombre.startsWith('NEXT_PUBLIC_') && !publica) {
    console.log(`${' '.repeat(12)} ${rojo('ERROR: esta variable NO puede ser pública')}`);
    problemas++;
  }

  // Un marcador de posición sin reemplazar cuenta como «presente» si solo
  // se mira si hay algo escrito, y esa comprobación a medias ya costó un
  // intento de migración: la cadena de conexión venía del panel con
  // `[YOUR-PASSWORD]` literal adentro y no falló hasta el `db push`.
  if (valor && /\[[^\]]*\]|your.?password|tu.?contrase/i.test(valor)) {
    console.log(
      `${' '.repeat(12)} ${rojo('ERROR: quedó el marcador de posición del panel sin reemplazar')}`,
    );
    problemas++;
  }

  console.log();
}

// El interruptor de pagos merece su propia línea: es la que no puede
// estar mal.
const pagos = process.env.PAGOS_EN_VIVO?.trim().toLowerCase();
if (pagos === 'si') {
  console.log(rojo('⚠  PAGOS_EN_VIVO está ENCENDIDO. Los cobros reales están activos.\n'));
  problemas++;
} else {
  console.log(verde('✓  Los cobros reales están apagados.\n'));
}

// Una clave de producción de Culqi cargada por error no cobra nada
// —manda el interruptor— pero avisa de que alguien se equivocó de entorno.
const culqi = process.env.CULQI_SECRET_KEY ?? '';
if (culqi.startsWith('sk_live_')) {
  console.log(amarillo('⚠  Hay una clave de Culqi de PRODUCCIÓN cargada.\n'));
}

if (faltanObligatorias > 0) {
  console.log(rojo(`Faltan ${faltanObligatorias} variables obligatorias.`));
}
if (problemas > 0) {
  console.log(rojo(`Hay ${problemas} problema(s) que hay que corregir antes de desplegar.`));
}
if (faltanObligatorias === 0 && problemas === 0) {
  console.log(verde('Todo lo obligatorio está y nada está donde no debe.'));
}

console.log();
process.exit(faltanObligatorias > 0 || problemas > 0 ? 1 : 0);
