import { z } from 'zod';
import { TIPO_DESDE_SLUG } from '@/lib/catalogo';

/**
 * Validación del asistente de publicación.
 *
 * Cada paso tiene su propio esquema y el aviso completo es la suma de
 * todos. Esa división es la que permite dos cosas a la vez: guardar un
 * borrador a medio llenar sin quejarse de lo que falta, y no dejar
 * enviar a revisión hasta que todo esté.
 *
 * Los mismos esquemas corren en el navegador y en el servidor. Una
 * petición armada a mano encuentra exactamente la misma puerta.
 */

export const PASOS = [
  { clave: 'operacion', titulo: 'Qué publicas' },
  { clave: 'ubicacion', titulo: 'Dónde queda' },
  { clave: 'precio', titulo: 'Precio y gastos' },
  { clave: 'areas', titulo: 'Áreas y ambientes' },
  { clave: 'caracteristicas', titulo: 'Qué más tiene' },
  { clave: 'descripcion', titulo: 'Descripción' },
  { clave: 'fotos', titulo: 'Fotos y video' },
  { clave: 'contacto', titulo: 'Cómo te contactan' },
  { clave: 'vista-previa', titulo: 'Vista previa' },
  { clave: 'envio', titulo: 'Enviar a revisión' },
] as const;

export type ClaveDePaso = (typeof PASOS)[number]['clave'];

/** Cuántas fotos como mínimo. Un aviso sin fotos no lo mira nadie. */
export const FOTOS_MINIMAS = 3;
export const FOTOS_MAXIMAS = 30;

const opcional = <T extends z.ZodTypeAny>(esquema: T) => esquema.optional().catch(undefined);

// ---------------------------------------------------------------------
// Paso 1 — Qué publicas
// ---------------------------------------------------------------------
export const pasoOperacion = z.object({
  operacion: z.enum(['sale', 'rent', 'project'], { message: 'Elige si vendes o alquilas' }),
  tipo: z.string().refine((v) => Boolean(TIPO_DESDE_SLUG[v]), 'Elige qué tipo de propiedad es'),
});

// ---------------------------------------------------------------------
// Paso 2 — Dónde queda
//
// La dirección exacta se pide siempre, porque sin ella no se puede
// ubicar la propiedad en el mapa ni coordinar una visita. Lo que la
// persona elige es cuánto de eso se publica.
// ---------------------------------------------------------------------
export const pasoUbicacion = z.object({
  departamento: z.string().trim().min(2, 'Falta el departamento'),
  provincia: z.string().trim().min(2, 'Falta la provincia'),
  distrito: z.string().trim().min(2, 'Elige el distrito'),
  direccion: z
    .string()
    .trim()
    .min(5, 'Escribe la dirección: calle y número')
    .max(160, 'Esa dirección es demasiado larga'),
  urbanizacion: z.string().trim().max(120).optional().or(z.literal('')),
  referencia: z.string().trim().max(240).optional().or(z.literal('')),
  privacidad: z.enum(['exact', 'approximate', 'district_only'], {
    message: 'Elige cuánto de la dirección quieres mostrar',
  }),
});

// ---------------------------------------------------------------------
// Paso 3 — Precio y gastos
// ---------------------------------------------------------------------
export const pasoPrecio = z.object({
  moneda: z.enum(['PEN', 'USD'], { message: 'Elige la moneda' }),
  precio: z.coerce
    .number({ message: 'Escribe el precio' })
    .positive('El precio tiene que ser mayor que cero')
    .max(100_000_000, 'Ese precio no parece real'),
  mantenimiento: opcional(
    z.coerce.number().min(0, 'El mantenimiento no puede ser negativo').max(1_000_000),
  ),
});

// ---------------------------------------------------------------------
// Paso 4 — Áreas y ambientes
// ---------------------------------------------------------------------
/**
 * La forma se declara aparte del esquema.
 *
 * `pasoAreas` lleva un `refine` para comparar dos campos entre sí, y un
 * esquema refinado ya no expone su forma: sin esta constante no se
 * podría reutilizar en el esquema del aviso completo.
 */
const formaAreas = {
  areaTotal: z.coerce
    .number({ message: 'Escribe el área total' })
    .positive('El área tiene que ser mayor que cero')
    .max(1_000_000, 'Esa área no parece real'),
  areaTechada: opcional(z.coerce.number().positive().max(1_000_000)),
  dormitorios: opcional(z.coerce.number().int().min(0).max(30)),
  banos: opcional(z.coerce.number().int().min(0).max(30)),
  cocheras: opcional(z.coerce.number().int().min(0).max(50)),
  antiguedad: opcional(z.coerce.number().int().min(0).max(200)),
};

export const pasoAreas = z
  .object(formaAreas)
  .refine((d) => d.areaTechada === undefined || d.areaTechada <= d.areaTotal, {
    path: ['areaTechada'],
    message: 'El área techada no puede ser mayor que el área total',
  });

// ---------------------------------------------------------------------
// Paso 5 — Qué más tiene
// ---------------------------------------------------------------------
export const pasoCaracteristicas = z.object({
  amoblado: z.enum(['none', 'partial', 'full']).default('none'),
  mascotas: opcional(z.enum(['allowed', 'not_allowed', 'negotiable'])),
  caracteristicas: z
    .array(z.string().regex(/^[a-z0-9_]{2,40}$/))
    .max(40)
    .default([]),
});

// ---------------------------------------------------------------------
// Paso 6 — Descripción
//
// El mínimo de 40 caracteres es el mismo que exige la base. El título
// entre 10 y 120 también: son las reglas de `properties`, repetidas acá
// para poder avisar antes de enviar en vez de mostrar un error de SQL.
// ---------------------------------------------------------------------
export const pasoDescripcion = z.object({
  titulo: z
    .string()
    .trim()
    .min(10, 'El título necesita al menos 10 caracteres')
    .max(120, 'El título no puede pasar de 120 caracteres'),
  descripcion: z
    .string()
    .trim()
    .min(40, 'Cuéntale algo más a quien mire el aviso: al menos 40 caracteres')
    .max(6000, 'La descripción no puede pasar de 6000 caracteres'),
});

// ---------------------------------------------------------------------
// Paso 7 — Fotos
// ---------------------------------------------------------------------
export const pasoFotos = z.object({
  fotos: z
    .array(
      z.object({
        id: z.string().min(1),
        url: z.string().url(),
        alt: z.string().trim().max(160).optional().or(z.literal('')),
        portada: z.boolean().default(false),
      }),
    )
    .min(FOTOS_MINIMAS, `Sube al menos ${FOTOS_MINIMAS} fotos: sin fotos casi nadie escribe`)
    .max(FOTOS_MAXIMAS, `Hasta ${FOTOS_MAXIMAS} fotos`),
  video: z.string().url('Ese enlace de video no es válido').optional().or(z.literal('')),
});

// ---------------------------------------------------------------------
// Paso 8 — Cómo te contactan
// ---------------------------------------------------------------------
export const pasoContacto = z.object({
  contacto: z.enum(['whatsapp', 'phone', 'email'], {
    message: 'Elige cómo prefieres que te escriban',
  }),
  celular: z
    .string()
    .trim()
    .regex(/^9\d{8}$/, 'El celular tiene 9 dígitos y empieza con 9. Ejemplo: 987654321'),
});

/** Los esquemas por paso, en el mismo orden que PASOS. */
export const ESQUEMA_POR_PASO = {
  operacion: pasoOperacion,
  ubicacion: pasoUbicacion,
  precio: pasoPrecio,
  areas: pasoAreas,
  caracteristicas: pasoCaracteristicas,
  descripcion: pasoDescripcion,
  fotos: pasoFotos,
  contacto: pasoContacto,
} as const;

/** El aviso completo: lo que se exige para poder enviarlo a revisión. */
export const esquemaDeAviso = z.object({
  ...pasoOperacion.shape,
  ...pasoUbicacion.shape,
  ...pasoPrecio.shape,
  ...pasoCaracteristicas.shape,
  ...pasoDescripcion.shape,
  ...pasoFotos.shape,
  ...pasoContacto.shape,
  ...formaAreas,
});

export type DatosDeAviso = z.infer<typeof esquemaDeAviso>;
export type BorradorDeAviso = Partial<DatosDeAviso>;

export type EstadoDePaso = { completo: boolean; errores: Record<string, string> };

/** Revisa un paso suelto contra su esquema. */
export function revisarPaso(clave: ClaveDePaso, datos: BorradorDeAviso): EstadoDePaso {
  const esquema = ESQUEMA_POR_PASO[clave as keyof typeof ESQUEMA_POR_PASO];

  // Los dos últimos pasos no piden datos nuevos: resumen y envío.
  if (!esquema) return { completo: true, errores: {} };

  const resultado = esquema.safeParse(datos);
  if (resultado.success) return { completo: true, errores: {} };

  const errores: Record<string, string> = {};
  for (const issue of resultado.error.issues) {
    const campo = issue.path[0];
    if (typeof campo === 'string' && !errores[campo]) errores[campo] = issue.message;
  }

  return { completo: false, errores };
}

/**
 * Qué falta para poder enviar.
 *
 * Se devuelve la lista de pasos incompletos y no un simple "faltan
 * datos": la persona tiene que poder tocar el paso y llegar justo al
 * campo que le falta.
 */
export function pasosIncompletos(datos: BorradorDeAviso): ClaveDePaso[] {
  return PASOS.map((paso) => paso.clave).filter((clave) => !revisarPaso(clave, datos).completo);
}

export function sePuedeEnviar(datos: BorradorDeAviso): boolean {
  return pasosIncompletos(datos).length === 0;
}

// ---------------------------------------------------------------------
// Fotos: validación del archivo antes de subirlo
// ---------------------------------------------------------------------

/** 15 MB: entra una foto de celular sin comprimir. */
export const PESO_MAXIMO_FOTO = 15 * 1024 * 1024;

export const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

/** Lado mayor de la versión que se muestra. Más que esto no aporta nada. */
export const LADO_MAXIMO = 1920;

/** Calidad de la compresión. 0.82 es donde deja de notarse la diferencia. */
export const CALIDAD = 0.82;

export type RevisionDeFoto = { ok: true } | { ok: false; error: string };

export function revisarFoto(archivo: {
  name: string;
  size: number;
  type: string;
}): RevisionDeFoto {
  if (archivo.size === 0) {
    return { ok: false, error: `"${archivo.name}" está vacío.` };
  }

  if (!TIPOS_FOTO.includes(archivo.type as (typeof TIPOS_FOTO)[number])) {
    return {
      ok: false,
      error: `"${archivo.name}" no es una imagen. Aceptamos JPG, PNG y WEBP.`,
    };
  }

  if (archivo.size > PESO_MAXIMO_FOTO) {
    const mb = (archivo.size / 1024 / 1024).toFixed(1);
    return {
      ok: false,
      error: `"${archivo.name}" pesa ${mb} MB y el máximo es 15 MB.`,
    };
  }

  return { ok: true };
}

/**
 * Ruta de la foto dentro de la cubeta.
 *
 * La primera carpeta es el identificador del aviso, y así lo exige la
 * política de storage. El original va en una subcarpeta que la política
 * no deja borrar: se conserva mientras exista el aviso.
 */
export function rutaDeFoto(avisoId: string, marca: number, original = false): string {
  return original ? `${avisoId}/original/${marca}.bin` : `${avisoId}/${marca}.webp`;
}
