import { z } from 'zod';
import { ROLES_ELEGIBLES } from '@/lib/auth/roles';

/**
 * Validación de los formularios de cuenta.
 *
 * Los mensajes están redactados para mostrarse tal cual debajo del
 * campo: dicen qué falta, no "campo inválido". Los mismos esquemas se
 * usan en el navegador y en el servidor, así que una petición armada a
 * mano encuentra exactamente la misma puerta.
 */

const correo = z
  .string()
  .trim()
  .min(1, 'Escribe tu correo')
  .email('Ese correo no parece completo. Revisa que tenga @ y el dominio.')
  .transform((v) => v.toLowerCase());

/**
 * Contraseña: mínimo 8 caracteres y nada más.
 *
 * Exigir mayúscula, número y símbolo empuja a la gente a "Password1!" y
 * a anotarla en un papel. Ocho caracteres y una frase que se recuerde es
 * mejor seguridad real.
 */
const clave = z
  .string()
  .min(8, 'La contraseña necesita al menos 8 caracteres')
  .max(72, 'La contraseña no puede pasar de 72 caracteres');

/** Celular peruano: nueve dígitos que empiezan en 9. */
const celular = z
  .string()
  .trim()
  .regex(/^9\d{8}$/, 'El celular tiene 9 dígitos y empieza con 9. Ejemplo: 987654321');

export const esquemaIngreso = z.object({
  correo,
  clave: z.string().min(1, 'Escribe tu contraseña'),
});

export const esquemaRegistro = z.object({
  nombre: z
    .string()
    .trim()
    .min(2, 'Escribe tu nombre')
    .max(80, 'Ese nombre es demasiado largo'),
  correo,
  clave,
  terminos: z.literal(true, {
    message: 'Necesitamos que aceptes los términos y la política de privacidad',
  }),
});

export const esquemaRecuperacion = z.object({ correo });

export const esquemaNuevaClave = z
  .object({
    clave,
    repeticion: z.string(),
  })
  .refine((datos) => datos.clave === datos.repeticion, {
    path: ['repeticion'],
    message: 'Las dos contraseñas no coinciden',
  });

export const esquemaBienvenida = z.object({
  rol: z.enum(ROLES_ELEGIBLES as unknown as [string, ...string[]], {
    message: 'Elige qué tipo de cuenta necesitas',
  }),
  nombre: z
    .string()
    .trim()
    .min(2, 'Escribe tu nombre')
    .max(80, 'Ese nombre es demasiado largo'),
  celular,
  contacto: z.enum(['whatsapp', 'phone', 'email'], {
    message: 'Elige cómo prefieres que te contacten',
  }),
  intencion: z.enum(['buy', 'rent', 'sell', 'rent_out', 'invest'], {
    message: 'Cuéntanos qué te trae a Wasipe',
  }),
  distritos: z
    .array(z.string().trim().min(2).max(80))
    .max(12, 'Elige hasta 12 distritos: con más, las alertas dejan de servir')
    .default([]),
});

export const esquemaPerfil = z.object({
  nombre: z
    .string()
    .trim()
    .min(2, 'Escribe tu nombre')
    .max(80, 'Ese nombre es demasiado largo'),
  celular: celular.optional().or(z.literal('')),
  whatsapp: celular.optional().or(z.literal('')),
  contacto: z.enum(['whatsapp', 'phone', 'email']),
  bio: z.string().trim().max(600, 'La descripción no puede pasar de 600 caracteres').optional(),
});

export type DatosIngreso = z.infer<typeof esquemaIngreso>;
export type DatosRegistro = z.infer<typeof esquemaRegistro>;
export type DatosBienvenida = z.infer<typeof esquemaBienvenida>;
export type DatosPerfil = z.infer<typeof esquemaPerfil>;

// ---------------------------------------------------------------------
// Imágenes de perfil y logos
// ---------------------------------------------------------------------

/** 2 MB. Una foto de perfil bien comprimida no pasa de 200 KB. */
export const PESO_MAXIMO = 2 * 1024 * 1024;

export const TIPOS_AVATAR = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Los logos además aceptan SVG: muchas inmobiliarias lo tienen así. */
export const TIPOS_LOGO = [...TIPOS_AVATAR, 'image/svg+xml'] as const;

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

export type RevisionArchivo = { ok: true; extension: string } | { ok: false; error: string };

/**
 * Revisa un archivo antes de subirlo.
 *
 * Se comprueba acá y otra vez en el servidor, y encima la propia cubeta
 * de Supabase declara su límite de peso y sus tipos permitidos. Tres
 * capas para lo mismo, porque las dos primeras se pueden saltar.
 */
export function revisarImagen(
  archivo: { name: string; size: number; type: string },
  tiposPermitidos: readonly string[] = TIPOS_AVATAR,
): RevisionArchivo {
  if (archivo.size === 0) {
    return { ok: false, error: 'Ese archivo está vacío.' };
  }

  if (archivo.size > PESO_MAXIMO) {
    const mb = (archivo.size / 1024 / 1024).toFixed(1);
    return {
      ok: false,
      error: `La imagen pesa ${mb} MB y el máximo es 2 MB. Puedes reducirla y volver a intentarlo.`,
    };
  }

  if (!tiposPermitidos.includes(archivo.type)) {
    const nombres = tiposPermitidos
      .map((t) => EXTENSION[t]?.toUpperCase())
      .filter(Boolean)
      .join(', ');
    return { ok: false, error: `Solo aceptamos imágenes ${nombres}.` };
  }

  const extension = EXTENSION[archivo.type];
  if (!extension) {
    return { ok: false, error: 'No reconocemos ese tipo de imagen.' };
  }

  return { ok: true, extension };
}

/**
 * Ruta del archivo dentro de la cubeta.
 *
 * La primera carpeta es el identificador del dueño, y así lo exigen las
 * políticas de storage: nadie puede escribir fuera de su carpeta. El
 * nombre no usa el original —podría traer rutas, tildes o caracteres
 * raros— sino la marca de tiempo, que además evita que la imagen vieja
 * quede en caché.
 */
export function rutaDeImagen(idDueno: string, extension: string, marca: number): string {
  return `${idDueno}/${marca}.${extension}`;
}
