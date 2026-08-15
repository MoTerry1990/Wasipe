/**
 * Empaqueta las funciones con esbuild igual que hace Netlify y ejecuta el
 * resultado. Sin esto, todo lo probado corre solo en TypeScript sin
 * empaquetar — y el primer deploy sería el primer test real.
 *
 *   node scripts/probar-bundle.js
 */
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

let fallos = 0;
const ok = (cond, nombre, detalle = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}${detalle ? ' — ' + detalle : ''}`);
  if (!cond) fallos++;
};

const salida = mkdtempSync(join(tmpdir(), 'wasipe-bundle-'));

console.log('\n  Empaquetado (como lo hace Netlify)\n');

for (const fn of ['api', 'sitemap']) {
  const archivo = join(salida, `${fn}.mjs`);
  try {
    const r = await build({
      entryPoints: [`netlify/functions/${fn}.ts`],
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'esm',
      outfile: archivo,
      metafile: true,
      logLevel: 'silent',
    });
    const bytes = Object.values(r.metafile.outputs)[0]?.bytes ?? 0;
    ok(true, `${fn}.ts empaqueta`, `${Math.round(bytes / 1024)} KB`);
  } catch (e) {
    ok(false, `${fn}.ts empaqueta`, e.message.split('\n')[0]);
  }
}

console.log('\n  Ejecución del bundle\n');
{
  const mod = await import(pathToFileURL(join(salida, 'api.mjs')).href);
  ok(typeof mod.default === 'function', 'exporta un handler fetch por defecto');

  const r = await mod.default(new Request('https://wasipe.netlify.app/api/v1/salud'));
  ok(r instanceof Response, 'devuelve una Response estándar');
  ok(r.status === 503, 'responde /salud (503 sin base, como corresponde)', `status ${r.status}`);

  const b = await r.json();
  ok(b.bd === 'sin-conexion', 'con el cuerpo esperado', b.bd);

  // Así es como llega de verdad en Netlify tras el redirect de netlify.toml.
  // Si el prefijo interno no se quita, Hono no reconoce la ruta y todo da 404.
  const rInterna = await mod.default(
    new Request('https://wasipe.netlify.app/.netlify/functions/api/api/v1/salud'),
  );
  ok(rInterna.status === 503,
     'funciona con el prefijo interno /.netlify/functions/api',
     `status ${rInterna.status}`);
  ok((await rInterna.json()).bd === 'sin-conexion', 'y devuelve el mismo cuerpo');

  const rProp = await mod.default(
    new Request('https://wasipe.netlify.app/.netlify/functions/api/api/v1/ubicaciones/sugerir?q=mira'),
  );
  ok(rProp.status !== 404, 'las rutas de módulos también resuelven tras el redirect',
     `status ${rProp.status}`);

  const r404 = await mod.default(new Request('https://wasipe.netlify.app/api/v1/nada'));
  ok(r404.status === 404, 'el 404 también funciona empaquetado');

  const rPost = await mod.default(
    new Request('https://wasipe.netlify.app/api/v1/cuentas/ingresar', { method: 'POST', body: '{}' }),
  );
  ok(rPost.status === 400, 'la guarda de content-type sobrevive al empaquetado');
}
{
  const mod = await import(pathToFileURL(join(salida, 'sitemap.mjs')).href);
  const r = await mod.default();
  const xml = await r.text();
  ok(r.headers.get('content-type')?.includes('xml'), 'el sitemap sirve XML');
  ok(xml.includes('<urlset'), 'con urlset válido');
  ok(xml.includes('wasipe.netlify.app'), 'y URLs absolutas');
}

console.log(fallos === 0 ? '\n  ✓ Todo en verde.\n' : `\n  ✗ ${fallos} fallo(s).\n`);
process.exit(fallos === 0 ? 0 : 1);
