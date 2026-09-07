/**
 * El límite de la nota de un favorito.
 *
 * Vive en su propio archivo y no en `lib/preferencias.ts`, que sería el
 * sitio obvio, porque ese importa `server-only`: llevarse una constante
 * de ahí al navegador arrastra `next/headers` al paquete del cliente y el
 * build se cae. Una constante compartida entre servidor y cliente no
 * puede vivir en un módulo de servidor, aunque el tema sea el mismo.
 *
 * Doscientos ochenta caracteres: lo que entra en un recordatorio de por
 * qué guardaste algo —«preguntar por el mantenimiento», «queda a tres
 * cuadras del colegio»— y no lo suficiente para escribir un contrato.
 *
 * La base admite hasta 500 con un CHECK; este es más estrecho a
 * propósito, y es el que ve la persona. Si algún día se afloja acá, el de
 * la base sigue siendo el techo.
 */
export const LARGO_MAXIMO_DE_NOTA = 280;
