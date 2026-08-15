/**
 * Mete los .sql dentro de un módulo JS para que la función quede
 * autocontenida. En un deploy manual (arrastrar un zip) Netlify NO corre
 * el build, así que la función no puede leer archivos del repo: tiene que
 * llevar el esquema adentro.
 *
 *   node scripts/generar-migraciones-embebidas.js
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CARPETA = join(RAIZ, 'src', 'db', 'migraciones');
const SALIDA = join(RAIZ, 'src', 'db', 'migraciones-embebidas.js');

const archivos = readdirSync(CARPETA).filter((f) => f.endsWith('.sql')).sort();

const cuerpo = archivos
  .map((nombre) => {
    const sql = readFileSync(join(CARPETA, nombre), 'utf8');
    // Backtick + ${ } tienen que escaparse para sobrevivir la plantilla.
    const seguro = sql.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
    return `  { nombre: ${JSON.stringify(nombre)}, sql: \`${seguro}\` }`;
  })
  .join(',\n');

writeFileSync(
  SALIDA,
  `// GENERADO por scripts/generar-migraciones-embebidas.js — no editar a mano.\n` +
    `// Fuente: src/db/migraciones/*.sql\n\n` +
    `export const MIGRACIONES = [\n${cuerpo},\n];\n`,
  'utf8',
);

console.log(`  ✓ ${archivos.length} migraciones embebidas -> src/db/migraciones-embebidas.js`);
for (const a of archivos) console.log(`      ${a}`);
