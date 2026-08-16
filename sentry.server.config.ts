import * as Sentry from '@sentry/nextjs';
import { CONFIGURACION, HABILITADO } from '@/lib/observabilidad/sentry';

/** Sentry en el servidor: páginas, acciones de servidor y trabajos de IA. */
if (HABILITADO) {
  Sentry.init(CONFIGURACION);
}
