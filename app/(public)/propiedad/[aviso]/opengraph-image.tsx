import { vistaPreviaSocial, TAMANO_OG } from '@/lib/seo/og';
import { fichaPorCodigo } from '@/lib/consultas/aviso';
import { codigoDesdeRuta } from '@/lib/avisos/enlace';
import { OPERACION, TIPO_INMUEBLE } from '@/lib/etiquetas';
import { dinero, numero } from '@/lib/formato';

export const size = TAMANO_OG;
export const contentType = 'image/png';
export const alt = 'Aviso en Wasipe';

/**
 * La tarjeta que se ve al compartir un aviso por WhatsApp.
 *
 * Lleva el precio y el precio por m², que es lo que Wasipe tiene y los
 * demás portales no muestran. Si el aviso no existe, se devuelve una
 * tarjeta genérica en vez de un error: una imagen rota en un chat se ve
 * peor que una imagen sosa.
 */
export default async function Imagen({ params }: { params: Promise<{ aviso: string }> }) {
  const { aviso: segmento } = await params;
  const codigo = codigoDesdeRuta(segmento);
  const aviso = codigo ? await fichaPorCodigo(codigo) : null;

  if (!aviso) {
    return vistaPreviaSocial({ titulo: 'Propiedades en todo el Perú', encima: 'Wasipe' });
  }

  const area = aviso.built_area ?? aviso.total_area;

  return vistaPreviaSocial({
    encima: `${TIPO_INMUEBLE[aviso.property_type]} ${OPERACION[aviso.operation].toLowerCase()} · ${aviso.district}`,
    titulo: aviso.title,
    cifra: dinero(aviso.price, aviso.currency),
    bajoLaCifra: [
      area ? `${numero(Math.round(area))} m²` : null,
      aviso.price_per_m2
        ? `${dinero(Math.round(aviso.price_per_m2), aviso.currency)} por m²`
        : null,
    ]
      .filter(Boolean)
      .join(' · '),
  });
}
