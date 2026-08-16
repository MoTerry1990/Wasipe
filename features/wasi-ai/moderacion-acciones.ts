'use server';

import { revalidatePath } from 'next/cache';
import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import { requiereRol } from '@/lib/auth/sesion';

/**
 * Revisión de seguridad de las imágenes generadas.
 *
 * Moderación marca o retira; nunca borra. Una imagen retirada deja de
 * verse en el aviso, pero sigue en la base y su archivo sigue en storage:
 * si mañana hay un reclamo, la prueba de lo que se publicó está.
 *
 * Quien exige el rol de verdad es la función `revisar_foto()` de la base;
 * la comprobación de acá es para que la pantalla no se abra siquiera.
 */

const ESTADOS = ['cleared', 'flagged', 'blocked'] as const;

export async function revisarImagen(
  mediaId: string,
  estado: string,
  motivo?: string,
): Promise<{ ok: boolean; mensaje?: string }> {
  await requiereRol(['moderator', 'admin']);
  if (!supabaseConfigurado()) return { ok: false, mensaje: 'Sin conexión con la base.' };

  if (!(ESTADOS as readonly string[]).includes(estado)) {
    return { ok: false, mensaje: 'Ese estado de revisión no existe.' };
  }
  if (estado !== 'cleared' && !motivo?.trim()) {
    return { ok: false, mensaje: 'Explica por qué la marcas o la retiras.' };
  }

  const supabase = await clienteServidor();
  const { error } = await supabase.rpc('revisar_foto', {
    p_media_id: mediaId,
    p_estado: estado as (typeof ESTADOS)[number],
    p_motivo: motivo?.trim() || null,
  });

  if (error) return { ok: false, mensaje: 'No pudimos guardar la revisión.' };

  revalidatePath('/panel/moderacion/imagenes');
  return { ok: true };
}
