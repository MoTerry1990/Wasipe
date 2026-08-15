import { z } from 'zod';

/**
 * Filtros de búsqueda pública.
 *
 * Todo llega por query string, así que los números vienen como texto y hay
 * que convertirlos. Los slugs desconocidos NO se ignoran en silencio: se
 * devuelve 422 con la lista, porque una búsqueda que descarta filtros sin
 * avisar da resultados que el usuario no pidió.
 */

const lista = (v: unknown) =>
  typeof v === 'string'
    ? v.split(',').map((x) => x.trim()).filter(Boolean)
    : undefined;

const numero = (v: unknown) => {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export const ORDENES = [
  'relevancia', 'recientes', 'precio_asc', 'precio_desc', 'area_desc', 'm2_asc',
] as const;

export const esquemaBusqueda = z.object({
  q: z.string().trim().max(120).optional(),
  operacion: z.enum(['venta', 'alquiler', 'traspaso']).optional(),
  tipo: z.preprocess(lista, z.array(z.string().max(30)).max(8).optional()),
  ubicaciones: z.preprocess(lista, z.array(z.string().max(80)).max(20).optional()),
  distrito: z.string().trim().max(80).optional(), // compatibilidad con el front viejo
  precio_min: z.preprocess(numero, z.number().min(0).optional()),
  precio_max: z.preprocess(numero, z.number().min(0).optional()),
  moneda_vista: z.enum(['USD', 'PEN']).default('USD'),
  area_min: z.preprocess(numero, z.number().min(0).optional()),
  area_max: z.preprocess(numero, z.number().min(0).optional()),
  dormitorios_min: z.preprocess(numero, z.number().int().min(0).max(30).optional()),
  dormitorios_max: z.preprocess(numero, z.number().int().min(0).max(30).optional()),
  banos_min: z.preprocess(numero, z.number().int().min(0).max(30).optional()),
  cocheras_min: z.preprocess(numero, z.number().int().min(0).max(30).optional()),
  antiguedad_max: z.preprocess(numero, z.number().int().min(0).max(200).optional()),
  caracteristicas: z.preprocess(lista, z.array(z.string().max(60)).max(20).optional()),
  estado_inmueble: z.string().max(30).optional(),
  amoblado: z.enum(['si', 'no', 'semi']).optional(),
  // El filtro que la competencia no tiene: dueño directo vs intermediario.
  publica: z.enum(['dueno', 'agente', 'inmobiliaria']).optional(),
  solo_verificados: z.preprocess((v) => v === 'true' || v === true, z.boolean().default(false)),
  con_precio: z.preprocess(
    (v) => (v === undefined ? true : v === 'true' || v === true),
    z.boolean().default(true),
  ),
  orden: z.enum(ORDENES).default('relevancia'),
  pagina: z.preprocess(numero, z.number().int().min(1).max(200).default(1)),
});

export type Busqueda = z.infer<typeof esquemaBusqueda>;

export const POR_PAGINA = 24;

/** Distritos pedidos, juntando `ubicaciones` y el viejo `distrito`. */
export function slugsPedidos(f: Busqueda): string[] {
  const todos = [...(f.ubicaciones ?? [])];
  if (f.distrito) todos.push(f.distrito);
  return [...new Set(todos.map(normalizar))].filter(Boolean);
}

/** "Santiago de Surco" → "santiago-de-surco". Acepta nombre o slug. */
export function normalizar(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
