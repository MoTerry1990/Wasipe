import 'server-only';
import { redirect } from 'next/navigation';
import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import { requierePerfil } from '@/lib/auth/sesion';
import { accedeASeccion, type PuestoDeWasipe } from '@/lib/admin/permisos';

/**
 * Quién es quién dentro de Wasipe.
 *
 * Tercera capa de autorización, encima de las dos que ya había: el
 * middleware es comodidad, esto es la comprobación del servidor, y las
 * políticas de la base son la defensa de verdad. Cada una funciona sola,
 * y por eso saltarse una no abre la puerta.
 */

/** Los puestos de la persona con sesión. Vacío si no es del equipo. */
export async function puestosDeLaSesion(): Promise<PuestoDeWasipe[]> {
  if (!supabaseConfigurado()) return [];

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.from('staff_members').select('role');
    if (error || !data) return [];
    return data.map((f) => f.role);
  } catch {
    return [];
  }
}

/**
 * Exige pertenecer al equipo y tener acceso a esta sección.
 *
 * Manda al panel normal, no a una pantalla de error: quien llega acá sin
 * permiso casi siempre es alguien del equipo que ya no tiene ese puesto,
 * y un «no autorizado» a secas no le dice nada.
 */
export async function requiereSeccionDeAdmin(clave: string): Promise<{
  perfilId: string;
  puestos: PuestoDeWasipe[];
}> {
  const perfil = await requierePerfil('/panel');
  const puestos = await puestosDeLaSesion();

  if (!accedeASeccion(puestos, clave)) redirect('/panel?aviso=sin-permiso');

  return { perfilId: perfil.id, puestos };
}

/** Exige un puesto exacto. `super_admin` los tiene todos. */
export async function requierePuesto(puesto: PuestoDeWasipe): Promise<PuestoDeWasipe[]> {
  await requierePerfil('/panel');
  const puestos = await puestosDeLaSesion();

  if (!puestos.includes(puesto) && !puestos.includes('super_admin')) {
    redirect('/panel?aviso=sin-permiso');
  }
  return puestos;
}
