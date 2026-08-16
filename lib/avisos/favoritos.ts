import 'server-only';

import { cookies } from 'next/headers';
import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import { COOKIE_FAVORITOS } from '@/lib/avisos/favoritos-cookie';

/**
 * ¿Este aviso está guardado?
 *
 * Con sesión iniciada se pregunta a la base, que es donde quedan los
 * favoritos de verdad. Sin sesión se lee la cookie: se pierden al cambiar
 * de teléfono, pero sobreviven a la recarga, que es lo que la gente
 * espera al tocar un corazón.
 */
export async function esFavorito(propertyId: string): Promise<boolean> {
  if (supabaseConfigurado()) {
    try {
      const supabase = await clienteServidor();
      const { data: usuario } = await supabase.auth.getUser();

      if (usuario.user) {
        const { data } = await supabase
          .from('favorites')
          .select('property_id')
          .eq('property_id', propertyId)
          .maybeSingle();
        return Boolean(data);
      }
    } catch {
      // Se cae a la cookie.
    }
  }

  const almacen = await cookies();
  const guardados = (almacen.get(COOKIE_FAVORITOS)?.value ?? '').split(',');
  return guardados.includes(propertyId);
}
