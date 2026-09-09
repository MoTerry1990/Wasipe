/**
 * Arranque de Sentry en el navegador.
 *
 * Este archivo existe porque **Next 15 dejó de leer
 * `sentry.client.config.ts`**. Desde entonces la inicialización del
 * cliente se carga desde `instrumentation-client.ts`, y sin él el paquete
 * que descarga el navegador no contiene ni una línea de Sentry.
 *
 * Se descubrió en el sprint 22, con el DSN ya configurado: se bajaron los
 * once paquetes de JavaScript del Preview —621 KB— y «sentry» aparecía
 * cero veces. Las 14 pruebas de filtrado no podían detectarlo, porque
 * prueban el módulo aislado y ninguna comprueba que llegue a cargarse.
 *
 * La configuración sigue viviendo en `sentry.client.config.ts`: acá solo
 * se importa por su efecto. Así hay un único lugar donde se decide qué se
 * manda y qué se filtra, y este archivo se limita a ser el enganche que
 * Next espera encontrar.
 */
import './sentry.client.config';

/**
 * El aviso de que empezó una navegación del App Router.
 *
 * Next llama a este export en cuanto arranca una transición de ruta, y
 * Sentry lo necesita para abrir ahí la traza de navegación. Sin él, el
 * paquete avisa —«onRouterTransitionStart is not exported»— y las
 * navegaciones del lado del cliente quedan sin medir: se ven los errores,
 * pero no en qué navegación ocurrieron ni cuánto tardó.
 *
 * Va acá y no en un componente porque es el archivo que Next inspecciona;
 * exportarlo desde otro lado no lo conecta con nada. Se reexporta la
 * función del paquete tal cual, sin envolverla: cualquier envoltorio
 * propio sería una copia que se queda atrás cuando cambie la de Sentry.
 */
export { captureRouterTransitionStart as onRouterTransitionStart } from '@sentry/nextjs';
