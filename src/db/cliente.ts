import { neon } from '@neondatabase/serverless';

/** Firma mínima de un backend de base de datos. */
export type Consultador = (texto: string, params: unknown[]) => Promise<Record<string, unknown>[]>;

const url =
  process.env.DATABASE_URL ??
  process.env.NETLIFY_DATABASE_URL ??
  process.env.NETLIFY_DB_URL;

let backend: Consultador | null = url
  ? (async (t, p) => (await neon(url)(t, p)) as Record<string, unknown>[])
  : null;

if (!url) {
  // No lanzamos acá: /salud tiene que poder responder "sin-conexion"
  // en vez de tumbar toda la función.
  console.warn('[db] Falta DATABASE_URL — la base no está conectada.');
}

/**
 * Reemplaza el backend. Solo para pruebas: permite correr todo el
 * módulo contra PGlite (Postgres en WASM) sin tocar Neon.
 */
export function usarBackend(fn: Consultador | null) {
  backend = fn;
}

export const hayBase = () => backend !== null;

/** Consulta con parámetros posicionales ($1, $2...). Devuelve las filas. */
export async function sql<T = Record<string, unknown>>(
  texto: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (!backend) {
    const e = new Error('La base de datos no está conectada todavía. Estamos en eso.');
    (e as Error & { http?: number }).http = 503;
    throw e;
  }
  return (await backend(texto, params)) as T[];
}

/** Igual que sql() pero devuelve la primera fila o null. */
export async function una<T = Record<string, unknown>>(
  texto: string,
  params: unknown[] = [],
): Promise<T | null> {
  const filas = await sql<T>(texto, params);
  return filas[0] ?? null;
}

/** Comprueba que la base responde. Usado por /salud. */
export async function pingBase(): Promise<boolean> {
  if (!backend) return false;
  try {
    await backend('SELECT 1', []);
    return true;
  } catch {
    return false;
  }
}
