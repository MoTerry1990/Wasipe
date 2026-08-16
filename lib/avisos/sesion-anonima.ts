import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * Identificador de sesión para las estadísticas del aviso.
 *
 * NO identifica a una persona. Es un valor al azar guardado en una
 * cookie, del que además solo se almacena su hash: sirve para no contar
 * diez veces la misma visita y nada más.
 *
 * Se eligió esto en vez de la IP a propósito. La IP es dato personal
 * según la Ley 29733, se comparte entre todos los de una casa o una
 * oficina, y cambia sola en las conexiones móviles: es peor para la
 * privacidad y también peor para medir.
 */

export const COOKIE_SESION = 'wasipe_sesion';

/** 30 días: después la cookie caduca y el hash cambia. */
const DURACION = 60 * 60 * 24 * 30;

function hashear(valor: string): string {
  return createHash('sha256').update(valor).digest('hex').slice(0, 32);
}

/** El hash de la sesión actual, o null si todavía no hay cookie. */
export async function hashDeSesion(): Promise<string | null> {
  const almacen = await cookies();
  const valor = almacen.get(COOKIE_SESION)?.value;
  return valor ? hashear(valor) : null;
}

/**
 * El hash de la sesión, creando la cookie si hace falta.
 *
 * Solo se puede llamar desde una Server Action o un Route Handler: un
 * Server Component no puede escribir cookies. Por eso `hashDeSesion()`
 * existe aparte, para leer sin escribir.
 */
export async function asegurarSesion(): Promise<string> {
  const almacen = await cookies();
  const existente = almacen.get(COOKIE_SESION)?.value;

  if (existente) return hashear(existente);

  const nuevo = randomBytes(16).toString('hex');
  almacen.set(COOKIE_SESION, nuevo, {
    maxAge: DURACION,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
  });

  return hashear(nuevo);
}
