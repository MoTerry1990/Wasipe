/**
 * Conteos de una base, para comparar antes y después de algo.
 *
 * Sirve para dos cosas distintas en el mismo formato: medir el efecto de
 * la siembra sobre staging, y comparar una restauración contra su origen.
 *
 * Solo lee. La cadena de conexión no se imprime nunca.
 *
 * Uso:
 *   node scripts/contar-base.mjs              (usa SUPABASE_DB_URL)
 *   node scripts/contar-base.mjs LOCAL_DB_URL (usa esa otra variable)
 *   node scripts/contar-base.mjs LOCAL_DB_URL wasipe_restauracion
 */

import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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

const variable = process.argv[2] ?? 'SUPABASE_DB_URL';
const baseDistinta = process.argv[3];
let cadena = process.env[variable];
if (!cadena) {
  console.error(`Falta ${variable}`);
  process.exit(1);
}
if (baseDistinta) cadena = cadena.replace(/\/[^/?]*(\?|$)/, `/${baseDistinta}$1`);

const local = /localhost|127\.0\.0\.1/.test(cadena);
const cliente = new pg.Client({
  connectionString: cadena,
  ...(local ? {} : { ssl: { rejectUnauthorized: false } }),
});

await cliente.connect();

const q = async (s) => Number((await cliente.query(s)).rows[0].n);

const estructura = {
  tablas: `select count(*)::int n from pg_tables where schemaname='public'`,
  vistas: `select count(*)::int n from pg_views where schemaname='public'`,
  indices: `select count(*)::int n from pg_indexes where schemaname='public'`,
  politicas: `select count(*)::int n from pg_policies where schemaname='public'`,
  funciones: `select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public'`,
  enums: `select count(*)::int n from pg_type t join pg_namespace ns on ns.oid=t.typnamespace where ns.nspname='public' and t.typtype='e'`,
  disparadores: `select count(*)::int n from pg_trigger tg join pg_class t on t.oid=tg.tgrelid join pg_namespace ns on ns.oid=t.relnamespace where ns.nspname='public' and not tg.tgisinternal`,
};

const salida = { estructura: {}, filas: {} };
for (const [clave, sql] of Object.entries(estructura)) salida.estructura[clave] = await q(sql);

// Conteo real, no la estimación de pg_stat_user_tables: esa depende del
// último ANALYZE y después de una siembra todavía dice cero.
const { rows: tablas } = await cliente.query(
  `select tablename from pg_tables where schemaname='public' order by tablename`,
);
let total = 0;
for (const { tablename } of tablas) {
  const n = await q(`select count(*)::int n from public."${tablename}"`);
  if (n > 0) salida.filas[tablename] = n;
  total += n;
}
salida.filasTotales = total;

console.log(JSON.stringify(salida, null, 2));
await cliente.end();
