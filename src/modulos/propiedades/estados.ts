import { ErrorHTTP } from '../../lib/errores.ts';

export type Estado =
  | 'borrador'
  | 'revision'
  | 'rechazado'
  | 'activo'
  | 'pausado'
  | 'vencido'
  | 'cerrado'
  | 'archivado';

/**
 * Máquina de estados del aviso. Ver FLUJO-AVISOS.md §2.
 *
 * Va acá y no en un CHECK porque un CHECK no puede leer el estado anterior.
 */
export const TRANSICIONES: Record<Estado, Estado[]> = {
  borrador: ['revision', 'activo', 'archivado'],
  revision: ['activo', 'rechazado', 'archivado'],
  rechazado: ['revision', 'borrador', 'archivado'],
  activo: ['pausado', 'vencido', 'cerrado', 'revision', 'archivado'],
  pausado: ['activo', 'cerrado', 'archivado'],
  vencido: ['activo', 'cerrado', 'archivado'],
  cerrado: ['activo', 'archivado'], // solo dentro de 30 días
  archivado: [], // terminal
};

/** Estados que ocupan cupo del plan. Pausar libera; reactivar vuelve a exigir. */
export const CONSUME_CUPO: Estado[] = ['activo'];

/** El único estado visible al público. */
export const ES_PUBLICO = (e: Estado) => e === 'activo';

export function puedeTransicionar(desde: Estado, hasta: Estado): boolean {
  return TRANSICIONES[desde]?.includes(hasta) ?? false;
}

export function exigirTransicion(desde: Estado, hasta: Estado): void {
  if (desde === hasta) {
    throw new ErrorHTTP(409, `El aviso ya está en "${NOMBRES[hasta]}".`, {
      codigo: 'ESTADO_SIN_CAMBIO',
    });
  }
  if (!puedeTransicionar(desde, hasta)) {
    throw new ErrorHTTP(
      409,
      `No se puede pasar de "${NOMBRES[desde]}" a "${NOMBRES[hasta]}".`,
      { codigo: 'TRANSICION_INVALIDA' },
    );
  }
}

export const NOMBRES: Record<Estado, string> = {
  borrador: 'Borrador',
  revision: 'En revisión',
  rechazado: 'Rechazado',
  activo: 'Publicado',
  pausado: 'Pausado',
  vencido: 'Vencido',
  cerrado: 'Cerrado',
  archivado: 'Archivado',
};

/**
 * Un cambio "sustancial" en un aviso ya publicado se marca para revisión
 * posterior. El primer alta se modera antes; las ediciones, después.
 * Bajar un aviso vivo por corregir una coma es inaceptable.
 */
export function esCambioSustancial(
  antes: Record<string, unknown>,
  despues: Record<string, unknown>,
): boolean {
  if (despues.ubicacion_id && despues.ubicacion_id !== antes.ubicacion_id) return true;
  if (despues.tipo && despues.tipo !== antes.tipo) return true;
  if (despues.operacion && despues.operacion !== antes.operacion) return true;

  if (despues.area_m2 != null && Number(despues.area_m2) !== Number(antes.area_m2)) return true;

  if (despues.precio != null && antes.precio != null) {
    const viejo = Number(antes.precio);
    const nuevo = Number(despues.precio);
    if (viejo > 0 && Math.abs(nuevo - viejo) / viejo > 0.15) return true;
  }
  return false;
}
