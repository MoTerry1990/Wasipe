import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import { MAXIMO_A_COMPARAR, type AvisoComparado } from '@/lib/ia/comparar';

/**
 * Los avisos a comparar, tal como están en la base.
 *
 * Una sola llamada a `comparar_avisos()`. La función de Postgres ya filtra
 * a los publicados y disponibles, así que un código inventado o el de un
 * aviso pausado simplemente no vuelve. Es la garantía de que la tabla
 * comparativa no puede mostrar una propiedad que no existe: la
 * aplicación no tiene forma de agregar una fila.
 */
export async function avisosParaComparar(
  codigos: readonly string[],
): Promise<AvisoComparado[]> {
  if (!supabaseConfigurado()) return [];

  const limpios = [
    ...new Set(
      codigos.map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2,4}-\d{4,10}$/.test(c)),
    ),
  ].slice(0, MAXIMO_A_COMPARAR);

  if (limpios.length === 0) return [];

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc('comparar_avisos', { p_codigos: limpios });
    if (error || !data) return [];
    return data as AvisoComparado[];
  } catch {
    return [];
  }
}
