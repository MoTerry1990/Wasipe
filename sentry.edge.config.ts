import * as Sentry from '@sentry/nextjs';
import { CONFIGURACION, HABILITADO } from '@/lib/observabilidad/sentry';

/** Sentry en el borde: el middleware corre acá. */
if (HABILITADO) {
  Sentry.init(CONFIGURACION);
}
