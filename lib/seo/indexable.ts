import { hayFiltros, type Filtros } from '@/lib/busqueda/filtros';

/**
 * Qué se indexa y qué no.
 *
 * Un portal inmobiliario genera millones de direcciones válidas: seis
 * tipos por doscientos distritos por veinte rangos de precio por cinco
 * ordenamientos. Casi todas devuelven lo mismo, o casi nada. Dejarlas
 * indexar no trae tráfico: reparte la autoridad del dominio entre miles
 * de páginas flacas y hunde las pocas que sí valen.
 *
 * Así que la regla es al revés de lo que parece: se indexa **poco y a
 * propósito**. Una dirección entra al índice solo si es una de las
 * combinaciones que la gente escribe en Google —«departamentos en venta
 * en Miraflores»— y además tiene contenido de verdad detrás.
 *
 * Este archivo es el único lugar donde se decide. El sitemap, los
 * metadatos y las pruebas leen de acá, así que no pueden discrepar.
 */

/**
 * Cuántos avisos hacen falta para que una página valga la pena.
 *
 * Con dos resultados la página es más plantilla que contenido, y Google
 * la trata como tal. Preferimos que llegue al índice tarde y con algo
 * que mostrar, a que llegue vacía y se gane la fama de vacía.
 */
export const MINIMO_PARA_INDEXAR = 3;

/**
 * Los filtros que **definen** una landing.
 *
 * Son los que aparecen en la ruta bonita y en la forma en que la gente
 * busca. Todo lo demás —precio, dormitorios, mascotas, sellos— acota una
 * búsqueda concreta de una persona concreta, y eso no es una página que
 * merezca existir en un buscador.
 */
const DEFINEN_LANDING = ['tipo', 'distrito', 'provincia', 'departamento'] as const;

export type MotivoNoIndexar =
  'filtros-de-detalle' | 'pagina-interior' | 'presentacion' | 'poco-contenido' | 'sin-conexion';

export const POR_QUE_NO_SE_INDEXA: Record<MotivoNoIndexar, string> = {
  'filtros-de-detalle':
    'Tiene filtros de detalle: es la búsqueda de una persona, no una página que alguien vaya a buscar en Google.',
  'pagina-interior': 'Es una página interior del listado; la primera ya cubre el tema.',
  presentacion:
    'Cambia solo cómo se ve —orden, vista o moneda—, no lo que hay. Sería la misma página dos veces.',
  'poco-contenido': `Tiene menos de ${MINIMO_PARA_INDEXAR} avisos. Una página casi vacía perjudica a las que sí tienen.`,
  'sin-conexion': 'No pudimos consultar la base, así que no sabemos qué hay detrás.',
};

/**
 * ¿Por qué esta búsqueda no debería indexarse? `null` si sí debería.
 *
 * `total` es opcional a propósito: los metadatos se generan antes de que
 * haya un número, y en ese momento igual se puede descartar todo lo que
 * es estructuralmente flaco. Cuando el número existe, se pasa.
 */
export function motivoParaNoIndexar(
  filtros: Filtros,
  total?: number | null,
): MotivoNoIndexar | null {
  if ((filtros.pagina ?? 1) > 1) return 'pagina-interior';

  // Orden, vista y moneda no cambian qué avisos hay, solo cómo se
  // muestran. Son la fuente número uno de contenido duplicado en un
  // portal, porque cada clic de la interfaz genera una dirección nueva.
  if (
    filtros.orden !== undefined ||
    filtros.vista !== undefined ||
    filtros.moneda !== undefined
  ) {
    return 'presentacion';
  }

  if (hayFiltros(filtros)) {
    const conValor = Object.keys(filtros).filter(
      (clave) =>
        filtros[clave as keyof Filtros] !== undefined &&
        clave !== 'operacion' &&
        clave !== 'pagina' &&
        clave !== 'orden' &&
        clave !== 'vista' &&
        clave !== 'moneda',
    );

    const todosDefinenLanding = conValor.every((clave) =>
      (DEFINEN_LANDING as readonly string[]).includes(clave),
    );

    if (!todosDefinenLanding) return 'filtros-de-detalle';
  } else {
    // `/comprar` y `/alquilar` sin nada más son páginas troncales: parte
    // de la navegación del sitio, no una combinación generada. Se indexan
    // siempre, incluso si la base no responde y no sabemos cuántos avisos
    // hay. Sacarlas del índice por un mal minuto de la base costaría
    // semanas de recuperación, y el sitio existe para tenerlas.
    return null;
  }

  if (total === null) return 'sin-conexion';
  if (total !== undefined && total < MINIMO_PARA_INDEXAR) return 'poco-contenido';

  return null;
}

/** Atajo legible: ¿esta búsqueda entra al índice? */
export function seIndexa(filtros: Filtros, total?: number | null): boolean {
  return motivoParaNoIndexar(filtros, total) === null;
}

/**
 * El bloque `robots` para los metadatos de Next.
 *
 * `follow` se mantiene siempre, incluso cuando no se indexa: una página
 * de filtros no merece estar en el índice, pero los enlaces que tiene
 * adentro llevan a fichas que sí, y cortarlos dejaría avisos huérfanos.
 */
export function robotsDeBusqueda(filtros: Filtros, total?: number | null) {
  return seIndexa(filtros, total) ? undefined : { index: false, follow: true };
}
