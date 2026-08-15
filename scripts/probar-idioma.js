/**
 * Detector de textos en inglés en lo que ve el usuario.
 *
 * Regla de localización: todo lo visible va en español peruano. El código
 * (variables, tablas, funciones) puede seguir convenciones en inglés — esto
 * NO lo revisa. Solo mira:
 *
 *   · texto entre etiquetas en las páginas de public/
 *   · atributos que se leen: placeholder, title, alt, aria-label
 *   · mensajes de error y avisos que devuelve la API
 *
 *   node scripts/probar-idioma.js
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Palabras que delatan interfaz en inglés. Se buscan como palabra completa. */
const PROHIBIDAS = [
  'buy', 'rent', 'projects', 'search', 'get info', 'publish for free',
  'sign in', 'sign up', 'log in', 'login', 'logout', 'dashboard', 'settings',
  'submit', 'cancel', 'delete', 'edit', 'save', 'loading', 'next', 'back',
  'continue', 'price', 'bedrooms', 'bathrooms', 'features', 'contact',
  'send message', 'view all', 'see more', 'read more', 'home', 'about',
  'my account', 'my profile', 'my properties', 'listings', 'favorites',
  'saved', 'notifications', 'help', 'support', 'terms', 'privacy',
  'required', 'optional', 'error', 'success', 'warning', 'welcome',
  'upload', 'download', 'share', 'filter', 'sort by', 'results',
  'no results', 'try again', 'coming soon', 'learn more', 'get started',
];

/* Palabras inglesas que SÍ se aceptan: marcas, formatos, siglas de uso real. */
const PERMITIDAS = new Set([
  'wasipe', 'whatsapp', 'google', 'cloudinary', 'culqi', 'netlify', 'neon',
  'email', 'web', 'online', 'wifi', 'loft', 'penthouse', 'lobby', 'hall',
  'ok', 'sunat', 'indecopi', 'inei', 'sbs', 'ruc', 'dni', 'igv',
]);

const HTML_VACIAS = /<(script|style|template)[\s\S]*?<\/\1>/gi;
const ETIQUETAS = /<[^>]+>/g;
const ENTIDADES = /&[a-z]+;|&#\d+;/gi;

/** Saca el texto que realmente lee una persona. */
function textoVisible(html) {
  const partes = [];

  // Atributos que se muestran o se leen en voz alta.
  for (const m of html.matchAll(/\b(placeholder|title|alt|aria-label)\s*=\s*"([^"]*)"/gi)) {
    if (m[2]?.trim()) partes.push(m[2]);
  }

  // Texto entre etiquetas, quitando script/style.
  const limpio = html
    .replace(HTML_VACIAS, ' ')
    .replace(ETIQUETAS, ' ')
    .replace(ENTIDADES, ' ');
  partes.push(limpio);

  return partes.join('\n');
}

/**
 * Cadenas que la API devuelve al usuario: el primer argumento de
 * ErrorHTTP(...) y los campos `mensaje:` y `aviso:`.
 */
function textoDeApi(ts) {
  const partes = [];
  for (const m of ts.matchAll(/ErrorHTTP\(\s*\d+\s*,\s*(['"`])([\s\S]*?)\1/g)) partes.push(m[2]);
  for (const m of ts.matchAll(/\b(mensaje|aviso)\s*:\s*(['"`])([\s\S]*?)\2/g)) partes.push(m[3]);
  return partes.join('\n');
}

function revisar(texto, archivo, hallazgos) {
  const bajo = texto.toLowerCase();
  for (const palabra of PROHIBIDAS) {
    const re = new RegExp(`(^|[^a-záéíóúñü])${palabra.replace(/ /g, '\\s+')}([^a-záéíóúñü]|$)`, 'i');
    const m = bajo.match(re);
    if (!m) continue;

    // Contexto, para poder juzgar el falso positivo.
    const i = bajo.indexOf(m[0]);
    const contexto = texto.slice(Math.max(0, i - 40), i + 60).replace(/\s+/g, ' ').trim();
    if ([...PERMITIDAS].some((p) => contexto.toLowerCase().includes(p) && p.includes(palabra))) continue;

    hallazgos.push({ archivo, palabra, contexto });
  }
}

/* ------------------------------ recorrido ------------------------------ */

const hallazgos = [];

// Páginas públicas
const dirPublico = join(RAIZ, 'public');
function recorrer(dir) {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) { recorrer(ruta); continue; }
    if (!entrada.name.endsWith('.html')) continue;
    const html = readFileSync(ruta, 'utf8');
    revisar(textoVisible(html), relative(RAIZ, ruta), hallazgos);
  }
}
recorrer(dirPublico);

// Mensajes de la API
function recorrerTs(dir) {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) { recorrerTs(ruta); continue; }
    if (!/\.(ts|js)$/.test(entrada.name)) continue;
    if (entrada.name.endsWith('.d.ts')) continue;
    const ts = readFileSync(ruta, 'utf8');
    revisar(textoDeApi(ts), relative(RAIZ, ruta), hallazgos);
  }
}
recorrerTs(join(RAIZ, 'src'));

/* ------------------------------- reporte ------------------------------- */

console.log('\n  Revisión de idioma — textos visibles en español\n');

if (hallazgos.length === 0) {
  console.log('  ✓ No se encontraron textos en inglés en la interfaz.\n');
  process.exit(0);
}

for (const h of hallazgos) {
  console.log(`  ✗ ${h.archivo} — "${h.palabra}"`);
  console.log(`      …${h.contexto}…`);
}
console.log(`\n  ✗ ${hallazgos.length} texto(s) en inglés.\n`);
process.exit(1);
