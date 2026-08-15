/**
 * Prueba el módulo de ubicaciones contra Postgres real (PGlite),
 * con los 74 distritos sembrados de verdad.
 *
 *   node --experimental-strip-types scripts/probar-ubicaciones.js
 */
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dividirSql } from '../src/db/dividir-sql.js';
import { sembrar } from './sembrar-ubicaciones.js';

process.env.JWT_SECRET ??= 'secreto-solo-para-pruebas';

const { usarBackend } = await import('../src/db/cliente.ts');
const { app } = await import('../src/app.ts');

const CARPETA = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'db', 'migraciones');

const db = new PGlite({ extensions: { pg_trgm, unaccent, btree_gist } });
await db.waitReady;
await db.exec(`CREATE TABLE IF NOT EXISTS migraciones (
  nombre TEXT PRIMARY KEY, aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now())`);
for (const archivo of readdirSync(CARPETA).filter((x) => x.endsWith('.sql')).sort()) {
  for (const st of dividirSql(readFileSync(join(CARPETA, archivo), 'utf8'))) await db.exec(st);
  // Registrarlas evita que asegurarEsquema() las vuelva a aplicar.
  await db.query(`INSERT INTO migraciones (nombre) VALUES ($1)
                  ON CONFLICT (nombre) DO NOTHING`, [archivo]);
}

const consulta = async (t, p) => (await db.query(t, p)).rows;
usarBackend(consulta);

let fallos = 0;
const ok = (cond, nombre, detalle = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}${detalle ? ' — ' + detalle : ''}`);
  if (!cond) fallos++;
};
const get = (ruta) => app.request(`/api/v1${ruta}`);
const json = async (ruta) => (await get(ruta)).json();

console.log('\n  Siembra\n');
{
  const r = await sembrar(consulta);
  // La migración 004 ya las sembró, así que acá lo que importa es que
  // volver a correrlo deje el total correcto, no cuántas eran nuevas.
  ok(r.nuevas + r.actualizadas === r.total, `procesó las ${r.total} ubicaciones`,
     `${r.nuevas} nuevas, ${r.actualizadas} actualizadas`);

  const r2 = await sembrar(consulta);
  ok(r2.nuevas === 0 && r2.actualizadas === r2.total,
     'volver a correrla no duplica nada (idempotente)', `${r2.actualizadas} actualizadas`);

  const lima = (await consulta(
    `SELECT count(*)::int n FROM ubicaciones WHERE provincia='Lima'`))[0];
  ok(lima.n === 43, 'Lima tiene sus 43 distritos', `${lima.n}`);

  const callao = (await consulta(
    `SELECT count(*)::int n FROM ubicaciones WHERE departamento='Callao'`))[0];
  ok(callao.n === 7, 'Callao tiene sus 7 distritos', `${callao.n}`);
}

console.log('\n  Autocompletado\n');
{
  const b = await json('/ubicaciones/sugerir?q=mira');
  ok(b.sugerencias[0]?.distrito === 'Miraflores', 'prefijo: "mira" → Miraflores',
     b.sugerencias[0]?.distrito);
}
{
  const b = await json('/ubicaciones/sugerir?q=jesus maria');
  ok(b.sugerencias[0]?.distrito === 'Jesús María',
     'sin tildes: "jesus maria" → Jesús María', b.sugerencias[0]?.distrito);
}
{
  const b = await json('/ubicaciones/sugerir?q=surco');
  ok(b.sugerencias[0]?.distrito === 'Santiago de Surco',
     'alias: "surco" → Santiago de Surco', b.sugerencias[0]?.distrito);
}
{
  const b = await json('/ubicaciones/sugerir?q=mirafores');
  ok(b.sugerencias.some((s) => s.distrito === 'Miraflores'),
     'typo: "mirafores" → Miraflores (trigramas)',
     b.sugerencias[0]?.distrito);
}
{
  const b = await json('/ubicaciones/sugerir?q=SJL');
  ok(b.sugerencias[0]?.distrito === 'San Juan de Lurigancho',
     'abreviatura: "SJL" → San Juan de Lurigancho', b.sugerencias[0]?.distrito);
}
{
  const b = await json('/ubicaciones/sugerir?q=magdalena');
  ok(b.sugerencias.some((s) => s.distrito === 'Magdalena del Mar'),
     '"magdalena" → Magdalena del Mar');
  ok(b.sugerencias.some((s) => s.distrito === 'Pueblo Libre'),
     'y también Pueblo Libre, por su alias "Magdalena Vieja"');
}
{
  const b = await json('/ubicaciones/sugerir?q=chosica');
  ok(b.sugerencias[0]?.distrito === 'Lurigancho',
     'alias "Chosica" → Lurigancho', b.sugerencias[0]?.distrito);
}
{
  const b = await json('/ubicaciones/sugerir?q=a');
  ok(b.sugerencias.length === 0, 'con menos de 2 letras no sugiere nada');
}
{
  const b = await json('/ubicaciones/sugerir?q=zzzzzz');
  ok(b.sugerencias.length === 0, 'sin coincidencias devuelve lista vacía');
}
{
  const b = await json('/ubicaciones/sugerir?q=arequipa');
  ok(b.sugerencias[0]?.departamento === 'Arequipa', 'también encuentra provincias');
  ok(b.sugerencias[0]?.etiqueta === 'Arequipa, Arequipa',
     'trae etiqueta lista para mostrar', b.sugerencias[0]?.etiqueta);
}

console.log('\n  Destacadas y árbol\n');
{
  const b = await json('/ubicaciones/destacadas');
  ok(b.destacadas.length === 8, 'devuelve 8 distritos destacados', `${b.destacadas.length}`);
  ok(b.destacadas.every((d) => typeof d.avisos_activos === 'number'),
     'cada uno trae su conteo de avisos activos');
}
{
  const b = await json('/ubicaciones');
  const deps = b.departamentos.map((d) => d.departamento);
  ok(deps.includes('Lima') && deps.includes('Callao') && deps.includes('Cusco'),
     'el árbol agrupa por departamento', `${deps.length} departamentos`);
  const lima = b.departamentos.find((d) => d.departamento === 'Lima');
  ok(lima.provincias[0].distritos.length === 43, 'Lima → Lima → 43 distritos');
}

console.log('\n  Por slug\n');
{
  const r = await get('/ubicaciones/santiago-de-surco');
  const b = await r.json();
  ok(r.status === 200 && b.ubicacion.distrito === 'Santiago de Surco', 'busca por slug');
  ok(b.ubicacion.lat !== null, 'trae coordenadas aproximadas para centrar el mapa');
}
{
  const r = await get('/ubicaciones/no-existe');
  ok(r.status === 404, 'slug inexistente da 404');
}

console.log('\n  Caché\n');
{
  const r = await get('/ubicaciones');
  ok((r.headers.get('cache-control') ?? '').includes('86400'),
     'el árbol se cachea 24 h');
}

console.log(fallos === 0 ? '\n  ✓ Todo en verde.\n' : `\n  ✗ ${fallos} fallo(s).\n`);
await db.close();
process.exit(fallos === 0 ? 0 : 1);
