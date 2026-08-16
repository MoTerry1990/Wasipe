import type { ClaveDeEdicion } from '@/lib/ia/imagenes';

/**
 * Lo que las acciones de fotos le devuelven a la pantalla.
 *
 * En su propio archivo porque un módulo `'use server'` solo puede
 * exportar funciones asíncronas.
 */

export type PropuestaDeFoto = {
  trabajoId: string;
  edicion: ClaveDeEdicion;
  /** La foto tal como está hoy en el aviso. */
  original: string;
  /** La propuesta. Todavía no está en el aviso ni lo estará sin confirmar. */
  propuesta: string;
  /** La que corresponda: modificada o amoblamiento virtual. */
  etiqueta: string;
  /** Cuántos intentos quedan si algo salió mal. */
  intentosRestantes: number;
};

export type RespuestaDeFoto =
  | { ok: true; propuesta: PropuestaDeFoto }
  | { ok: false; mensaje: string; trabajoId?: string; sePuedeReintentar?: boolean };
