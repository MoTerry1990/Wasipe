/**
 * Nombre de la cookie de favoritos.
 *
 * Vive en su propio archivo porque lo comparten la acción de servidor y
 * la lectura del servidor, y en un módulo marcado con 'use server' no se
 * puede exportar una constante: todo lo exportado tiene que ser una
 * función async, y una sola constante rompe el módulo entero.
 */
export const COOKIE_FAVORITOS = 'wasipe_favoritos';
