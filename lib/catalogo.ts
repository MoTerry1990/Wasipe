import type { Operacion, TipoInmueble } from '@/types/base-datos';

/**
 * Puente entre las URL y la base.
 *
 * Las direcciones del sitio van en castellano —`/comprar?tipo=departamento`—
 * porque es lo que la gente escribe, lo que se comparte por WhatsApp y lo
 * que Google indexa en el Perú. Adentro, la base usa enumerados en inglés
 * como el resto del código. Este archivo traduce entre los dos, y es el
 * único lugar donde esa traducción existe.
 */

/** Tipo de inmueble: slug de la URL → enumerado de la base. */
export const TIPO_DESDE_SLUG: Record<string, TipoInmueble> = {
  departamento: 'apartment',
  casa: 'house',
  terreno: 'land',
  oficina: 'office',
  local: 'commercial',
  almacen: 'warehouse',
  habitacion: 'room',
  'casa-de-campo': 'country_house',
  cochera: 'garage',
  edificio: 'building',
};

/** Enumerado de la base → slug de la URL. */
export const SLUG_DESDE_TIPO: Record<TipoInmueble, string> = {
  apartment: 'departamento',
  house: 'casa',
  land: 'terreno',
  office: 'oficina',
  commercial: 'local',
  warehouse: 'almacen',
  room: 'habitacion',
  country_house: 'casa-de-campo',
  garage: 'cochera',
  building: 'edificio',
};

/** Operación: la ruta misma dice cuál es. */
export const OPERACION_DESDE_RUTA: Record<string, Operacion> = {
  '/comprar': 'sale',
  '/alquilar': 'rent',
  '/proyectos': 'project',
};

export const RUTA_DESDE_OPERACION: Record<Operacion, string> = {
  sale: '/comprar',
  rent: '/alquilar',
  project: '/proyectos',
};

export function tipoDesdeSlug(slug: string | null | undefined): TipoInmueble | undefined {
  if (!slug) return undefined;
  return TIPO_DESDE_SLUG[slug];
}

/**
 * Arma la URL de una búsqueda.
 *
 * Solo escribe los parámetros que tienen valor: una dirección con
 * `?tipo=&donde=&precio=` se ve rota y además genera páginas duplicadas
 * para el buscador.
 */
export function urlDeBusqueda(
  operacion: Operacion,
  filtros: { tipo?: string; donde?: string; moneda?: string } = {},
): string {
  const ruta = RUTA_DESDE_OPERACION[operacion];
  const params = new URLSearchParams();

  if (filtros.tipo) params.set('tipo', filtros.tipo);
  const donde = filtros.donde?.trim();
  if (donde) params.set('donde', donde);
  if (filtros.moneda) params.set('moneda', filtros.moneda);

  const cadena = params.toString();
  return cadena ? `${ruta}?${cadena}` : ruta;
}
