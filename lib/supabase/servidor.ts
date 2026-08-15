import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/base-datos';
import { entornoPublico } from '@/lib/supabase/entorno';

/**
 * Cliente para el servidor: Server Components, Server Actions y Route
 * Handlers.
 *
 * Sigue usando la clave anónima, así que la RLS se aplica igual que en
 * el navegador. La diferencia es de dónde saca la sesión: de las cookies
 * de la petición en vez de las del documento.
 *
 * `server-only` hace que el build falle si alguien lo importa desde un
 * componente de cliente. Es más barato que descubrirlo en producción.
 */
export async function clienteServidor() {
  const almacen = await cookies();
  const { url, claveAnonima } = entornoPublico();

  return createServerClient<Database>(url, claveAnonima, {
    cookies: {
      getAll() {
        return almacen.getAll();
      },
      setAll(nuevas) {
        try {
          for (const { name, value, options } of nuevas) {
            almacen.set(name, value, options);
          }
        } catch {
          // Un Server Component no puede escribir cookies. No es un
          // error: el middleware ya refrescó la sesión antes de llegar
          // acá, así que se puede ignorar sin perder nada.
        }
      },
    },
  });
}

/**
 * La sesión actual, o null.
 *
 * Siempre `getUser()`, nunca `getSession()`: getSession lee la cookie sin
 * comprobar la firma, y una cookie se puede fabricar. getUser valida el
 * token contra Supabase.
 */
export async function usuarioActual() {
  const supabase = await clienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * El perfil completo de quien está en sesión, con su rol.
 *
 * El rol se lee de la tabla `profiles`, nunca de los metadatos del token:
 * esos los puede editar el propio usuario desde la API de Supabase.
 */
export async function perfilActual() {
  const supabase = await clienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return data ?? null;
}
