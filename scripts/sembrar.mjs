#!/usr/bin/env node
/**
 * Siembra de datos de ejemplo.
 *
 *     npm run sembrar
 *
 * Aplica supabase/seed.sql sobre la base indicada en SUPABASE_DB_URL (o
 * DATABASE_URL). Todo lo que inserta es ficticio y está documentado en el
 * propio archivo.
 *
 * Tres seguros antes de escribir nada:
 *   1. Se niega a correr contra una base que parezca de producción.
 *   2. Muestra a qué servidor se va a conectar y espera confirmación.
 *   3. La siembra es idempotente: dos corridas no duplican nada.
 *
 * Para saltarse el segundo seguro en un entorno automatizado:
 *     npm run sembrar -- --si
 */

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Señales de que la base NO es de desarrollo. */
const PISTAS_DE_PRODUCCION = [/\bprod\b/i, /\bproduccion\b/i, /\bproduction\b/i, /\blive\b/i];

function salir(mensaje) {
  console.error(`\n  ✗ ${mensaje}\n`);
  process.exit(1);
}

const url = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;

if (!url) {
  salir(
    'Falta SUPABASE_DB_URL. Se saca del panel de Supabase, en\n' +
      '    Project Settings → Database → Connection string → URI\n' +
      '  y se guarda en tu archivo .env (que nunca se sube al repositorio).',
  );
}

let destino;
try {
  destino = new URL(url);
} catch {
  salir('SUPABASE_DB_URL no es una URL de conexión válida.');
}

const descripcion = `${destino.hostname}${destino.pathname}`;

if (
  PISTAS_DE_PRODUCCION.some((p) => p.test(url)) &&
  process.env.SEMBRAR_EN_PRODUCCION !== 'si'
) {
  salir(
    `La conexión "${descripcion}" parece de producción.\n` +
      '  La siembra escribe usuarios y avisos ficticios: no va ahí.\n' +
      '  Si de verdad es lo que quieres, exporta SEMBRAR_EN_PRODUCCION=si.',
  );
}

const confirmado = process.argv.includes('--si');

if (!confirmado) {
  const lector = createInterface({ input: process.stdin, output: process.stdout });
  const respuesta = await lector.question(
    `\n  Se van a insertar datos de ejemplo en:\n    ${descripcion}\n\n  ¿Continuamos? (s/N) `,
  );
  lector.close();
  if (!/^s(i|í)?$/i.test(respuesta.trim())) {
    console.log('\n  Cancelado. No se escribió nada.\n');
    process.exit(0);
  }
}

const cliente = new pg.Client({
  connectionString: url,
  ssl: destino.hostname === 'localhost' ? undefined : { rejectUnauthorized: false },
});

try {
  await cliente.connect();
  const sql = readFileSync(join(RAIZ, 'supabase', 'seed.sql'), 'utf8');
  await cliente.query(sql);

  const { rows } = await cliente.query(
    `select
       (select count(*) from public.properties) as avisos,
       (select count(*) from public.properties where publication_status = 'published') as publicados,
       (select count(*) from public.profiles) as cuentas,
       (select count(*) from public.property_media) as fotos`,
  );

  const r = rows[0];
  console.log(`
  ✓ Datos de ejemplo cargados en ${descripcion}

    Avisos       ${r.avisos} (${r.publicados} publicados)
    Cuentas      ${r.cuentas}
    Fotos        ${r.fotos}

    Contraseña de todas las cuentas de prueba: wasipe-demo-2026
`);
} catch (error) {
  salir(`No se pudo sembrar: ${error.message}`);
} finally {
  await cliente.end().catch(() => {});
}
