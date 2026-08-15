import { z } from 'zod';
import { ErrorHTTP } from './errores.ts';

/** Texto recortado; la cadena vacía se convierte en null. */
export const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .email('Ese correo no parece válido.')
  .max(254);

export const password = z
  .string()
  .min(8, 'La contraseña necesita al menos 8 caracteres.')
  .max(256, 'Esa contraseña es demasiado larga.');

export const nombre = z
  .string()
  .trim()
  .min(2, 'Escribe tu nombre.')
  .max(120, 'Ese nombre es demasiado largo.');

/** Celular peruano: +51 seguido de 9 dígitos que empiezan en 9. */
export const celular = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ''))
  .refine((v) => /^\+519\d{8}$/.test(v), 'El celular debe tener 9 dígitos y empezar en 9.');

export const celularOpcional = celular.nullable().optional();

export const ruc = z
  .string()
  .trim()
  .regex(/^\d{11}$/, 'El RUC debe tener 11 dígitos.');

export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{3,60}$/, 'Solo minúsculas, números y guiones.');

export const uuid = z.string().uuid('Identificador inválido.');

/** Roles que un usuario puede elegir al registrarse o cambiar. */
export const ROLES_AUTOSERVICIO = [
  'comprador',
  'propietario',
  'agente',
  'inmobiliaria',
] as const;

export const rolAutoservicio = z.enum(ROLES_AUTOSERVICIO, {
  errorMap: () => ({ message: 'Ese tipo de cuenta no se puede crear desde aquí.' }),
});

/**
 * Valida con Zod y traduce el fallo a un ErrorHTTP 422 con el campo,
 * para que el frontend pueda enfocar el input equivocado.
 */
export function validar<T extends z.ZodTypeAny>(esquema: T, datos: unknown): z.infer<T> {
  const r = esquema.safeParse(datos);
  if (r.success) return r.data;

  const primero = r.error.issues[0];
  throw new ErrorHTTP(422, primero?.message ?? 'Revisa los datos enviados.', {
    codigo: 'VALIDACION',
    campo: primero?.path.join('.') || undefined,
  });
}

/** Toma solo los campos permitidos. Nunca expandir el body directo en un UPDATE. */
export function soloCampos<T extends Record<string, unknown>>(
  body: T,
  permitidos: readonly string[],
): Partial<T> {
  const fuera: Record<string, unknown> = {};
  for (const k of permitidos) if (k in body) fuera[k] = body[k];
  return fuera as Partial<T>;
}
