import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/base-datos';
import { entornoPublico, supabaseConfigurado } from '@/lib/supabase/entorno';

/** Rutas que exigen sesión iniciada. */
const RUTAS_PRIVADAS = ['/publicar', '/panel', '/favoritos', '/mis-avisos', '/cuenta'];

/**
 * Refresco de sesión en el borde.
 *
 * El token de acceso dura una hora. Sin este paso, quien deja la pestaña
 * abierta vuelve y encuentra la sesión caída. Acá se renueva y se
 * reescriben las cookies en la respuesta.
 *
 * Detalle importante: la respuesta tiene que construirse desde la
 * petición y devolverse tal cual. Crear una NextResponse nueva al final
 * descarta las cookies que Supabase acaba de escribir y deja al usuario
 * en un bucle de cierre de sesión.
 */
export async function actualizarSesion(request: NextRequest) {
  let respuesta = NextResponse.next({ request });

  // Mientras no haya proyecto de Supabase conectado, el middleware deja
  // pasar todo. Reventar acá dejaría el sitio entero en error 500 por una
  // variable de entorno que todavía no toca configurar.
  if (!supabaseConfigurado()) {
    return respuesta;
  }

  const { url, claveAnonima } = entornoPublico();

  const supabase = createServerClient<Database>(url, claveAnonima, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(nuevas) {
        for (const { name, value } of nuevas) {
          request.cookies.set(name, value);
        }
        respuesta = NextResponse.next({ request });
        for (const { name, value, options } of nuevas) {
          respuesta.cookies.set(name, value, options);
        }
      },
    },
  });

  // Entre createServerClient y esta llamada no puede ir ninguna otra
  // cosa: es lo que dispara el refresco del token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ruta = request.nextUrl.pathname;
  const esPrivada = RUTAS_PRIVADAS.some((r) => ruta === r || ruta.startsWith(`${r}/`));

  if (!user && esPrivada) {
    const destino = request.nextUrl.clone();
    destino.pathname = '/ingresar';
    // Para volver a donde quería ir apenas inicie sesión.
    destino.searchParams.set('volver', ruta);
    return NextResponse.redirect(destino);
  }

  return respuesta;
}
