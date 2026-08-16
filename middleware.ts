import type { NextRequest } from 'next/server';
import { actualizarSesion } from '@/lib/supabase/middleware';
import { redirigirBusquedaInvalida } from '@/lib/busqueda/middleware';

export async function middleware(request: NextRequest) {
  // Primero las rutas de búsqueda: una dirección con segmentos que no
  // existen se resuelve acá, antes de gastar una llamada a Supabase.
  const redireccion = redirigirBusquedaInvalida(request);
  if (redireccion) return redireccion;

  return actualizarSesion(request);
}

export const config = {
  matcher: [
    /*
     * Todo menos lo que no necesita sesión:
     *   · _next/static y _next/image — archivos del build
     *   · favicon, robots, sitemap e imágenes — recursos públicos
     * Refrescar la sesión en cada uno de esos sería gastar una llamada a
     * Supabase por cada archivo de la página.
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)',
  ],
};
