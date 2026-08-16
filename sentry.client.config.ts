import * as Sentry from '@sentry/nextjs';
import { CONFIGURACION, HABILITADO } from '@/lib/observabilidad/sentry';

/**
 * Sentry en el navegador.
 *
 * Sin `NEXT_PUBLIC_SENTRY_DSN` no se inicializa nada: no hay peticiones,
 * no hay peso extra en el paquete que se descarga, y no hay una
 * biblioteca esperando un servidor que no existe.
 */
if (HABILITADO) {
  Sentry.init({
    ...CONFIGURACION,
    // La repetición de sesión graba la pantalla de la persona. Apagada:
    // en un portal inmobiliario eso incluye su nombre, su teléfono y la
    // dirección de su casa mientras publica.
    replaysOnErrorSampleRate: 0,
    replaysSessionSampleRate: 0,
  });
}
