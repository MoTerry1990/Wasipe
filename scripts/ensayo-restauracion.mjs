/**
 * Ensayo de restauración: aplica el volcado de staging sobre una base
 * aislada y compara los conteos contra los de referencia.
 *
 * El destino es PGlite, en memoria. No es una elección de comodidad: es
 * la garantía más fuerte de que este ensayo no puede tocar staging ni por
 * accidente, porque la base ni siquiera existe fuera de este proceso.
 */

import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';

const RESPALDO = process.argv[2];
const verde = (t) => `\x1b[32m${t}\x1b[0m`;
const rojo = (t) => `\x1b[31m${t}\x1b[0m`;
const gris = (t) => `\x1b[90m${t}\x1b[0m`;

const REFERENCIA = {
  tablas: 28,
  vistas: 6,
  indices: 107,
  politicas: 73,
  funciones: 66,
  restricciones: 174,
  enums: 33,
  disparadores: 20,
};

const db = await PGlite.create({
  extensions: { pg_trgm, unaccent, btree_gist, pgcrypto },
});

// Los roles de Supabase no vienen en el volcado del esquema `public`:
// pertenecen al clúster. Sin ellos, cada CREATE POLICY … TO anon falla.
// Esto es parte del procedimiento de recuperación y hay que decirlo.
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create role supabase_auth_admin;
  create role supabase_storage_admin;
  create schema if not exists auth;
  create schema if not exists storage;
  create schema if not exists extensions;
`);

// auth.uid() y auth.role(): las usan las políticas y viven en el esquema
// de la plataforma, que tampoco viaja en este volcado.
await db.exec(`
  create or replace function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid $$;
  create or replace function auth.role() returns text language sql stable
    as $$ select nullif(current_setting('request.jwt.claims', true)::json->>'role','') $$;
  create table if not exists auth.users (id uuid primary key, email text);
`);

let sql = readFileSync(RESPALDO, 'utf8');

const antes = sql.length;

// pg_dump 17 abre y cierra el archivo con `\restrict` y `\unrestrict`.
// Son metacomandos de psql, no SQL: cualquier cosa que no sea psql
// —un driver, PGlite— muere con «syntax error at or near "\"».
// Dicho de otro modo: **un volcado 17.x se restaura con psql, no
// alimentándoselo a un cliente de Postgres.** Vale saberlo antes de una
// emergencia, no durante.
const metacomandos = (sql.match(/^\\(restrict|unrestrict)\b.*$/gim) ?? []).length;
sql = sql.replace(/^\\(restrict|unrestrict)\b.*$/gim, '');

// PGlite no trae PostGIS. Un volcado de `--schema=public` no incluye la
// extensión —en Supabase vive en el esquema `extensions`— pero sí las
// columnas que dependen de ella.
sql = sql.replace(/^CREATE EXTENSION IF NOT EXISTS postgis.*$/gim, '');
sql = sql.replace(/^COMMENT ON EXTENSION postgis.*$/gim, '');

console.log(
  gris(
    `volcado: ${(antes / 1024).toFixed(0)} KB · metacomandos de psql retirados: ${metacomandos}\n`,
  ),
);

// El esquema `public` ya existe en cualquier base recién creada.
sql = sql.replace(/^CREATE SCHEMA public;$/gim, '');
sql = sql.replace(/^COMMENT ON SCHEMA public.*$/gim, '');

/**
 * Parte el volcado en sentencias respetando los cuerpos entre `$$`, que
 * llevan puntos y coma adentro. Aplicarlo todo de una vez sirve de poco:
 * PGlite aborta en el primer error y no se sabe qué más habría fallado.
 * Sentencia por sentencia dice exactamente qué no se restaura.
 */
function sentencias(texto) {
  const fuera = [];
  let actual = '';
  let etiqueta = null;
  for (const linea of texto.split(/\r?\n/)) {
    if (linea.trim().startsWith('--') && !etiqueta) continue;
    actual += linea + '\n';
    const marcas = linea.match(/\$[A-Za-z_]*\$/g) ?? [];
    for (const m of marcas) {
      if (etiqueta === null) etiqueta = m;
      else if (etiqueta === m) etiqueta = null;
    }
    if (!etiqueta && linea.trimEnd().endsWith(';')) {
      if (actual.trim()) fuera.push(actual.trim());
      actual = '';
    }
  }
  if (actual.trim()) fuera.push(actual.trim());
  return fuera;
}

const partes = sentencias(sql);
const fallos = [];
let aplicadas = 0;

for (const sentencia of partes) {
  try {
    await db.exec(sentencia);
    aplicadas++;
  } catch (error) {
    fallos.push({
      motivo: error.message.split('\n')[0].slice(0, 110),
      sentencia: sentencia.slice(0, 70).replace(/\s+/g, ' '),
    });
  }
}

console.log(`sentencias: ${partes.length} · aplicadas ${aplicadas} · fallidas ${fallos.length}`);
if (fallos.length) {
  const porMotivo = new Map();
  for (const f of fallos) porMotivo.set(f.motivo, (porMotivo.get(f.motivo) ?? 0) + 1);
  console.log(rojo('\nMotivos de fallo:'));
  for (const [motivo, veces] of [...porMotivo].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(veces).padStart(4)} × ${motivo}`);
  }
} else {
  console.log(verde('El volcado se aplicó completo.'));
}

const q = async (s) => Number((await db.query(s)).rows[0].n);

const obtenido = {
  tablas: await q(`select count(*)::int n from pg_tables where schemaname='public'`),
  vistas: await q(`select count(*)::int n from pg_views where schemaname='public'`),
  indices: await q(`select count(*)::int n from pg_indexes where schemaname='public'`),
  politicas: await q(`select count(*)::int n from pg_policies where schemaname='public'`),
  funciones: await q(
    `select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public'`,
  ),
  restricciones: await q(
    `select count(*)::int n from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace ns on ns.oid=t.relnamespace where ns.nspname='public'`,
  ),
  enums: await q(
    `select count(*)::int n from pg_type t join pg_namespace ns on ns.oid=t.typnamespace where ns.nspname='public' and t.typtype='e'`,
  ),
  disparadores: await q(
    `select count(*)::int n from pg_trigger tg join pg_class t on t.oid=tg.tgrelid join pg_namespace ns on ns.oid=t.relnamespace where ns.nspname='public' and not tg.tgisinternal`,
  ),
};

console.log('\nConteos: referencia (staging) contra restaurado');
console.log(gris('─'.repeat(52)));
console.log('objeto            referencia  restaurado  ');
let iguales = 0;
for (const clave of Object.keys(REFERENCIA)) {
  const r = REFERENCIA[clave];
  const o = obtenido[clave];
  const ok = r === o;
  if (ok) iguales++;
  console.log(
    `${clave.padEnd(16)} ${String(r).padStart(10)}  ${String(o).padStart(10)}   ${ok ? verde('=') : rojo('≠ faltan ' + (r - o))}`,
  );
}

// RLS: que las tablas lleguen no sirve si llegan desprotegidas.
const sinRls = await q(
  `select count(*)::int n from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
     where ns.nspname='public' and c.relkind='r' and not c.relrowsecurity`,
);
console.log(`\nTablas restauradas SIN RLS: ${sinRls === 0 ? verde('0') : rojo(String(sinRls))}`);

console.log(`\n${iguales} de ${Object.keys(REFERENCIA).length} conteos coinciden.`);
await db.close();
process.exitCode = iguales === Object.keys(REFERENCIA).length && sinRls === 0 ? 0 : 1;
