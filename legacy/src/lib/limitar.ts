import { sql } from '../db/cliente.ts';
import { ErrorHTTP } from './errores.ts';

/**
 * Rate limiting sobre la tabla `intentos_auth`.
 *
 * En Lambda no hay estado en memoria entre invocaciones, así que el
 * contador vive en Postgres. Una sola sentencia hace todo: inserta,
 * incrementa, o reinicia si la ventana ya venció.
 */
export async function limitar(
  clase: string,
  identidad: string,
  tope: number,
  minutos: number,
): Promise<void> {
  const clave = `${clase}:${identidad}`;
  try {
    const filas = await sql<{ conteo: number }>(
      `INSERT INTO intentos_auth (clave, conteo, ventana)
       VALUES ($1, 1, now())
       ON CONFLICT (clave) DO UPDATE SET
         conteo = CASE
           WHEN intentos_auth.ventana < now() - ($2 || ' minutes')::interval THEN 1
           ELSE intentos_auth.conteo + 1 END,
         ventana = CASE
           WHEN intentos_auth.ventana < now() - ($2 || ' minutes')::interval THEN now()
           ELSE intentos_auth.ventana END
       RETURNING conteo`,
      [clave, String(minutos)],
    );

    const conteo = filas[0]?.conteo ?? 0;
    if (conteo > tope) {
      throw new ErrorHTTP(429, 'Demasiados intentos. Espera unos minutos y vuelve a probar.', {
        codigo: 'DEMASIADOS_INTENTOS',
      });
    }
  } catch (e) {
    // Si el límite disparó, propagamos. Si falló la base, no bloqueamos
    // al usuario por un problema nuestro.
    if (e instanceof ErrorHTTP) throw e;
  }
}

/** Borra el contador tras un éxito (por ejemplo, login correcto). */
export async function limpiarLimite(clase: string, identidad: string): Promise<void> {
  try {
    await sql(`DELETE FROM intentos_auth WHERE clave = $1`, [`${clase}:${identidad}`]);
  } catch {
    /* no es crítico */
  }
}

export const LIMITES = {
  login: { tope: 8, minutos: 15 },
  registro: { tope: 3, minutos: 60 },
  recuperar: { tope: 3, minutos: 60 },
  contacto: { tope: 5, minutos: 60 },
} as const;
