import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import type {
  EstadisticaDeMercado,
  Operacion,
  PeriodoDeMercado,
  TipoInmueble,
} from '@/types/base-datos';

/**
 * Lectura del índice de mercado.
 *
 * `market_stats` ya viene calculado y con la marca de cuándo: acá no se
 * promedia nada. Si una consulta de este archivo tuviera que hacer una
 * cuenta, sería una cuenta que nadie puede auditar y que no diría de
 * cuántos avisos sale.
 */

export type CorteDeMercado = {
  distrito: string;
  operacion: Operacion;
  tipo?: TipoInmueble | null;
  periodo?: PeriodoDeMercado;
};

/**
 * El agregado de un corte exacto.
 *
 * Devuelve null cuando no hay fila: sin fila no hay cifra, y la pantalla
 * tiene que mostrar «pocos datos» en vez de un cero.
 */
export async function estadisticaDe(
  corte: CorteDeMercado,
): Promise<EstadisticaDeMercado | null> {
  if (!supabaseConfigurado()) return null;

  try {
    const supabase = await clienteServidor();
    let consulta = supabase
      .from('market_stats')
      .select('*')
      .eq('district', corte.distrito)
      .eq('operation', corte.operacion)
      .eq('period', corte.periodo ?? 'm12');

    // `is('property_type', null)` es el corte «todos los tipos»: no es lo
    // mismo que no filtrar, que traería una fila por cada tipo.
    consulta = corte.tipo
      ? consulta.eq('property_type', corte.tipo)
      : consulta.is('property_type', null);

    const { data, error } = await consulta.maybeSingle();
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

/** El índice de todos los distritos con muestra suficiente. */
export async function indicePorDistrito(
  operacion: Operacion,
  periodo: PeriodoDeMercado = 'm12',
  limite = 60,
): Promise<EstadisticaDeMercado[]> {
  if (!supabaseConfigurado()) return [];

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from('market_stats')
      .select('*')
      .eq('operation', operacion)
      .eq('period', periodo)
      .is('property_type', null)
      // Solo lo que tiene sustento. Un distrito con tres avisos no
      // aparece en la tabla: aparecería con una cifra que no se sostiene.
      .eq('sufficient', true)
      .order('median_usd_per_m2', { ascending: false })
      .limit(limite);

    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

/** El detalle de un distrito, tipo por tipo. */
export async function detalleDeDistrito(
  distrito: string,
  operacion: Operacion,
  periodo: PeriodoDeMercado = 'm12',
): Promise<EstadisticaDeMercado[]> {
  if (!supabaseConfigurado()) return [];

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from('market_stats')
      .select('*')
      .eq('district', distrito)
      .eq('operation', operacion)
      .eq('period', periodo)
      .order('listings', { ascending: false });

    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

export type Comparable = {
  id: string;
  code: string;
  title: string;
  district: string;
  price: number;
  currency: 'PEN' | 'USD';
  total_area: number;
  price_usd_per_m2: number | null;
  bedrooms: number | null;
  published_at: string | null;
};

/**
 * Los avisos con los que se evaluó un precio.
 *
 * Sin poder mirarlos, la evaluación es un número que hay que creer. Por
 * eso la ficha los muestra con enlace: cualquiera puede abrir los ocho
 * avisos y hacer la cuenta de nuevo.
 */
export async function comparablesDe(propiedadId: string, limite = 8): Promise<Comparable[]> {
  if (!supabaseConfigurado()) return [];

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc('comparables_de', {
      p_property_id: propiedadId,
      p_limite: limite,
    });
    if (error || !data) return [];
    return data as Comparable[];
  } catch {
    return [];
  }
}
