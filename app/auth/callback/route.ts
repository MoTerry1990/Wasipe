import { NextResponse, type NextRequest } from 'next/server';
import { clienteServidor } from '@/lib/supabase/servidor';

/**
 * Vuelta desde el correo.
 *
 * Acá aterrizan los dos enlaces que Wasipe envía: el de confirmación de
 * cuenta y el de contraseña nueva. Ambos traen un código de un solo uso
 * que se canjea por una sesión; el canje escribe las cookies y por eso
 * tiene que ocurrir en el servidor.
 *
 * Si el enlace venció o ya se usó, se vuelve a /ingresar con un aviso en
 * castellano en vez de una pantalla de error en inglés.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const codigo = searchParams.get('code');
  const errorDescripcion = searchParams.get('error_description');

  // El destino viene en la URL, así que solo se acepta si es una ruta
  // interna: con http:// esto sería un salto abierto a cualquier sitio.
  const pedido = searchParams.get('siguiente') ?? '/panel';
  const siguiente = pedido.startsWith('/') && !pedido.startsWith('//') ? pedido : '/panel';

  if (errorDescripcion || !codigo) {
    const destino = new URL('/ingresar', origin);
    destino.searchParams.set('aviso', 'enlace-vencido');
    return NextResponse.redirect(destino);
  }

  const supabase = await clienteServidor();
  const { error } = await supabase.auth.exchangeCodeForSession(codigo);

  if (error) {
    const destino = new URL('/ingresar', origin);
    destino.searchParams.set('aviso', 'enlace-vencido');
    return NextResponse.redirect(destino);
  }

  return NextResponse.redirect(new URL(siguiente, origin));
}
