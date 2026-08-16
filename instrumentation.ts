/**
 * Arranque de la instrumentación.
 *
 * Next llama a esto una vez por proceso, antes de servir nada. Cada
 * entorno de ejecución carga su configuración: el servidor de Node y el
 * borde tienen APIs distintas y una sola no sirve para los dos.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

/**
 * Los errores de las peticiones del servidor.
 *
 * Next lo llama cuando se cae una página o una acción de servidor. Sin
 * esto, esos errores solo salen por la consola del servidor y nadie los ve.
 */
export { captureRequestError as onRequestError } from '@sentry/nextjs';
