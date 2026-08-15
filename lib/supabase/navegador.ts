'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/base-datos';
import { entornoPublico } from '@/lib/supabase/entorno';

/**
 * Cliente para componentes de cliente.
 *
 * Usa únicamente la clave anónima. Todo lo que puede leer o escribir lo
 * decide la RLS de la base, no este archivo.
 *
 * `createBrowserClient` ya devuelve la misma instancia en cada llamada,
 * así que no hace falta guardarla en un singleton propio.
 */
export function clienteNavegador() {
  const { url, claveAnonima } = entornoPublico();
  return createBrowserClient<Database>(url, claveAnonima);
}
