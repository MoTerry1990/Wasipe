/**
 * Lo que devuelve pedir el teléfono de quien publica.
 *
 * El tipo vive acá y no junto a la acción porque un módulo marcado con
 * 'use server' solo puede exportar funciones async: un `export type`
 * rompe el módulo completo y Next deja de ver las demás acciones.
 */
export type Telefono =
  | { ok: true; telefono: string | null; whatsapp: string | null; nombre: string }
  | { ok: false; mensaje: string };
