import type { OperacionDeAsistente, Sugerencia } from '@/lib/ia/asistente';

/**
 * Lo que la acción del asistente le devuelve a la pantalla.
 *
 * Va en su propio archivo porque un módulo `'use server'` solo puede
 * exportar funciones asíncronas: un solo `export type` allá dentro
 * rompe el módulo entero.
 */
export type RespuestaDelAsistente =
  | {
      ok: true;
      /** El trabajo en la base. Hace falta para poder aceptarlo después. */
      trabajoId: string;
      operacion: OperacionDeAsistente;
      sugerencia: Sugerencia;
    }
  | { ok: false; mensaje: string };
