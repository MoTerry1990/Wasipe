/**
 * Aplica las migraciones a la base remota.
 *
 * Existe porque `supabase db push` a secas **no puede funcionar en este
 * repositorio**: sin `supabase link` el CLI no sabe a qué proyecto apuntar
 * y muere en `LegacyProjectNotLinkedError`. Y `link` pide un token personal
 * de la cuenta, que es un quinto secreto que no hace falta para migrar.
 *
 * Pasando `--db-url` el CLI habla directo con la base y el enlace sobra.
 * Además es **más seguro para el aislamiento con Atheos**: `supabase link`
 * sin argumentos abre la lista de proyectos de la cuenta, donde también
 * están los de Atheos. Una cadena de conexión apunta a un anfitrión y a uno
 * solo; no hay lista de la que equivocarse.
 *
 * La cadena nunca se imprime: viaja como argumento del proceso hijo y no
 * pasa por la salida.
 *
 * Uso:
 *   npm run db:push                 aplica
 *   npm run db:push -- --dry-run    solo dice qué aplicaría
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const rojo = (t) => `\x1b[31m${t}\x1b[0m`;
const gris = (t) => `\x1b[90m${t}\x1b[0m`;

function cargar() {
  const ruta = join(process.cwd(), '.env.local');
  if (!existsSync(ruta)) return;

  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const corte = limpia.indexOf('=');
    if (corte < 1) continue;
    const nombre = limpia.slice(0, corte).trim();
    const valor = limpia
      .slice(corte + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (valor && !process.env[nombre]) process.env[nombre] = valor;
  }
}

cargar();

const cadena = process.env.SUPABASE_DB_URL ?? '';

if (!cadena) {
  console.error(rojo('\nFalta SUPABASE_DB_URL.'));
  console.error(gris('Supabase → Settings → Database → Connection string → URI.\n'));
  process.exit(1);
}

// El marcador del panel viene entre corchetes y ya costó un intento de
// migración: la cadena parecía completa y no falló hasta la autenticación.
if (/\[[^\]]*\]|your.?password/i.test(cadena)) {
  console.error(rojo('\nSUPABASE_DB_URL trae el marcador de posición del panel sin reemplazar.'));
  console.error(gris('Quita los corchetes y pon la contraseña real de la base.\n'));
  process.exit(1);
}

/**
 * Se invoca el `.js` del paquete con el mismo Node que corre esto, en vez
 * de `npx`, por dos razones: en Windows, `spawnSync` no ejecuta un `.cmd`
 * sin `shell: true`, y levantar un shell haría pasar la cadena de conexión
 * por el intérprete, donde un símbolo de la contraseña puede partirla.
 * Así viaja como un argumento y nadie la interpreta.
 */
const cli = join(process.cwd(), 'node_modules', 'supabase', 'dist', 'supabase.js');

if (!existsSync(cli)) {
  console.error(rojo('\nNo está el CLI de Supabase.'));
  console.error(gris('Instálalo con: npm i -D supabase\n'));
  process.exit(1);
}

const resultado = spawnSync(
  process.execPath,
  [cli, 'db', 'push', '--db-url', cadena, ...process.argv.slice(2)],
  { stdio: 'inherit' },
);

process.exit(resultado.status ?? 1);
