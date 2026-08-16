import { TIPO_DESDE_SLUG, SLUG_DESDE_TIPO, RUTA_DESDE_OPERACION } from '@/lib/catalogo';
import { ubicacionPorTexto } from '@/config/ubicaciones';
import type { Operacion, TipoInmueble } from '@/types/base-datos';

/**
 * Rutas amigables para el buscador.
 *
 * En el Perú se busca en Google "departamentos en alquiler en
 * Miraflores", así que `/alquilar/departamento/miraflores` vale mucho más
 * que `/alquilar?tipo=departamento&donde=miraflores`. Las dos formas
 * funcionan; la bonita es la canónica.
 *
 * Los segmentos se aceptan en cualquier orden y sin distinguir cuál es
 * cuál: un enlace escrito a mano como `/comprar/miraflores/casa` tiene
 * que llevar al mismo lado.
 */

export type SegmentosLeidos = {
  tipo?: TipoInmueble;
  distrito?: string;
  provincia?: string;
  departamento?: string;
  /** true si algún segmento no se pudo interpretar. */
  desconocido: boolean;
};

export function leerSegmentos(segmentos: readonly string[] | undefined): SegmentosLeidos {
  const salida: SegmentosLeidos = { desconocido: false };

  for (const crudo of segmentos ?? []) {
    const segmento = decodeURIComponent(crudo).trim().toLowerCase();
    if (!segmento) continue;

    const tipo = TIPO_DESDE_SLUG[segmento];
    if (tipo && !salida.tipo) {
      salida.tipo = tipo;
      continue;
    }

    const ubicacion = ubicacionPorTexto(segmento);
    if (ubicacion && !salida.distrito) {
      salida.distrito = ubicacion.nombre;
      salida.provincia = ubicacion.provincia;
      salida.departamento = ubicacion.departamento;
      continue;
    }

    // Un segmento que no es ni tipo ni ubicación se marca. La página
    // responde 404 en vez de mostrar un listado sin relación con la URL,
    // que confundiría a la persona y a los buscadores.
    salida.desconocido = true;
  }

  return salida;
}

/**
 * La dirección canónica de una búsqueda.
 *
 * Siempre el mismo orden —operación, tipo, distrito— para que
 * `/comprar/miraflores/casa` y `/comprar/casa/miraflores` no se indexen
 * como dos páginas distintas con el mismo contenido.
 */
export function rutaCanonica(
  operacion: Operacion,
  filtros: { tipo?: TipoInmueble; distrito?: string },
): string {
  const partes = [RUTA_DESDE_OPERACION[operacion]];

  if (filtros.tipo) partes.push(SLUG_DESDE_TIPO[filtros.tipo]);

  if (filtros.distrito) {
    const ubicacion = ubicacionPorTexto(filtros.distrito);
    if (ubicacion) partes.push(ubicacion.slug);
  }

  return partes.join('/');
}
