import 'server-only';

import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import { MINIMO_PARA_INDEXAR } from '@/lib/seo/indexable';
import { landingsDeBusqueda, type Landing } from '@/lib/seo/landings';
import { enlaceDeAviso } from '@/lib/avisos/enlace';
import type { Operacion, TipoInmueble } from '@/types/base-datos';

/**
 * Lo que va al sitemap, traído de la base.
 *
 * El criterio es uno solo: **si está acá, la dirección existe, responde
 * 200 y tiene contenido**. Un sitemap con enlaces muertos o con páginas
 * vacías no es un sitemap incompleto: es una señal activa de que el sitio
 * no está cuidado, y Google la usa.
 */

type Conteo = {
  operation: Operacion;
  property_type: TipoInmueble | null;
  district: string | null;
  total: number;
};

/** La llave de un corte. `*` es «todos». */
const llave = (op: string, tipo: string | null, distrito: string | null) =>
  `${op}|${tipo ?? '*'}|${distrito ?? '*'}`;

/**
 * Las landings que de verdad tienen avisos detrás.
 *
 * Si la base no responde se devuelve la lista vacía, no la lista entera:
 * publicar trescientas direcciones sin saber qué hay detrás es peor que
 * publicar un sitemap corto. El corto se corrige en la siguiente
 * regeneración; el otro deja huella en Search Console.
 */
export async function landingsConAvisos(): Promise<Landing[]> {
  if (!supabaseConfigurado()) return [];

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc('conteo_de_landings');
    if (error || !data) return [];

    const totales = new Map<string, number>();
    for (const fila of data as unknown as Conteo[]) {
      totales.set(
        llave(fila.operation, fila.property_type, fila.district),
        Number(fila.total ?? 0),
      );
    }

    return landingsDeBusqueda().filter((landing) => {
      const total = totales.get(
        llave(landing.operacion, landing.tipo ?? null, landing.distrito ?? null),
      );
      return (total ?? 0) >= MINIMO_PARA_INDEXAR;
    });
  } catch {
    return [];
  }
}

export type EntradaDeAviso = { ruta: string; actualizado: string };

/**
 * Las fichas publicadas.
 *
 * Con tope: un sitemap admite 50.000 direcciones y hoy ni de lejos se
 * llega, pero el día que se llegue hay que partirlo en varios archivos, y
 * es mejor que ese día el tope esté escrito y no que el archivo se corte
 * solo por donde caiga.
 */
export async function avisosPublicados(limite = 5000): Promise<EntradaDeAviso[]> {
  if (!supabaseConfigurado()) return [];

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from('properties')
      .select(
        'code, district, operation, property_type, total_area, built_area, updated_at, published_at',
      )
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limite);

    if (error || !data) return [];

    return data.map((aviso) => ({
      ruta: enlaceDeAviso(aviso),
      actualizado: aviso.updated_at ?? aviso.published_at ?? new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

/** Las inmobiliarias activas, que son las que tienen página pública. */
export async function inmobiliariasPublicas(): Promise<
  { slug: string; actualizado: string }[]
> {
  if (!supabaseConfigurado()) return [];

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from('agencies')
      .select('slug, updated_at')
      .eq('is_active', true)
      .limit(2000);

    if (error || !data) return [];

    return data.map((a) => ({
      slug: a.slug,
      actualizado: a.updated_at ?? new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

/**
 * Los distritos con índice de precio publicable.
 *
 * `market_stats` ya solo guarda cortes con muestra suficiente, así que
 * basta con leer los que existen: no hay que volver a decidir acá cuál es
 * suficiente, y no hay dos definiciones de lo mismo.
 */
export async function distritosConIndice(): Promise<string[]> {
  if (!supabaseConfigurado()) return [];

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from('market_stats')
      .select('district')
      .eq('sufficient', true)
      .limit(2000);

    if (error || !data) return [];

    return [...new Set(data.map((f) => f.district).filter((d): d is string => Boolean(d)))];
  } catch {
    return [];
  }
}
