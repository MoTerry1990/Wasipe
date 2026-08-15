import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/base-datos';
import { entornoPublico, supabaseConfigurado } from '@/lib/supabase/entorno';

/** Rutas que exigen sesión iniciada. */
const RUTAS_PRIVADAS = ['/panel', '/bienvenida', '/publicar', '/cuenta'];

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

  const ruta = request.nextUrl.pathname;
  const esPrivada = RUTAS_PRIVADAS.some((r) => ruta === r || ruta.startsWith(`${r}/`));

  // Sin proyecto de Supabase conectado no hay forma de comprobar sesión.
  // Las páginas públicas siguen andando —reventar acá dejaría el sitio
  // entero en error 500 por una variable que todavía no toca configurar—,
  // pero lo privado se cierra: ante la duda, no se abre.
  if (!supabaseConfigurado()) {
    if (esPrivada) {
      const destino = request.nextUrl.clone();
      destino.pathname = '/ingresar';
      destino.searchParams.set('volver', ruta);
      return NextResponse.redirect(destino);
    }
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

  if (!user && esPrivada) {
    const destino = request.nextUrl.clone();
    destino.pathname = '/ingresar';
    // Para volver a donde quería ir apenas inicie sesión.
    destino.searchParams.set('volver', ruta);
    return NextResponse.redirect(destino);
  }

  return respuesta;
}
