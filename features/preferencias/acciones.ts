'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { leerMoneda } from '@/lib/moneda';
import { COOKIE_MONEDA, DURACION_PREFERENCIA, LARGO_MAXIMO_DE_NOTA } from '@/lib/preferencias';
import { clienteServidor } from '@/lib/supabase/servidor';
import { requiereSeccion } from '@/lib/auth/sesion';
import type { Estado } from '@/features/cuentas/acciones';

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

/**
 * La nota de un favorito.
 *
 * `favorites.note` existía desde el esquema inicial y **nadie la
 * escribía**: la página la mostraba si estaba, y solo estaba porque la
 * puso la siembra. Estas dos acciones son el editor que faltaba.
 *
 * Quién puede escribir en qué fila lo decide la política `mis favoritos`,
 * que es `ALL` sobre `user_id = auth.uid()`. Acá no se repite esa
 * comprobación: se pide con la sesión de quien llama y la base devuelve
 * cero filas si la fila no es suya. Lo que sí se valida acá es el largo,
 * que es lo único que la base no sabría explicar en español.
 */
export async function guardarNota(avisoId: string, nota: string): Promise<Estado> {
  await requiereSeccion('/panel/favoritos');

  const limpia = nota.trim();
  if (limpia.length > LARGO_MAXIMO_DE_NOTA) {
    return {
      ok: false,
      mensaje: `La nota no puede pasar de ${LARGO_MAXIMO_DE_NOTA} caracteres.`,
    };
  }

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase
      .from('favorites')
      // Una nota vacía es no tener nota. Guardar la cadena vacía dejaría
      // una línea en blanco en la tarjeta sin que nadie la pidiera.
      .update({ note: limpia === '' ? null : limpia })
      .eq('property_id', avisoId);

    if (error) return { ok: false, mensaje: 'No pudimos guardar la nota.' };
  } catch {
    return { ok: false, mensaje: 'No pudimos guardar la nota.' };
  }

  revalidatePath('/panel/favoritos');
  return { ok: true };
}

export async function borrarNota(avisoId: string): Promise<Estado> {
  return guardarNota(avisoId, '');
}
