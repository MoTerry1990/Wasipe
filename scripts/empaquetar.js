/**
 * Arma un zip listo para arrastrar a Netlify.
 *
 * En deploy manual Netlify no corre `npm install` ni el build, así que las
 * funciones se empaquetan acá con esbuild — autocontenidas, con el esquema
 * embebido adentro. Igual que hacía el api.js original.
 *
 *   node scripts/empaquetar.js
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RAIZ, 'dist');
const ZIP = join(RAIZ, 'wasipe-deploy.zip');

console.log('\n  Empaquetando Wasipe\n');

// 1 · esquema embebido, siempre fresco
execFileSync(process.execPath, [join(RAIZ, 'scripts', 'generar-migraciones-embebidas.js')], {
  stdio: 'inherit',
});

// 2 · limpiar
rmSync(DIST, { recursive: true, force: true });
rmSync(ZIP, { force: true });
mkdirSync(join(DIST, 'netlify', 'functions'), { recursive: true });

// 3 · frontend
cpSync(join(RAIZ, 'public'), join(DIST, 'public'), { recursive: true });
console.log('  ✓ public/ copiado');

// 4 · funciones empaquetadas
for (const fn of ['api', 'sitemap']) {
  const r = await build({
    entryPoints: [join(RAIZ, 'netlify', 'functions', `${fn}.ts`)],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: join(DIST, 'netlify', 'functions', `${fn}.mjs`),
    minify: true,
    metafile: true,
    logLevel: 'silent',
  });
  const kb = Math.round((Object.values(r.metafile.outputs)[0]?.bytes ?? 0) / 1024);
  console.log(`  ✓ ${fn}.mjs empaquetada — ${kb} KB`);
}

// 5 · netlify.toml mínimo para deploy manual
//
// Se escribe entero en vez de editar el del repo: el de desarrollo lleva
// `command`, `node_bundler` y `[build.environment]`, y en un drop eso hace
// que Netlify intente un build que no puede completar (no hay package.json
// ni node_modules). Acá solo enrutado y cabeceras.
const toml = `# Generado por scripts/empaquetar.js — deploy manual.
# Las funciones ya vienen empaquetadas: no hay build ni bundler.

[build]
  publish   = "public"
  functions = "netlify/functions"

# ------------------------------------------------------------------- API
[[redirects]]
  from   = "/api/v1/*"
  to     = "/.netlify/functions/api/api/v1/:splat"
  status = 200
  force  = true

[[redirects]]
  from   = "/sitemap.xml"
  to     = "/.netlify/functions/sitemap"
  status = 200
  force  = true

# --------------------------------------------------------- rutas limpias
[[redirects]]
  from = "/buscar"
  to   = "/buscar.html"
  status = 200

[[redirects]]
  from = "/propiedad/*"
  to   = "/propiedad.html"
  status = 200

[[redirects]]
  from = "/publicar"
  to   = "/publicar.html"
  status = 200

[[redirects]]
  from = "/publicar/*"
  to   = "/publicar.html"
  status = 200

[[redirects]]
  from = "/ingresar"
  to   = "/ingresar.html"
  status = 200

[[redirects]]
  from = "/registro"
  to   = "/registro.html"
  status = 200

[[redirects]]
  from = "/panel"
  to   = "/panel.html"
  status = 200

# --------------------------------------------------------------- headers
[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options    = "nosniff"
    X-Frame-Options           = "DENY"
    Referrer-Policy           = "strict-origin-when-cross-origin"
    Strict-Transport-Security = "max-age=31536000; includeSubDomains"
    Content-Security-Policy   = "default-src 'self'; img-src 'self' https://res.cloudinary.com data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' https://api.cloudinary.com https://pago.culqi.com; frame-ancestors 'none'"

[[headers]]
  for = "/og.png"
  [headers.values]
    Cache-Control = "public, max-age=604800"
`;
writeFileSync(join(DIST, 'netlify.toml'), toml, 'utf8');
console.log('  ✓ netlify.toml mínimo (sin build ni bundler)');

// 6 · instrucciones dentro del zip
writeFileSync(
  join(DIST, 'LEEME.txt'),
  [
    'WASIPE — deploy manual',
    '======================',
    '',
    '1. Arrastra este zip a Netlify (Add new project > Deploy manually).',
    '',
    '2. Site configuration > Environment variables, agrega:',
    '     DATABASE_URL   la cadena de conexion de Neon',
    '     JWT_SECRET     genera una con:  openssl rand -base64 48',
    '',
    '3. Vuelve a desplegar (o arrastra el zip otra vez) para que la',
    '   funcion tome las variables.',
    '',
    '4. Abre  /api/v1/salud',
    '   Debe decir:  {"ok":true,"bd":"conectada"}',
    '   En el primer request se crean las 33 tablas solas.',
    '',
    'Sin DATABASE_URL el sitio se ve pero la API responde 503.',
    '',
  ].join('\n'),
  'utf8',
);

// 7 · zip
//
// Con Python, no con Compress-Archive: PowerShell escribe los nombres con
// '\' y eso rompe el ZIP para cualquier sistema que no sea Windows.
// Netlify (Linux) no ve carpetas y el deploy falla en Initializing.
execFileSync('python', [join(RAIZ, 'scripts', 'zip.py'), DIST, ZIP], { stdio: 'inherit' });

const kb = Math.round(readFileSync(ZIP).length / 1024);
console.log(`\n  ✓ ${ZIP}  (${kb} KB)\n`);
