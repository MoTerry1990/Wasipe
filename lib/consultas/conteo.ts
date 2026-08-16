import 'server-only';

import { cache } from 'react';
import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import type { Filtros } from '@/lib/busqueda/filtros';

/**
 * Cuántos avisos hay detrás de una búsqueda, sin traerlos.
 *
 * Existe por una sola razón: decidir si una página merece entrar al
 * índice hay que decidirlo en `generateMetadata()`, que corre antes que
 * la página y no puede ver su resultado. Traer los 24 avisos completos
 * solo para contar sería pagar la consulta dos veces.
 *
 * `head: true` no trae ni una fila: PostgREST responde solo con el
 * encabezado del total. Y `cache()` de React hace que, si la página
 * termina pidiendo el mismo conteo, se le devuelva el de los metadatos en
 * vez de volver a preguntar.
 *
 * Devuelve `null` cuando la base no responde. Ese `null` importa: no es
 * lo mismo «no hay avisos» que «no sabemos», y confundirlos dejaría fuera
 * del índice a media web el día que la base tenga un mal minuto.
 */
export const contarAvisos = cache(async (filtros: Filtros): Promise<number | null> => {
  if (!supabaseConfigurado()) return null;

  try {
    const supabase = await clienteServidor();

    let consulta = supabase
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .eq('operation', filtros.operacion);

    if (filtros.departamento) consulta = consulta.ilike('department', filtros.departamento);
    if (filtros.provincia) consulta = consulta.ilike('province', filtros.provincia);
    if (filtros.distrito) consulta = consulta.ilike('district', filtros.distrito);
    if (filtros.tipo) consulta = consulta.eq('property_type', filtros.tipo);

    // A propósito no se aplican los demás filtros: este conteo solo se usa
    // para las landings, que por definición no los tienen. Copiar acá los
    // veinte filtros de `buscar()` sería un segundo lugar donde
    // equivocarse, y el primero ya existe.

    const { count, error } = await consulta;
    if (error) return null;

    return count ?? 0;
  } catch {
    return null;
  }
});
