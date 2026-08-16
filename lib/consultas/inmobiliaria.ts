import 'server-only';

import { cache } from 'react';
import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import type { AvisoDePortada } from '@/lib/consultas/portada';
import type { EstadoVerificacion } from '@/types/base-datos';

/**
 * La página pública de una inmobiliaria.
 *
 * Lo que sale acá es lo que la inmobiliaria eligió publicar de sí misma:
 * nombre, descripción, logo, web, y el teléfono si lo cargó. El RUC no
 * sale aunque esté en la base: sirve para que Wasipe verifique, no para
 * publicarlo. Y `created_by` tampoco: quién creó la cuenta es un dato
 * interno, no parte del perfil.
 */

export type PerfilDeInmobiliaria = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  phone: string | null;
  website: string | null;
  verification_status: EstadoVerificacion;
  created_at: string;
  updated_at: string;
};

const CAMPOS_PUBLICOS =
  'id, name, slug, description, logo_url, phone, website, verification_status, created_at, updated_at';

/**
 * `cache()` porque `generateMetadata()` y la página piden lo mismo. Sin
 * él, cada visita a un perfil son dos consultas idénticas.
 */
export const inmobiliariaPorSlug = cache(
  async (slug: string): Promise<PerfilDeInmobiliaria | null> => {
    if (!supabaseConfigurado()) return null;

    try {
      const supabase = await clienteServidor();
      const { data, error } = await supabase
        .from('agencies')
        .select(CAMPOS_PUBLICOS)
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle();

      if (error || !data) return null;
      return data as PerfilDeInmobiliaria;
    } catch {
      return null;
    }
  },
);

const CAMPOS_AVISO =
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

/**
 * Los avisos de una inmobiliaria.
 *
 * No se filtra por estado de publicación: eso lo hace RLS. Repetirlo acá
 * sería un segundo sitio donde olvidarse, y el primero ya está resuelto.
 */
export const avisosDeInmobiliaria = cache(
  async (agenciaId: string, limite = 24): Promise<AvisoDePortada[]> => {
    if (!supabaseConfigurado()) return [];

    try {
      const supabase = await clienteServidor();
      const { data, error } = await supabase
        .from('properties')
        .select(CAMPOS_AVISO)
        .eq('agency_id', agenciaId)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(limite);

      if (error || !data) return [];

      return data.map((fila) => {
        const { property_media, ...aviso } = fila as unknown as Omit<
          AvisoDePortada,
          'portada'
        > & { property_media: FotoCruda[] };

        const fotos = property_media ?? [];
        const elegida =
          fotos.find((f) => f.is_cover) ??
          [...fotos].sort((a, b) => a.sort_order - b.sort_order)[0];

        return {
          ...aviso,
          portada: elegida
            ? { url: elegida.url, alt: elegida.alt, ai_label: elegida.ai_label }
            : null,
        } as AvisoDePortada;
      });
    } catch {
      return [];
    }
  },
);
