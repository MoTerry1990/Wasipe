import 'server-only';

import { redirect } from 'next/navigation';
import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import { accedeA } from '@/lib/auth/roles';
import type { Perfil, RolUsuario } from '@/types/base-datos';

/**
 * Guardias de sesión del servidor.
 *
 * El middleware redirige a quien no tiene sesión, pero eso es una
 * comodidad, no una defensa: un middleware se puede eludir con una
 * petición directa al Server Action o al Route Handler. La autorización
 * de verdad se comprueba acá, en cada página y en cada acción.
 *
 * Y por debajo de todo esto sigue estando la RLS: aunque una consulta se
 * escapara sin comprobar nada, la base no devolvería filas ajenas.
 */

/** El perfil de quien está en sesión, o redirige a ingresar. */
export async function requierePerfil(volverA?: string): Promise<Perfil> {
  // Sin proyecto de Supabase conectado no hay forma de comprobar quién
  // es quien pide. Se cierra: ante la duda, nadie entra.
  if (!supabaseConfigurado()) {
    redirect(volverA ? `/ingresar?volver=${encodeURIComponent(volverA)}` : '/ingresar');
  }

  const supabase = await clienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const destino = volverA ? `/ingresar?volver=${encodeURIComponent(volverA)}` : '/ingresar';
    redirect(destino);
  }

  const { data: perfil } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!perfil) {
    // La cuenta existe en auth pero le falta el perfil. Pasa si el
    // trigger de registro no llegó a correr; la bienvenida lo resuelve.
    redirect('/bienvenida');
  }

  if (!perfil.is_active) {
    redirect('/cuenta-suspendida');
  }

  return perfil;
}

/**
 * Igual que requierePerfil, pero además exige haber terminado la
 * bienvenida. Es la guardia de todo el panel: sin tipo de cuenta y sin
 * teléfono, media pantalla quedaría en blanco.
 */
export async function requiereCuentaLista(volverA?: string): Promise<Perfil> {
  const perfil = await requierePerfil(volverA);
  if (!perfil.onboarded_at) {
    redirect('/bienvenida');
  }
  return perfil;
}

/** Exige un rol concreto. Si no lo tiene, vuelve al panel. */
export async function requiereRol(roles: readonly RolUsuario[]): Promise<Perfil> {
  const perfil = await requiereCuentaLista();
  if (!roles.includes(perfil.role)) {
    redirect('/panel');
  }
  return perfil;
}

/**
 * Exige que el rol tenga permitida esta sección del panel.
 *
 * Es el mismo criterio con el que se arma el menú, aplicado del lado del
 * servidor: escribir la URL a mano no alcanza para entrar.
 */
export async function requiereSeccion(ruta: string): Promise<Perfil> {
  const perfil = await requiereCuentaLista(ruta);
  if (!accedeA(perfil.role, ruta)) {
    redirect('/panel');
  }
  return perfil;
}

/** El perfil si hay sesión, o null. No redirige: sirve para el encabezado. */
export async function perfilOpcional(): Promise<Perfil | null> {
  // Sin Supabase no hay sesión posible: se responde que no hay nadie en
  // vez de reventar la página pública que lo pregunta.
  if (!supabaseConfigurado()) return null;

  const supabase = await clienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return data ?? null;
}
