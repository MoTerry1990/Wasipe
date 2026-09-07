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
