import { vistaPreviaSocial } from '@/lib/seo/og';
import { TIPO_INMUEBLE_PLURAL } from '@/lib/etiquetas';
import { tipoDesdeSlug } from '@/lib/catalogo';

/**
 * La imagen social de una landing.
 *
 * Va como ruta con parámetros y no como `opengraph-image.tsx` porque las
 * landings viven bajo un segmento comodín (`/comprar/[...segmentos]`), y
 * Next no admite un archivo de imagen dentro de un comodín.
 *
 * Todo lo que entra por la dirección se valida antes de dibujarse: el
 * tipo contra el catálogo, el lugar recortado a 40 caracteres. Es texto
 * que va a parar a una imagen, no a HTML, pero un parámetro sin límite es
 * igual una forma de hacer trabajar al servidor de gratis.
 */
export const runtime = 'nodejs';

export async function GET(peticion: Request) {
  const { searchParams } = new URL(peticion.url);

  // `tipoDesdeSlug` devuelve undefined para cualquier cosa que no esté en
  // el catálogo, así que un parámetro inventado sale como «Propiedades».
  const tipo = tipoDesdeSlug(searchParams.get('tipo'));

  const lugar = (searchParams.get('lugar') ?? '').trim().slice(0, 40);
  const alquiler = searchParams.get('op') === 'rent';

  const que = tipo ? TIPO_INMUEBLE_PLURAL[tipo] : 'Propiedades';

  return vistaPreviaSocial({
    encima: alquiler ? 'En alquiler' : 'En venta',
    titulo: lugar ? `${que} en ${lugar}` : que,
    bajoLaCifra: 'Con el precio por m² a la vista',
  });
}
