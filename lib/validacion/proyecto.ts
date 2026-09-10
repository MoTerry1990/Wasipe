import { z } from 'zod';

/**
 * Lo que se acepta de un formulario de proyecto.
 *
 * Los mensajes van en español porque los lee quien publica, no quien
 * programa. Y los límites son los mismos que los `check` de la migración
 * a propósito: si acá pasara algo que la base rechaza, el error llegaría
 * como una falla de servidor en vez de como una corrección al lado del
 * campo.
 *
 * Lo que NO está acá es tan importante como lo que sí: `agency_id`,
 * `created_by`, `code`, `publication_status` y los contadores no se
 * aceptan del formulario. Salen de la sesión o los pone la base.
 */

const texto = (min: number, max: number, campo: string) =>
  z
    .string({ message: `Falta ${campo}` })
    .trim()
    .min(min, `${campo} necesita al menos ${min} caracteres`)
    .max(max, `${campo} no puede pasar de ${max} caracteres`);

/** Un número que llega como texto desde un `<input>`. */
const numero = (campo: string) =>
  z.coerce.number({ message: `${campo} tiene que ser un número` });

const entero = (campo: string, min: number, max: number) =>
  numero(campo)
    .int(`${campo} tiene que ser un número entero`)
    .min(min, `${campo} no puede ser menor que ${min}`)
    .max(max, `${campo} no puede pasar de ${max}`);

/**
 * Un campo que puede venir vacío.
 *
 * Es genérico y no `ZodTypeAny` a propósito: con `ZodTypeAny` el tipo
 * inferido del campo se vuelve `{}` y se pierde por completo —el
 * compilador deja de saber que un área es un número—. Eso salió a la luz
 * al escribir la acción, no acá.
 */
const opcional = <T extends z.ZodType>(esquema: T) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    esquema.optional(),
  ) as z.ZodType<z.infer<T> | undefined>;

export const ETAPAS = ['preventa', 'construccion', 'entrega_inmediata'] as const;

export const ETIQUETA_ETAPA: Record<(typeof ETAPAS)[number], string> = {
  preventa: 'En preventa',
  construccion: 'En construcción',
  entrega_inmediata: 'Entrega inmediata',
};

export const informacionDeProyecto = z.object({
  name: texto(3, 140, 'el nombre del proyecto'),
  description: opcional(z.string().trim().max(4000, 'La descripción no puede pasar de 4000 caracteres')),
  stage: z.enum(ETAPAS, { message: 'Elige en qué etapa está el proyecto' }),
  // Mes de entrega: se pide como mes y se guarda como el día 1.
  delivery_estimate: opcional(
    z
      .string()
      .regex(/^\d{4}-\d{2}$/, 'La fecha de entrega va como año y mes, por ejemplo 2027-03'),
  ),
  department: texto(2, 60, 'el departamento'),
  province: texto(2, 60, 'la provincia'),
  district: texto(2, 60, 'el distrito'),
  ubigeo: opcional(z.string().regex(/^[0-9]{6}$/, 'El ubigeo son seis dígitos')),
  address: opcional(z.string().trim().max(240, 'La dirección no puede pasar de 240 caracteres')),
});

export type InformacionDeProyecto = z.infer<typeof informacionDeProyecto>;

export const tipologia = z
  .object({
    name: texto(2, 80, 'el nombre de la tipología'),
    bedrooms: entero('Los dormitorios', 0, 10),
    bathrooms: entero('Los baños', 0, 10),
    parking: entero('Los estacionamientos', 0, 10),
    total_area: opcional(numero('El área total').positive('El área total tiene que ser mayor que cero')),
    built_area: opcional(numero('El área construida').positive('El área construida tiene que ser mayor que cero')),
    currency: z.enum(['PEN', 'USD'], { message: 'Elige la moneda' }),
    price_from: numero('El precio desde').positive('El precio desde tiene que ser mayor que cero'),
    price_to: numero('El precio hasta').positive('El precio hasta tiene que ser mayor que cero'),
    units_total: entero('Las unidades totales', 1, 2000),
    units_available: entero('Las unidades disponibles', 0, 2000),
    sort_order: entero('El orden', 0, 999).default(0),
  })
  // Las tres reglas cruzadas son las mismas que los `check` de la base.
  // Acá existen para que el error salga al lado del campo y no como una
  // falla del servidor.
  .refine((t) => t.price_to >= t.price_from, {
    message: 'El precio hasta no puede ser menor que el precio desde',
    path: ['price_to'],
  })
  .refine((t) => t.units_available <= t.units_total, {
    message: 'No puede haber más unidades disponibles que unidades totales',
    path: ['units_available'],
  })
  .refine((t) => !t.built_area || !t.total_area || t.built_area <= t.total_area, {
    message: 'El área construida no puede ser mayor que el área total',
    path: ['built_area'],
  });

export type Tipologia = z.infer<typeof tipologia>;

/** Un `slug` a partir del nombre, sin tildes ni símbolos. */
export function slugDe(nombre: string): string {
  return nombre
    .normalize('NFD')
    // El rango de diacríticos combinantes, escrito por código y no como
    // caracteres literales: pegados en el archivo son invisibles y
    // cualquier editor puede comérselos sin que nadie lo note.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
