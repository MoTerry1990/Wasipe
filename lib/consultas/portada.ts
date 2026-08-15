import 'server-only';

import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import { TIPO_DE_CAMBIO_POR_DEFECTO } from '@/lib/moneda';
import type { Moneda, Operacion, TipoInmueble } from '@/types/base-datos';

/**
 * Consultas de la portada.
 *
 * Todas devuelven una lista vacía cuando no hay proyecto de Supabase
 * conectado o cuando la consulta falla. La portada muestra entonces su
 * estado vacío, que ya está escrito: es preferible una sección que dice
 * "todavía no hay avisos acá" a una portada que revienta entera porque
 * una de diez secciones no respondió.
 *
 * Ninguna filtra por estado de publicación: eso lo hace la RLS. Repetir
 * el filtro acá invitaría a que algún día una consulta nueva se olvide y
 * nadie lo note.
 */

/** Lo que necesita una tarjeta de aviso. Nada más: la portada trae diez. */
export type AvisoDePortada = {
  id: string;
  code: string;
  title: string;
  district: string;
  province: string;
  operation: Operacion;
  property_type: TipoInmueble;
  currency: Moneda;
  price: number;
  price_usd: number | null;
  price_per_m2: number | null;
  total_area: number;
  built_area: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking: number | null;
  verification_status: string;
  published_at: string | null;
  portada: { url: string; alt: string | null; ai_label: string | null } | null;
};

const CAMPOS =
  'id, code, title, district, province, operation, property_type, currency, price, price_usd, ' +
  'price_per_m2, total_area, built_area, bedrooms, bathrooms, parking, verification_status, published_at, ' +
  'property_media (url, alt, ai_label, is_cover, sort_order)';

type FotoCruda = {
  url: string;
  alt: string | null;
  ai_label: string | null;
  is_cover: boolean;
  sort_order: number;
};

/** Elige la portada del aviso: la marcada, o la primera del orden. */
function elegirPortada(fotos: FotoCruda[] | null | undefined) {
  if (!fotos || fotos.length === 0) return null;
  const elegida =
    fotos.find((f) => f.is_cover) ?? [...fotos].sort((a, b) => a.sort_order - b.sort_order)[0];
  return elegida ? { url: elegida.url, alt: elegida.alt, ai_label: elegida.ai_label } : null;
}

function normalizar(filas: unknown[]): AvisoDePortada[] {
  return (filas as (Omit<AvisoDePortada, 'portada'> & { property_media: FotoCruda[] })[]).map(
    ({ property_media, ...aviso }) => ({ ...aviso, portada: elegirPortada(property_media) }),
  );
}

/** Envuelve una consulta para que un fallo no tumbe la portada entera. */
async function conRespaldo<T>(consulta: () => Promise<T[]>): Promise<T[]> {
  if (!supabaseConfigurado()) return [];
  try {
    return await consulta();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------
// Secciones de avisos
// ---------------------------------------------------------------------

/**
 * Destacadas: verificadas primero, y entre ellas las más vistas.
 *
 * "Destacado" acá se gana, no se compra. Cuando existan los planes
 * pagos, el destaque comprado va a ir marcado como tal: mezclar
 * publicidad con recomendación sin avisar es lo que hace que la gente
 * deje de confiar en un portal.
 */
export async function destacadas(limite = 6): Promise<AvisoDePortada[]> {
  return conRespaldo(async () => {
    const supabase = await clienteServidor();
    const { data } = await supabase
      .from('properties')
      .select(CAMPOS)
      .eq('verification_status', 'verified')
      .order('views_count', { ascending: false })
      .limit(limite);
    return normalizar(data ?? []);
  });
}

export async function recienPublicadas(limite = 6): Promise<AvisoDePortada[]> {
  return conRespaldo(async () => {
    const supabase = await clienteServidor();
    const { data } = await supabase
      .from('properties')
      .select(CAMPOS)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limite);
    return normalizar(data ?? []);
  });
}

export async function proyectosNuevos(limite = 4): Promise<AvisoDePortada[]> {
  return conRespaldo(async () => {
    const supabase = await clienteServidor();
    const { data } = await supabase
      .from('properties')
      .select(CAMPOS)
      .eq('operation', 'project')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limite);
    return normalizar(data ?? []);
  });
}

export type AvisoQueBajo = AvisoDePortada & {
  bajaPorcentaje: number;
  precioAnterior: number;
  monedaAnterior: Moneda;
};

/**
 * Bajaron de precio.
 *
 * Se leen primero las rebajas de la vista y después los avisos, en dos
 * consultas. Es a propósito: la vista no puede traer las fotos anidadas,
 * y hacerlo en una sola consulta obligaría a repetir en SQL la lógica de
 * elegir la portada.
 */
export async function bajaronDePrecio(limite = 4): Promise<AvisoQueBajo[]> {
  return conRespaldo(async () => {
    const supabase = await clienteServidor();

    const { data: rebajas } = await supabase
      .from('listings_price_drops')
      .select('property_id, previous_price, previous_currency, drop_pct')
      .order('drop_pct', { ascending: false })
      .limit(limite);

    if (!rebajas || rebajas.length === 0) return [];

    const { data: avisos } = await supabase
      .from('properties')
      .select(CAMPOS)
      .in(
        'id',
        rebajas.map((r) => r.property_id),
      );

    const porId = new Map(normalizar(avisos ?? []).map((a) => [a.id, a]));

    return rebajas.flatMap((rebaja) => {
      const aviso = porId.get(rebaja.property_id);
      if (!aviso) return [];
      return [
        {
          ...aviso,
          bajaPorcentaje: Math.abs(Number(rebaja.drop_pct ?? 0)),
          precioAnterior: Number(rebaja.previous_price),
          monedaAnterior: rebaja.previous_currency as Moneda,
        },
      ];
    });
  });
}

// ---------------------------------------------------------------------
// Distritos y precio por m²
// ---------------------------------------------------------------------

export type DistritoConAvisos = {
  district: string;
  province: string;
  department: string;
  listings: number;
  for_sale: number;
  for_rent: number;
  avg_usd_per_m2: number | null;
};

export async function distritosConAvisos(limite = 8): Promise<DistritoConAvisos[]> {
  return conRespaldo(async () => {
    const supabase = await clienteServidor();
    const { data } = await supabase
      .from('popular_districts')
      .select('district, province, department, listings, for_sale, for_rent, avg_usd_per_m2')
      .order('listings', { ascending: false })
      .limit(limite);
    return (data ?? []) as DistritoConAvisos[];
  });
}

export type PrecioPorMetro = {
  district: string;
  operation: Operacion;
  listings: number;
  avg_usd_per_m2: number | null;
  median_usd_per_m2: number | null;
};

/**
 * Precio por m² por distrito, solo de venta.
 *
 * Mezclar venta y alquiler en un mismo promedio por m² no significa
 * nada: son mercados distintos y órdenes de magnitud distintos.
 */
export async function precioPorMetroPorDistrito(limite = 8): Promise<PrecioPorMetro[]> {
  return conRespaldo(async () => {
    const supabase = await clienteServidor();
    const { data } = await supabase
      .from('district_price_index')
      .select('district, operation, listings, avg_usd_per_m2, median_usd_per_m2')
      .eq('operation', 'sale')
      .order('listings', { ascending: false })
      .limit(limite);
    return (data ?? []) as PrecioPorMetro[];
  });
}

/** Tipo de cambio vigente, para convertir lo que se muestra. */
export async function tipoDeCambio(): Promise<number> {
  if (!supabaseConfigurado()) return TIPO_DE_CAMBIO_POR_DEFECTO;
  try {
    const supabase = await clienteServidor();
    const { data } = await supabase
      .from('exchange_rates')
      .select('pen_per_usd')
      .order('day', { ascending: false })
      .limit(1)
      .maybeSingle();
    return Number(data?.pen_per_usd ?? TIPO_DE_CAMBIO_POR_DEFECTO);
  } catch {
    return TIPO_DE_CAMBIO_POR_DEFECTO;
  }
}
