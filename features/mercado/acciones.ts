'use server';

import { revalidatePath } from 'next/cache';
import { clienteAdministrador } from '@/lib/supabase/administrador';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import { requiereRol } from '@/lib/auth/sesion';

/**
 * Recálculo del índice de mercado.
 *
 * La función de la base corre con clave de servicio porque borra y
 * reescribe `market_stats` entera. El rol se comprueba acá antes de
 * llegar a ella: `recalcular_mercado()` no está concedida a
 * `authenticated`, así que no hay otro camino.
 *
 * Queda anotado en la bitácora de auditoría —lo hace la propia función—
 * con cuántas filas quedaron y con qué tipo de cambio se normalizó.
 */
export async function recalcularMercado(): Promise<{
  ok: boolean;
  filas?: number;
  mensaje?: string;
}> {
  await requiereRol(['admin']);
  if (!supabaseConfigurado()) return { ok: false, mensaje: 'Sin conexión con la base.' };

  const { data, error } = await clienteAdministrador().rpc('recalcular_mercado');
  if (error) return { ok: false, mensaje: 'No pudimos recalcular el índice.' };

  revalidatePath('/precio-m2');
  revalidatePath('/panel/moderacion/mercado');
  return { ok: true, filas: Number(data ?? 0) };
}
