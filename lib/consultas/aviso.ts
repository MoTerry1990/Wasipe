import 'server-only';

import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import type { AvisoDePortada } from '@/lib/consultas/portada';
import type {
  Amoblado,
  Moneda,
  Operacion,
  PoliticaMascotas,
  PrivacidadDireccion,
  TipoInmueble,
} from '@/types/base-datos';

/**
 * Consultas de la ficha de un aviso.
 *
 * Lo que nunca se pide acá es `property_locations`: la dirección exacta
 * tiene su propia política y solo se muestra cuando quien publica lo
 * autorizó. El punto que llega a la ficha es el público, ya desplazado.
 *
 * El teléfono tampoco se pide. Sale por `telefono_de_contacto()`, una
 * función aparte que se llama recién cuando alguien toca «ver teléfono»,
 * y así el número no viaja en el HTML de la página.
 */

export type Foto = {
  id: string;
  url: string;
  alt: string | null;
  /** La genera la base. Si está, hay que pintarla: no es opcional. */
  ai_label: string | null;
  ai_edited: boolean;
  is_staged: boolean;
  /** De qué foto salió, cuando es una versión hecha con Wasi AI. */
  original_media_id: string | null;
  kind: 'photo' | 'video' | 'tour' | 'floor_plan';
  is_cover: boolean;
  sort_order: number;
};

export type FichaDeAviso = {
  id: string;
  code: string;
  title: string;
  description: string;
  operation: Operacion;
  property_type: TipoInmueble;
  currency: Moneda;
  price: number;
  price_usd: number | null;
  price_per_m2: number | null;
  price_usd_per_m2: number | null;
  maintenance: number | null;
  total_area: number;
  built_area: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking: number | null;
  age_years: number | null;
  furnished: Amoblado;
  pet_policy: PoliticaMascotas | null;
  address_privacy: PrivacidadDireccion;
  department: string;
  province: string;
  district: string;
  lat: number | null;
  lon: number | null;
  verification_status: string;
  views_count: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  price_dropped_at: string | null;
  owner_id: string;
  agency_id: string | null;
  fotos: Foto[];
  caracteristicas: { feature: string; value: string | null }[];
  anunciante: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    role: string;
    created_at: string;
  } | null;
  inmobiliaria: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    verification_status: string;
  } | null;
};

const CAMPOS = `
  id, code, title, description, operation, property_type, currency, price, price_usd,
  price_per_m2, price_usd_per_m2, maintenance, total_area, built_area, bedrooms, bathrooms,
  parking, age_years, furnished, pet_policy, address_privacy, department, province, district,
  lat, lon, verification_status, views_count, created_at, updated_at, published_at,
  price_dropped_at, owner_id, agency_id,
  property_media (
    id, url, alt, ai_label, ai_edited, is_staged, original_media_id,
    kind, is_cover, sort_order
  ),
  property_features (feature, value),
  agencies (id, name, slug, logo_url, verification_status)
`;

/** La ficha completa, o null si no existe o no está publicada. */
export async function fichaPorCodigo(codigo: string): Promise<FichaDeAviso | null> {
  if (!supabaseConfigurado()) return null;

  try {
    const supabase = await clienteServidor();

    // La RLS ya limita a los avisos publicados; para el dueño devuelve
    // también los suyos, que es justo lo que se quiere al previsualizar.
    const { data, error } = await supabase
      .from('properties')
      .select(CAMPOS)
      .eq('code', codigo)
      .maybeSingle();

    if (error || !data) return null;

    const fila = data as unknown as FichaDeAviso & {
      property_media: Foto[];
      property_features: { feature: string; value: string | null }[];
      agencies: FichaDeAviso['inmobiliaria'];
    };

    // El anunciante sale de la vista pública, que no trae teléfono ni
    // correo. Es una consulta aparte porque `anunciantes` es una vista y
    // PostgREST no la puede anidar como relación.
    const { data: anunciante } = await supabase
      .from('anunciantes')
      .select('id, full_name, avatar_url, role, created_at')
      .eq('id', fila.owner_id)
      .maybeSingle();

    const fotos = [...(fila.property_media ?? [])].sort((a, b) => {
      if (a.is_cover !== b.is_cover) return a.is_cover ? -1 : 1;
      return a.sort_order - b.sort_order;
    });

    return {
      ...fila,
      fotos,
      caracteristicas: fila.property_features ?? [],
      anunciante: anunciante ?? null,
      inmobiliaria: fila.agencies ?? null,
    };
  } catch {
    return null;
  }
}

export type CambioDePrecio = {
  price: number;
  currency: Moneda;
  price_usd: number | null;
  changed_at: string;
};

/**
 * Historial de precios.
 *
 * Es público a propósito: ver que un departamento bajó dos veces en seis
 * meses es exactamente la información que la competencia esconde y que a
 * quien compra le sirve para negociar.
 */
export async function historialDePrecios(propertyId: string): Promise<CambioDePrecio[]> {
  if (!supabaseConfigurado()) return [];

  try {
    const supabase = await clienteServidor();
    const { data } = await supabase
      .from('price_history')
      .select('price, currency, price_usd, changed_at')
      .eq('property_id', propertyId)
      .order('changed_at', { ascending: false })
      .limit(12);

    return (data ?? []) as CambioDePrecio[];
  } catch {
    return [];
  }
}

/**
 * Propiedades parecidas.
 *
 * Mismo distrito, misma operación y mismo tipo, con el precio dentro de
 * un ±35% del de esta. Sin ese rango, la "parecida" a un departamento de
 * US$ 90.000 termina siendo un penthouse de US$ 600.000, que no le sirve
 * a nadie.
 */
export async function parecidas(aviso: FichaDeAviso, limite = 4): Promise<AvisoDePortada[]> {
  if (!supabaseConfigurado()) return [];

  const referencia = aviso.price_usd;

  try {
    const supabase = await clienteServidor();

    let consulta = supabase
      .from('properties')
      .select(
        'id, code, title, district, province, operation, property_type, currency, price, price_usd, ' +
          'price_per_m2, total_area, built_area, bedrooms, bathrooms, parking, verification_status, ' +
          'published_at, property_media (url, alt, ai_label, is_cover, sort_order)',
      )
      .eq('operation', aviso.operation)
      .eq('property_type', aviso.property_type)
      .eq('district', aviso.district)
      .neq('id', aviso.id);

    if (referencia) {
      consulta = consulta
        .gte('price_usd', referencia * 0.65)
        .lte('price_usd', referencia * 1.35);
    }

    const { data } = await consulta.limit(limite);

    return (data ?? []).map((fila) => {
      const { property_media, ...resto } = fila as unknown as AvisoDePortada & {
        property_media: {
          url: string;
          alt: string | null;
          ai_label: string | null;
          is_cover: boolean;
          sort_order: number;
        }[];
      };

      const fotos = property_media ?? [];
      const elegida = fotos.find((f) => f.is_cover) ?? fotos[0];

      return {
        ...resto,
        portada: elegida
          ? { url: elegida.url, alt: elegida.alt, ai_label: elegida.ai_label }
          : null,
      };
    });
  } catch {
    return [];
  }
}
