import { sql, hayBase } from './cliente.ts';
import { dividirSql } from './dividir-sql.js';
import { MIGRACIONES } from './migraciones-embebidas.js';

/**
 * Aplica las migraciones pendientes en el primer arranque.
 *
 * Normalmente esto lo hace `npm run migrar` en el build. Pero en un deploy
 * manual (arrastrar un zip) Netlify no corre el build, así que la función
 * tiene que poder levantar el esquema por su cuenta.
 *
 * Se ejecuta una sola vez por proceso y toma un advisory lock, así que
 * varias invocaciones simultáneas no chocan.
 */

const LOCK = 20260805;
let promesa: Promise<void> | null = null;

export function asegurarEsquema(): Promise<void> {
  if (!hayBase()) return Promise.resolve();
  promesa ??= aplicar().catch((e) => {
    promesa = null; // que el siguiente arranque lo reintente
    throw e;
  });
  return promesa;
}

async function aplicar(): Promise<void> {
  await sql(
    `CREATE TABLE IF NOT EXISTS migraciones (
       nombre TEXT PRIMARY KEY,
       aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now())`,
  );

  const hechas = new Set(
    (await sql<{ nombre: string }>(`SELECT nombre FROM migraciones`)).map((f) => f.nombre),
  );
  const pendientes = MIGRACIONES.filter((m) => !hechas.has(m.nombre));
  if (pendientes.length === 0) return;

  await sql(`SELECT pg_advisory_lock($1)`, [LOCK]);
  try {
    // Otro proceso pudo haberlas aplicado mientras esperábamos el lock.
    const ahora = new Set(
      (await sql<{ nombre: string }>(`SELECT nombre FROM migraciones`)).map((f) => f.nombre),
    );

    for (const m of MIGRACIONES) {
      if (ahora.has(m.nombre)) continue;
      console.log(`[esquema] aplicando ${m.nombre}`);
      for (const sentencia of dividirSql(m.sql)) {
        await sql(sentencia);
      }
      await sql(`INSERT INTO migraciones (nombre) VALUES ($1)
                 ON CONFLICT (nombre) DO NOTHING`, [m.nombre]);
    }
    console.log(`[esquema] listo (${MIGRACIONES.length} migraciones)`);
  } finally {
    await sql(`SELECT pg_advisory_unlock($1)`, [LOCK]);
  }
}
