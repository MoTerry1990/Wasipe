/**
 * Ejecuta las migraciones contra un Postgres real en memoria (PGlite, WASM).
 * Sirve para validar el esquema sin Neon ni Docker.
 *
 *   node scripts/probar-esquema.js
 */
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dividirSql } from '../src/db/dividir-sql.js';

const CARPETA = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'db', 'migraciones');


const db = new PGlite({ extensions: { pg_trgm, unaccent, btree_gist } });
await db.waitReady;

console.log('\n  Ejecutando migraciones contra PGlite\n');

let total = 0;
let fallos = 0;

for (const archivo of readdirSync(CARPETA).filter((f) => f.endsWith('.sql')).sort()) {
  const sentencias = dividirSql(readFileSync(join(CARPETA, archivo), 'utf8'));
  console.log(`  ${archivo} — ${sentencias.length} sentencias`);

  for (const s of sentencias) {
    total++;
    try {
      await db.exec(s);
    } catch (e) {
      fallos++;
      const cabeza = s.split('\n').slice(0, 2).join(' ').slice(0, 90);
      console.log(`\n    ✗ ${cabeza}…`);
      console.log(`      ${e.message}`);
    }
  }
}

if (fallos > 0) {
  console.log(`\n  ✗ ${fallos} de ${total} sentencias fallaron.\n`);
  process.exit(1);
}

console.log(`\n  ✓ ${total} sentencias aplicadas sin error.\n`);

// --- inventario ---
const tablas = await db.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' ORDER BY table_name`);
console.log(`  Tablas creadas: ${tablas.rows.length}`);
console.log('   ', tablas.rows.map((r) => r.table_name).join(', '), '\n');

const indices = await db.query(
  `SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='public'`);
console.log(`  Índices: ${indices.rows[0].n}`);

const fks = await db.query(
  `SELECT count(*)::int AS n FROM information_schema.table_constraints
   WHERE constraint_type='FOREIGN KEY' AND table_schema='public'`);
console.log(`  Claves foráneas: ${fks.rows[0].n}`);

const checks = await db.query(
  `SELECT count(*)::int AS n FROM information_schema.table_constraints
   WHERE constraint_type='CHECK' AND table_schema='public'`);
console.log(`  Restricciones CHECK: ${checks.rows[0].n}\n`);

await db.close();
