'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { leerMoneda } from '@/lib/moneda';
import { COOKIE_MONEDA, DURACION_PREFERENCIA } from '@/lib/preferencias';

/**
 * Cambia la moneda con la que se muestran los precios.
 *
 * Es una acción de servidor y no un estado del navegador para que el
 * HTML llegue con los precios ya convertidos. La cookie no lleva ningún
 * dato personal: solo dice "PEN" o "USD".
 */
export async function cambiarMoneda(datos: FormData): Promise<void> {
  const moneda = leerMoneda(datos.get('moneda'));
  const almacen = await cookies();

  almacen.set(COOKIE_MONEDA, moneda, {
    maxAge: DURACION_PREFERENCIA,
    path: '/',
    sameSite: 'lax',
    // No es un secreto y no la lee ningún script: httpOnly de todos modos,
    // porque nada del cliente necesita tocarla.
    httpOnly: true,
  });

  // La preferencia cambia todos los precios del sitio, no solo los de
  // esta página.
  revalidatePath('/', 'layout');
}
