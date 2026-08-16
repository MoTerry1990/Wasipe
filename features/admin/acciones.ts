'use server';

import { revalidatePath } from 'next/cache';
import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import { requierePuesto } from '@/lib/auth/personal';
import { esDecision, esPuesto, motivoValido, MOTIVO_MINIMO } from '@/lib/admin/permisos';

/**
 * Acciones de administración y moderación.
 *
 * Cada una comprueba el puesto en el servidor ANTES de llamar a la base,
 * y la base lo vuelve a comprobar por su cuenta: las funciones
 * `revisar_aviso()`, `verificar_anunciante()` y `resolver_bandera()`
 * levantan excepción si quien las llama no es del equipo. La
 * comprobación de acá es para dar un mensaje decente, no para proteger.
 *
 * Ninguna de estas funciones escribe el estado a mano: todo pasa por la
 * función de la base, que mueve el estado y deja el rastro en la misma
 * transacción. Un aviso rechazado sin motivo registrado no debería poder
 * existir, y por eso no hay un camino que lo permita.
 */

export type Resultado = { ok: boolean; mensaje?: string };

const SIN_CONEXION: Resultado = { ok: false, mensaje: 'Sin conexión con la base.' };

// ---------------------------------------------------------------------
// Moderación de avisos
// ---------------------------------------------------------------------

export async function revisarAviso(
  propiedadId: string,
  decisionCruda: string,
  motivo: string,
): Promise<Resultado> {
  await requierePuesto('moderator');
  if (!supabaseConfigurado()) return SIN_CONEXION;

  if (!esDecision(decisionCruda)) return { ok: false, mensaje: 'Esa decisión no existe.' };

  if (!motivoValido(decisionCruda, motivo)) {
    return {
      ok: false,
      mensaje: `Escribe al menos ${MOTIVO_MINIMO} caracteres explicando por qué: es lo que la persona va a leer para saber qué corregir.`,
    };
  }

  const supabase = await clienteServidor();
  const { error } = await supabase.rpc('revisar_aviso', {
    p_property_id: propiedadId,
    p_decision: decisionCruda,
    p_motivo: motivo.trim() || null,
  });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/panel/admin/avisos');
  revalidatePath('/panel/mis-propiedades');
  return { ok: true };
}

/** Vuelve a pasar las comprobaciones automáticas sobre un aviso. */
export async function marcarAviso(
  propiedadId: string,
): Promise<Resultado & { puestas?: number }> {
  await requierePuesto('moderator');
  if (!supabaseConfigurado()) return SIN_CONEXION;

  const supabase = await clienteServidor();
  const { data, error } = await supabase.rpc('marcar_aviso', { p_property_id: propiedadId });
  if (error) return { ok: false, mensaje: 'No pudimos revisar ese aviso.' };

  revalidatePath('/panel/admin/banderas');
  return { ok: true, puestas: Number(data ?? 0) };
}

// ---------------------------------------------------------------------
// Banderas
// ---------------------------------------------------------------------

export async function resolverBandera(
  banderaId: number,
  estado: string,
  nota: string,
): Promise<Resultado> {
  await requierePuesto('moderator');
  if (!supabaseConfigurado()) return SIN_CONEXION;

  if (estado !== 'confirmed' && estado !== 'dismissed') {
    return { ok: false, mensaje: 'Una bandera se confirma o se descarta.' };
  }
  if (nota.trim().length < 5) {
    return { ok: false, mensaje: 'Escribe qué encontraste, aunque sea en cinco palabras.' };
  }

  const supabase = await clienteServidor();
  const { error } = await supabase.rpc('resolver_bandera', {
    p_flag_id: banderaId,
    p_estado: estado,
    p_nota: nota.trim(),
  });

  if (error) return { ok: false, mensaje: 'Esa bandera ya estaba cerrada.' };

  revalidatePath('/panel/admin/banderas');
  return { ok: true };
}

// ---------------------------------------------------------------------
// Verificación
// ---------------------------------------------------------------------

export async function verificarInmobiliaria(
  agenciaId: string,
  estado: string,
  motivo: string,
): Promise<Resultado> {
  await requierePuesto('moderator');
  if (!supabaseConfigurado()) return SIN_CONEXION;

  const validos = ['unverified', 'in_progress', 'verified', 'rejected'];
  if (!validos.includes(estado)) return { ok: false, mensaje: 'Ese estado no existe.' };

  if (estado === 'rejected' && motivo.trim().length < MOTIVO_MINIMO) {
    return { ok: false, mensaje: 'Una verificación rechazada tiene que decir por qué.' };
  }

  const supabase = await clienteServidor();
  const { error } = await supabase.rpc('verificar_anunciante', {
    p_agency_id: agenciaId,
    p_estado: estado as 'unverified' | 'in_progress' | 'verified' | 'rejected',
    p_motivo: motivo.trim() || null,
  });

  if (error) return { ok: false, mensaje: 'No pudimos guardar la verificación.' };

  revalidatePath('/panel/admin/inmobiliarias');
  return { ok: true };
}

// ---------------------------------------------------------------------
// Personal
// ---------------------------------------------------------------------

/**
 * Nombra a alguien para un puesto.
 *
 * Solo administración general. La política de la base dice lo mismo, así
 * que aunque alguien llamara a la tabla directo, no pasa.
 */
export async function nombrarPersonal(
  usuarioId: string,
  puesto: string,
  nota: string,
): Promise<Resultado> {
  await requierePuesto('super_admin');
  if (!supabaseConfigurado()) return SIN_CONEXION;

  if (!esPuesto(puesto)) return { ok: false, mensaje: 'Ese puesto no existe.' };

  const supabase = await clienteServidor();
  const { error } = await supabase
    .from('staff_members')
    .insert({ user_id: usuarioId, role: puesto, note: nota.trim() || null });

  if (error) return { ok: false, mensaje: 'No pudimos nombrar a esa persona.' };

  revalidatePath('/panel/admin/usuarios');
  return { ok: true };
}

export async function quitarPuesto(usuarioId: string, puesto: string): Promise<Resultado> {
  await requierePuesto('super_admin');
  if (!supabaseConfigurado()) return SIN_CONEXION;
  if (!esPuesto(puesto)) return { ok: false, mensaje: 'Ese puesto no existe.' };

  const supabase = await clienteServidor();
  const { error } = await supabase
    .from('staff_members')
    .delete()
    .eq('user_id', usuarioId)
    .eq('role', puesto);

  if (error) return { ok: false, mensaje: 'No pudimos quitar ese puesto.' };

  revalidatePath('/panel/admin/usuarios');
  return { ok: true };
}
