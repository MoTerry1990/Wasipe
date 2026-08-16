/**
 * Módulo vacío para las pruebas.
 *
 * `server-only` está hecho para reventar cuando lo importa un paquete de
 * cliente, y en Vitest se resuelve por esa rama. Se reemplaza por esto
 * para poder probar el código de servidor; la barrera de verdad sigue
 * intacta en el build de Next, que es donde importa.
 */
export {};
