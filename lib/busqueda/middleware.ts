import { NextResponse, type NextRequest } from 'next/server';
import { leerSegmentos, rutaCanonica } from '@/lib/busqueda/rutas';
import { OPERACION_DESDE_RUTA } from '@/lib/catalogo';

/**
 * Rutas de búsqueda inválidas, resueltas antes de renderizar.
 *
 * `/comprar/narnia` no corresponde a ningún distrito ni a ningún tipo de
 * inmueble. Lo correcto sería responder 404, pero Next transmite la
 * respuesta en partes y para cuando el componente puede llamar a
 * notFound() ya salió el 200. Desde el middleware sí se llega a tiempo.
 *
 * Se redirige al listado de la operación en vez de cortar con un error:
 * quien llegó por un enlace viejo o con una errata igual quería ver
 * propiedades en venta, y dejarlo en una pantalla de error no le sirve.
 */
export function redirigirBusquedaInvalida(request: NextRequest): NextResponse | null {
  const ruta = request.nextUrl.pathname;
  const partes = ruta.split('/').filter(Boolean);

  if (partes.length < 2) return null;

  const base = `/${partes[0]}`;
  const operacion = OPERACION_DESDE_RUTA[base];
  if (!operacion) return null;

  const segmentos = partes.slice(1);
  const leidos = leerSegmentos(segmentos);

  // Un segmento que no es ni tipo ni distrito NO se redirige: se deja
  // pasar para que la página llame a `notFound()` y responda 404 de
  // verdad.
  //
  // Antes se mandaba a `/comprar`, y eso es un 404 blando: la dirección
  // inventada devolvía 200 con un listado genérico. Para un buscador eso
  // significa que el sitio tiene infinitas páginas válidas con el mismo
  // contenido, que es de los errores más caros que puede tener un portal.
  if (leidos.desconocido) return null;

  const destino = request.nextUrl.clone();
  destino.pathname = rutaCanonica(operacion, leidos);

  if (destino.pathname === ruta) return null;

  // 307 y no 308: la traducción de segmentos puede cambiar cuando el
  // catálogo de distritos crezca, y un permanente se queda pegado en la
  // caché del navegador para siempre.
  return NextResponse.redirect(destino, 307);
}
