import { UBICACIONES } from '@/config/ubicaciones';
import { SLUG_DESDE_TIPO, RUTA_DESDE_OPERACION } from '@/lib/catalogo';
import { TIPO_INMUEBLE_PLURAL } from '@/lib/etiquetas';
import type { Operacion, TipoInmueble } from '@/types/base-datos';

/**
 * Las páginas de aterrizaje.
 *
 * Son las combinaciones que la gente escribe en Google en el Perú:
 * «departamentos en venta en Miraflores», «casas en alquiler en Surco».
 * Cada una es una dirección de verdad —`/comprar/departamento/miraflores`—
 * que ya funcionaba desde el sprint 4; lo que faltaba era declararlas,
 * enlazarlas y dejarlas entrar al índice.
 *
 * La lista se genera, no se escribe a mano. Escrita a mano quedaría
 * desfasada el día que se agregue un distrito, y nadie se daría cuenta
 * hasta que un enlace del sitemap devuelva 404.
 *
 * Qué combinaciones se generan y cuáles no es la decisión importante.
 * Cruzar seis tipos por doscientos distritos por dos operaciones da 2400
 * páginas, casi todas vacías: «cocheras en alquiler en Végueta» no la
 * busca nadie y no tiene nada que mostrar. Así que solo se cruzan los
 * tipos que de verdad se buscan con los distritos que de verdad tienen
 * mercado, y el corte por cantidad de avisos lo pone `indexable.ts`
 * cuando la página se sirve.
 */

/** Los tipos que la gente busca por nombre. Cochera y local no entran. */
const TIPOS_QUE_SE_BUSCAN: readonly TipoInmueble[] = [
  'apartment',
  'house',
  'land',
  'office',
] as const;

export type Landing = {
  /** La dirección canónica, empezando por `/`. */
  href: string;
  /** Cómo se llama en un enlace: «Departamentos en venta en Miraflores». */
  texto: string;
  operacion: OperacionConLanding;
  tipo?: TipoInmueble;
  /** Nombre del distrito tal como está en la base, no el slug. */
  distrito?: string;
  provincia?: string;
};

/**
 * Solo venta y alquiler. Los proyectos tienen su propia sección y su
 * propia forma de buscarse —por nombre del proyecto, no por distrito—,
 * así que generar landings de proyecto sería inventar demanda.
 */
type OperacionConLanding = Extract<Operacion, 'sale' | 'rent'>;

const COMO_SE_DICE: Record<OperacionConLanding, string> = {
  sale: 'en venta',
  rent: 'en alquiler',
};

/** El texto de un enlace, armado como se habla. */
function comoSeLlama(
  operacion: OperacionConLanding,
  tipo?: TipoInmueble,
  lugar?: string,
): string {
  const que = tipo ? TIPO_INMUEBLE_PLURAL[tipo] : 'Propiedades';
  const donde = lugar ? ` en ${lugar}` : '';
  return `${que} ${COMO_SE_DICE[operacion]}${donde}`;
}

/** `RUTA_DESDE_OPERACION` ya trae la barra inicial: no se vuelve a poner. */
function ruta(operacion: OperacionConLanding, tipo?: TipoInmueble, slugLugar?: string): string {
  const partes = [RUTA_DESDE_OPERACION[operacion]];
  if (tipo) partes.push(SLUG_DESDE_TIPO[tipo]);
  if (slugLugar) partes.push(slugLugar);
  return partes.join('/');
}

/**
 * Todas las landings de búsqueda.
 *
 * Tres familias, de la más general a la más específica:
 *
 *  1. Operación + tipo — «departamentos en venta», sin lugar.
 *  2. Operación + distrito — «propiedades en alquiler en Barranco».
 *  3. Operación + tipo + distrito — la que más tráfico trae.
 */
export function landingsDeBusqueda(): Landing[] {
  const salida: Landing[] = [];
  const operaciones: OperacionConLanding[] = ['sale', 'rent'];

  // `UBICACIONES` es la lista de distritos con mercado. No hay entradas
  // de provincia ni de departamento a propósito: una landing de «Lima»
  // compite con la página de operación entera y no aporta nada.
  const distritos = UBICACIONES;

  for (const operacion of operaciones) {
    for (const tipo of TIPOS_QUE_SE_BUSCAN) {
      salida.push({
        href: ruta(operacion, tipo),
        texto: comoSeLlama(operacion, tipo),
        operacion,
        tipo,
      });
    }

    for (const lugar of distritos) {
      salida.push({
        href: ruta(operacion, undefined, lugar.slug),
        texto: comoSeLlama(operacion, undefined, lugar.nombre),
        operacion,
        distrito: lugar.nombre,
        provincia: lugar.provincia,
      });

      for (const tipo of TIPOS_QUE_SE_BUSCAN) {
        salida.push({
          href: ruta(operacion, tipo, lugar.slug),
          texto: comoSeLlama(operacion, tipo, lugar.nombre),
          operacion,
          tipo,
          distrito: lugar.nombre,
          provincia: lugar.provincia,
        });
      }
    }
  }

  return salida;
}

/** Las landings de precio por m², una por distrito. */
export function landingsDePrecio(): { href: string; texto: string; distrito: string }[] {
  return UBICACIONES.map((u) => ({
    href: `/precio-m2/${u.slug}`,
    texto: `Precio por m² en ${u.nombre}`,
    distrito: u.nombre,
  }));
}

/**
 * Las landings agrupadas para mostrarlas en una página.
 *
 * Sin una página que las enliste, un buscador solo llegaría por el
 * sitemap, y un enlace en el sitemap sin ningún enlace interno que lo
 * respalde vale poco. Esta es esa página.
 */
export function landingsPorDistrito(): {
  distrito: string;
  provincia: string;
  enlaces: Landing[];
}[] {
  const porDistrito = new Map<string, { provincia: string; enlaces: Landing[] }>();

  for (const landing of landingsDeBusqueda()) {
    if (!landing.distrito) continue;
    const grupo = porDistrito.get(landing.distrito) ?? {
      provincia: landing.provincia ?? '',
      enlaces: [],
    };
    grupo.enlaces.push(landing);
    porDistrito.set(landing.distrito, grupo);
  }

  return [...porDistrito.entries()]
    .map(([distrito, grupo]) => ({ distrito, ...grupo }))
    .sort((a, b) => a.distrito.localeCompare(b.distrito, 'es-PE'));
}
