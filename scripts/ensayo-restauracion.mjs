/**
 * Ensayo de recuperación: respalda staging y lo restaura en una base
 * nueva y aislada del Postgres local.
 *
 * Existe porque `FINAL_AUDIT.md` viene marcando desde el sprint 17 que
 * **nunca se restauró una copia**. Una copia que no se restauró no es una
 * copia, es un archivo: no se sabe si está completa, si el formato se lee
 * ni cuánto tarda. Y eso se descubre el peor día posible.
 *
 * Lo que hace, en orden:
 *
 *   1. Cuenta el origen.
 *   2. `pg_dump` del esquema `public`, con datos.
 *   3. Crea una base nueva en el servidor local, con nombre propio.
 *   4. Le pone lo que el volcado da por sentado y no trae: PostGIS en el
 *      esquema `extensions`, los roles de Supabase y `auth.uid()`.
 *   5. Restaura con **psql**, no con un driver (ver abajo).
 *   6. Compara conteos contra el origen.
 *   7. Borra la base y el archivo.
 *
 * **Por qué psql y no un driver:** `pg_dump` 17 abre y cierra el archivo
 * con `\restrict` y `\unrestrict`, y cierra cada bloque de datos con `\.`.
 * Son metacomandos de psql, no SQL. Alimentar el volcado a un cliente de
 * Postgres da «syntax error at or near "\"» sin decir por qué.
 *
 * Nunca toca staging más que para leer, y nunca imprime una cadena de
 * conexión.
 *
 * Uso:
 *   node scripts/ensayo-restauracion.mjs
 */

import pg from 'pg';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const verde = (t) => `\x1b[32m${t}\x1b[0m`;
const rojo = (t) => `\x1b[31m${t}\x1b[0m`;
const gris = (t) => `\x1b[90m${t}\x1b[0m`;
const amarillo = (t) => `\x1b[33m${t}\x1b[0m`;

const titulo = (t) => {
  console.log(`\n${t}`);
  console.log(gris('─'.repeat(t.length)));
};

function cargar() {
  const ruta = join(process.cwd(), '.env.local');
  if (!existsSync(ruta)) return;
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const l = linea.trim();
    if (!l || l.startsWith('#')) continue;
    const i = l.indexOf('=');
    if (i < 1) continue;
    const n = l.slice(0, i).trim();
    const v = l
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (v && !process.env[n]) process.env[n] = v;
  }
}
cargar();

const ORIGEN = process.env.SUPABASE_DB_URL;
const LOCAL = process.env.LOCAL_DB_URL;
const BASE = 'wasipe_restauracion';
const ARCHIVO = join(tmpdir(), `respaldo-wasipe-${Date.now()}.sql`);

if (!ORIGEN || !LOCAL) {
  console.error(rojo('Faltan SUPABASE_DB_URL o LOCAL_DB_URL en .env.local.'));
  process.exit(1);
}

/** La misma cadena local, apuntando a otra base. */
const conBase = (cadena, nombre) => cadena.replace(/\/[^/?]*(\?|$)/, `/${nombre}$1`);

const conectar = async (cadena) => {
  const esLocal = /localhost|127\.0\.0\.1/.test(cadena);
  const c = new pg.Client({
    connectionString: cadena,
    ...(esLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  });
  await c.connect();
  return c;
};

const OBJETOS = {
  tablas: `select count(*)::int n from pg_tables where schemaname='public'`,
  vistas: `select count(*)::int n from pg_views where schemaname='public'`,
  indices: `select count(*)::int n from pg_indexes where schemaname='public'`,
  politicas: `select count(*)::int n from pg_policies where schemaname='public'`,
  funciones: `select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public'`,
  enums: `select count(*)::int n from pg_type t join pg_namespace ns on ns.oid=t.typnamespace where ns.nspname='public' and t.typtype='e'`,
  disparadores: `select count(*)::int n from pg_trigger tg join pg_class t on t.oid=tg.tgrelid join pg_namespace ns on ns.oid=t.relnamespace where ns.nspname='public' and not tg.tgisinternal`,
};

async function medir(cliente) {
  const out = { estructura: {}, filas: {}, filasTotales: 0 };
  for (const [k, sql] of Object.entries(OBJETOS)) {
    out.estructura[k] = Number((await cliente.query(sql)).rows[0].n);
  }
  const { rows } = await cliente.query(
    `select tablename from pg_tables where schemaname='public' order by tablename`,
  );
  for (const { tablename } of rows) {
    const n = Number(
      (await cliente.query(`select count(*)::int n from public."${tablename}"`)).rows[0].n,
    );
    if (n > 0) out.filas[tablename] = n;
    out.filasTotales += n;
  }
  return out;
}

let fallos = 0;
const bien = (t) => console.log(`  ${verde('✓')} ${t}`);
const mal = (t) => {
  console.log(`  ${rojo('✗')} ${t}`);
  fallos++;
};

// ---------------------------------------------------------------------
// 1 · Medir el origen
// ---------------------------------------------------------------------
titulo('1 · Origen (staging)');
const origen = await conectar(ORIGEN);
const antes = await medir(origen);
await origen.end();
console.log(
  `  ${Object.entries(antes.estructura)
    .map(([k, v]) => `${k} ${v}`)
    .join(' · ')}`,
);
console.log(
  `  filas: ${antes.filasTotales} en ${Object.keys(antes.filas).length} tabla(s)`,
);

// ---------------------------------------------------------------------
// 2 · Respaldar
// ---------------------------------------------------------------------
titulo('2 · Respaldo');
const dump = spawnSync(
  'pg_dump',
  [ORIGEN, '--schema=public', '--no-owner', '--no-privileges', '--file', ARCHIVO],
  { encoding: 'utf8', env: { ...process.env, PGSSLMODE: 'require' } },
);
if (dump.status !== 0) {
  mal(`pg_dump falló: ${(dump.stderr ?? '').split('\n')[0]}`);
  process.exit(1);
}
const bytes = statSync(ARCHIVO).size;
bien(`pg_dump: ${bytes.toLocaleString('es-PE')} bytes`);

const contenido = readFileSync(ARCHIVO, 'utf8');
if (/postgres(ql)?:\/\//.test(contenido)) mal('El archivo contiene una cadena de conexión');
else bien('El archivo no contiene ninguna cadena de conexión');

// ---------------------------------------------------------------------
// 3 · Base nueva y aislada
// ---------------------------------------------------------------------
titulo('3 · Base de destino');
const admin = await conectar(LOCAL);
await admin.query(`drop database if exists ${BASE}`);
await admin.query(`create database ${BASE}`);
bien(`Creada «${BASE}» en el servidor local`);

// Los roles son del clúster, no de la base: no vienen en el volcado, pero
// las políticas los nombran.
for (const rol of ['anon', 'authenticated', 'service_role']) {
  await admin.query(
    `do $$ begin if not exists (select 1 from pg_roles where rolname='${rol}') then create role ${rol}; end if; end $$`,
  );
}
bien('Roles anon, authenticated y service_role disponibles');
await admin.end();

// ---------------------------------------------------------------------
// 4 · Lo que el volcado da por sentado
// ---------------------------------------------------------------------
titulo('4 · Preparar el destino');
const destino = await conectar(conBase(LOCAL, BASE));
await destino.query('create schema if not exists extensions');
await destino.query('create schema if not exists auth');

try {
  await destino.query('create extension if not exists postgis schema extensions');
  const v = await destino.query('select extensions.postgis_version() as v');
  bien(`PostGIS disponible: ${v.rows[0].v.split(' ')[0]}`);
} catch (error) {
  mal(`PostGIS no disponible: ${error.message.split('\n')[0]}`);
}

for (const ext of ['pg_trgm', 'unaccent', 'btree_gist', 'pgcrypto']) {
  await destino.query(`create extension if not exists ${ext} schema extensions`);
}
bien('pg_trgm, unaccent, btree_gist y pgcrypto instaladas');

await destino.query(`
  create or replace function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid $$;
  create or replace function auth.role() returns text language sql stable
    as $$ select nullif(current_setting('request.jwt.claims', true)::json->>'role','') $$;
  create table if not exists auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
`);
bien('auth.uid(), auth.role() y auth.users creadas');

// Las claves foráneas a auth.users no se satisfacen solas: el volcado de
// `public` no trae los usuarios. Se copian los identificadores del origen.
const orig2 = await conectar(ORIGEN);
const usuarios = await orig2.query('select id from auth.users');
await orig2.end();
for (const { id } of usuarios.rows) {
  await destino.query(`insert into auth.users (id) values ($1) on conflict do nothing`, [id]);
}
bien(`${usuarios.rowCount} usuario(s) de auth copiados para las claves foráneas`);
await destino.end();

// ---------------------------------------------------------------------
// 5 · Restaurar con psql
// ---------------------------------------------------------------------
titulo('5 · Restauración');
const restore = spawnSync(
  'psql',
  [
    conBase(LOCAL, BASE),
    '--set',
    'ON_ERROR_STOP=0',
    '--quiet',
    '--no-psqlrc',
    '--file',
    ARCHIVO,
  ],
  { encoding: 'utf8' },
);
/**
 * `schema "public" already exists` no es un fallo: el volcado trae
 * `CREATE SCHEMA public` y toda base recién creada ya lo tiene. Contarlo
 * como error convertiría una restauración perfecta en un rojo, que es la
 * peor clase de falso negativo: el día que haga falta de verdad, nadie
 * confía en el resultado.
 */
const INOCUOS = [/schema "public" already exists/i];

const todos = (restore.stderr ?? '').split('\n').filter((l) => /^psql:.*ERROR/.test(l));
const errores = todos.filter((l) => !INOCUOS.some((r) => r.test(l)));
const inocuos = todos.length - errores.length;

if (inocuos > 0) console.log(gris(`  (${inocuos} error(es) inocuo(s) ignorado(s))`));
if (errores.length === 0) bien('psql aplicó el volcado sin un solo error');
else {
  console.log(amarillo(`  ${errores.length} error(es) durante la restauración:`));
  const porMotivo = new Map();
  for (const e of errores) {
    const m = e.replace(/^psql:[^:]*:\d+: /, '').slice(0, 100);
    porMotivo.set(m, (porMotivo.get(m) ?? 0) + 1);
  }
  for (const [m, veces] of [...porMotivo].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`      ${String(veces).padStart(3)} × ${m}`);
  }
  fallos++;
}

// ---------------------------------------------------------------------
// 6 · Comparar
// ---------------------------------------------------------------------
titulo('6 · Origen contra restaurado');
const restaurado = await conectar(conBase(LOCAL, BASE));
const despues = await medir(restaurado);

console.log('  objeto            origen  restaurado');
let igualesEstructura = 0;
for (const k of Object.keys(OBJETOS)) {
  const a = antes.estructura[k];
  const b = despues.estructura[k];
  const ok = a === b;
  if (ok) igualesEstructura++;
  console.log(
    `  ${k.padEnd(16)} ${String(a).padStart(6)}  ${String(b).padStart(10)}   ${ok ? verde('=') : rojo(`≠ (${b - a})`)}`,
  );
}

console.log('\n  tabla                  origen  restaurado');
const tablasConFilas = new Set([...Object.keys(antes.filas), ...Object.keys(despues.filas)]);
let filasIguales = 0;
for (const t of [...tablasConFilas].sort()) {
  const a = antes.filas[t] ?? 0;
  const b = despues.filas[t] ?? 0;
  const ok = a === b;
  if (ok) filasIguales++;
  console.log(
    `  ${t.padEnd(22)} ${String(a).padStart(6)}  ${String(b).padStart(10)}   ${ok ? verde('=') : rojo(`≠ (${b - a})`)}`,
  );
}
console.log(
  `  ${'TOTAL'.padEnd(22)} ${String(antes.filasTotales).padStart(6)}  ${String(despues.filasTotales).padStart(10)}   ${
    antes.filasTotales === despues.filasTotales ? verde('=') : rojo('≠')
  }`,
);

// Que las tablas lleguen no sirve si llegan desprotegidas.
const sinRls = Number(
  (
    await restaurado.query(
      `select count(*)::int n from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
         where ns.nspname='public' and c.relkind='r' and not c.relrowsecurity`,
    )
  ).rows[0].n,
);
if (sinRls === 0) bien('\n  Ninguna tabla restaurada quedó sin RLS');
else mal(`\n  ${sinRls} tabla(s) restaurada(s) SIN RLS`);

if (igualesEstructura !== Object.keys(OBJETOS).length)
  mal(`Solo ${igualesEstructura} de ${Object.keys(OBJETOS).length} conteos de estructura coinciden`);
if (antes.filasTotales !== despues.filasTotales) mal('Las filas no coinciden');

await restaurado.end();

// ---------------------------------------------------------------------
// 7 · Limpiar
// ---------------------------------------------------------------------
titulo('7 · Limpieza');
const limpiador = await conectar(LOCAL);
await limpiador.query(
  `select pg_terminate_backend(pid) from pg_stat_activity where datname='${BASE}' and pid <> pg_backend_pid()`,
);
await limpiador.query(`drop database if exists ${BASE}`);
await limpiador.end();
bien(`Base «${BASE}» eliminada`);

unlinkSync(ARCHIVO);
bien('Archivo de respaldo eliminado');

titulo('Resultado');
console.log(
  fallos === 0
    ? verde(`  Restauración verificada: ${igualesEstructura} conteos de estructura y ${filasIguales} tabla(s) con datos, todo igual.`)
    : rojo(`  ${fallos} problema(s).`),
);
console.log();
process.exitCode = fallos > 0 ? 1 : 0;
