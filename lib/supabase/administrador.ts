import 'server-only';

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/base-datos';
import { entornoPublico, claveDeServicio } from '@/lib/supabase/entorno';

/**
 * Cliente con clave de servicio. SE SALTA TODA LA RLS.
 *
 * Reservado para tres casos, y ninguno más:
 *   1. Webhooks de la pasarela de pagos (Culqi), donde no hay sesión.
 *   2. Tareas programadas: vencer avisos, purgar bitácoras, tipo de cambio.
 *   3. Operaciones de moderación que ya comprobaron el rol por su cuenta.
 *
 * Cada vez que se use hay que preguntarse si de verdad no alcanza con
 * `clienteServidor()`. Casi siempre alcanza.
 *
 * Nunca se importa desde un componente de cliente: `server-only` corta el
 * build, y `claveDeServicio()` además revienta si detecta un navegador.
 */
export function clienteAdministrador() {
  const { url } = entornoPublico();

  return createClient<Database>(url, claveDeServicio(), {
    auth: {
      // Sin sesión y sin refresco: este cliente no representa a nadie.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
