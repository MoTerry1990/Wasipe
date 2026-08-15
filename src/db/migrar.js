/**
 * Runner de migraciones. Corre en el build de Netlify (npm run migrar).
 *
 * En JavaScript plano a propósito: es el paso donde menos conviene depender
 * de la cadena de herramientas. Si falla, el deploy falla — y esa es la
 * propiedad que queremos: nunca publicar código que espera un esquema
 * que todavía no existe.
 */
import { neon } from '@neondatabase/serverless';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dividirSql } from './dividir-sql.js';

const CARPETA = join(dirname(fileURLToPath(import.meta.url)), 'migraciones');
const LOCK = 20260805; // clave del advisory lock: serializa deploys simultáneos

const url =
  process.env.DATABASE_URL ??
  process.env.NETLIFY_DATABASE_URL ??
  process.env.NETLIFY_DB_URL;

if (!url) {
  console.error('\n  ✗ Falta DATABASE_URL. No se puede migrar.');
  console.error('    Configúrala en Netlify → Environment variables.\n');
  process.exit(1);
}

const sql = neon(url);

async function principal() {
  console.log('\n  Migraciones de Wasipe\n');

  await sql`SELECT pg_advisory_lock(${LOCK})`;
  try {
    await sql`CREATE TABLE IF NOT EXISTS migraciones (
      nombre TEXT PRIMARY KEY,
      aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;

    const hechas = new Set((await sql`SELECT nombre FROM migraciones`).map((f) => f.nombre));
    const archivos = readdirSync(CARPETA).filter((f) => f.endsWith('.sql')).sort();

    if (archivos.length === 0) {
      console.log('  No hay archivos .sql en src/db/migraciones\n');
      return;
    }

    let aplicadas = 0;
    for (const archivo of archivos) {
      if (hechas.has(archivo)) {
        console.log(`  · ${archivo} (ya aplicada)`);
        continue;
      }

      process.stdout.write(`  → ${archivo} ... `);
      const texto = readFileSync(join(CARPETA, archivo), 'utf8');
      const sentencias = dividirSql(texto);

      try {
        for (const s of sentencias) await sql(s, []);
        await sql`INSERT INTO migraciones (nombre) VALUES (${archivo})`;
        console.log(`ok (${sentencias.length} sentencias)`);
        aplicadas++;
      } catch (e) {
        console.log('FALLÓ');
        console.error(`\n  ✗ ${archivo}\n    ${e.message}\n`);
        throw e;
      }
    }

    console.log(
      aplicadas === 0
        ? '\n  Todo al día.\n'
        : `\n  ✓ ${aplicadas} migración(es) aplicada(s).\n`,
    );
  } finally {
    await sql`SELECT pg_advisory_unlock(${LOCK})`;
  }
}

principal().catch((e) => {
  console.error('\n  Migración abortada:', e.message, '\n');
  process.exit(1);
});
