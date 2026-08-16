import { normalizar } from '@/config/ubicaciones';
import { SLUG_DESDE_TIPO } from '@/lib/catalogo';
import type { Operacion, TipoInmueble } from '@/types/base-datos';

/**
 * Dirección de la ficha de un aviso.
 *
 * Forma: `/propiedad/departamento-en-venta-miraflores-92m2-wsp-001247`
 *
 * El identificador es el código público (WSP-001247), no el UUID. Tres
 * razones: es el número que la persona dicta por teléfono, no filtra un
 * identificador interno, y entra en un mensaje de WhatsApp sin ocupar
 * media pantalla.
 *
 * El texto de adelante es solo para las personas y para los buscadores.
 * Si cambia —porque se corrigió el título o el distrito— la dirección
 * vieja sigue funcionando: lo único que se lee es el código del final.
 */

const OPERACION_EN_SLUG: Record<Operacion, string> = {
  sale: 'en-venta',
  rent: 'en-alquiler',
  project: 'proyecto',
};

/** Pasa un texto a la forma que se usa en las direcciones. */
export function aSlug(texto: string): string {
  return normalizar(texto)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

export function enlaceDeAviso(aviso: {
  code: string;
  property_type: TipoInmueble;
  operation: Operacion;
  district: string;
  built_area?: number | null;
  total_area?: number;
}): string {
  const area = aviso.built_area ?? aviso.total_area;

  const partes = [
    SLUG_DESDE_TIPO[aviso.property_type],
    OPERACION_EN_SLUG[aviso.operation],
    aSlug(aviso.district),
    area ? `${Math.round(area)}m2` : null,
    aSlug(aviso.code),
  ].filter(Boolean);

  return `/propiedad/${partes.join('-')}`;
}

/**
 * Saca el código de una dirección.
 *
 * Se busca al final y no en cualquier lugar: un distrito que llegara a
 * llamarse "wsp-000001" no debería confundirse con el identificador.
 */
export function codigoDesdeRuta(segmento: string): string | null {
  const encontrado = /(?:^|-)(wsp-\d{6})$/i.exec(segmento.trim());
  return encontrado?.[1] ? encontrado[1].toUpperCase() : null;
}
