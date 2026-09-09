import { loadEnvConfig } from '@next/env';

/**
 * El entorno real del servidor que se está probando.
 *
 * Estas pruebas corren contra `next start`, que carga `.env.local` por su
 * cuenta. Si el archivo de prueba adivina esos valores en vez de leerlos,
 * termina comprobando otra cosa: la canónica esperada quedó clavada en
 * `https://wasipe.netlify.app` —el dominio del stack anterior, que hoy
 * solo es plan de vuelta atrás— y las seis pruebas de canónicas llevaban
 * sprints en rojo sin que hubiera nada roto.
 *
 * `@next/env` es el mismo cargador que usa Next, así que lo que se lee acá
 * es exactamente lo que ve el servidor. Una sola fuente de verdad.
 */
loadEnvConfig(process.cwd(), false);

/** La raíz del sitio, sin barra final. */
export const BASE = (process.env.NEXT_PUBLIC_URL_SITIO ?? 'https://wasipe.netlify.app').replace(
  /\/$/,
  '',
);

/**
 * Si el servidor probado se considera producción.
 *
 * Misma regla que `config/sitio.ts`. Importa porque `robots.txt` cambia
 * entero según esto: fuera de producción se cierra el sitio al rastreo
 * (P-19), y una prueba que solo conozca la versión de producción se pone
 * roja justo cuando el arreglo está funcionando.
 */
export const ES_PRODUCCION = (process.env.NEXT_PUBLIC_ENTORNO ?? '').trim() === 'produccion';
