import { z } from 'zod';
import { TIPO_DESDE_SLUG, SLUG_DESDE_TIPO, RUTA_DESDE_OPERACION } from '@/lib/catalogo';
import { esMoneda } from '@/lib/moneda';
import type { Operacion, TipoInmueble } from '@/types/base-datos';

/**
 * Filtros de búsqueda: de la URL al objeto, y del objeto a la URL.
 *
 * La URL es la fuente de verdad. No hay estado de búsqueda escondido en
 * el navegador: lo que se ve es exactamente lo que dice la dirección, y
 * por eso una búsqueda se puede compartir por WhatsApp y quien la abre
 * ve lo mismo.
 *
 * Nada de lo que llega por la URL se confía. Un `?dorm=999999999` o un
 * `?precioMin=abc` no puede tumbar la página ni colarse a la consulta:
 * se descarta y la búsqueda sigue con el resto de los filtros.
 */

/** Cuántos resultados por página. */
export const POR_PAGINA = 24;

export const ORDENES = ['recientes', 'precio-asc', 'precio-desc', 'm2-asc', 'm2-desc'] as const;
export type Orden = (typeof ORDENES)[number];

export const ETIQUETA_ORDEN: Record<Orden, string> = {
  recientes: 'Más recientes',
  'precio-asc': 'Precio: de menor a mayor',
  'precio-desc': 'Precio: de mayor a menor',
  'm2-asc': 'Precio por m²: de menor a mayor',
  'm2-desc': 'Precio por m²: de mayor a menor',
};

export const VISTAS = ['lista', 'mapa'] as const;
export type Vista = (typeof VISTAS)[number];

/**
 * Un número que llega por la URL.
 *
 * Se recorta al rango en vez de rechazarse: quien escribe `?dorm=99`
 * quiere "muchos dormitorios", no un error. Lo que no es número
 * desaparece.
 */
const numero = (min: number, max: number) =>
  z.coerce
    .number()
    .catch(NaN)
    .transform((v) => (Number.isFinite(v) ? Math.min(Math.max(v, min), max) : undefined))
    .optional();

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || undefined)
    .optional()
    .catch(undefined);

const bandera = z
  .union([z.literal('1'), z.literal('true'), z.literal('si')])
  .transform(() => true)
  .optional()
  .catch(undefined);

const esquema = z.object({
  // Ubicación
  departamento: texto(60),
  provincia: texto(60),
  distrito: texto(80),

  // Clasificación
  tipo: z
    .string()
    .transform((v) => TIPO_DESDE_SLUG[v.trim().toLowerCase()])
    .optional()
    .catch(undefined),

  // Precio: siempre en la moneda que se declare, y se normaliza a dólares
  // antes de consultar. Sin eso, "hasta 200,000" mezcla soles con dólares.
  moneda: z
    .string()
    .transform((v) => (esMoneda(v) ? v : undefined))
    .optional()
    .catch(undefined),
  precioMin: numero(0, 100_000_000),
  precioMax: numero(0, 100_000_000),

  // Ambientes
  dorm: numero(0, 30),
  banos: numero(0, 30),
  cocheras: numero(0, 50),

  // Medidas
  areaMin: numero(0, 1_000_000),
  areaMax: numero(0, 1_000_000),
  techadaMin: numero(0, 1_000_000),
  techadaMax: numero(0, 1_000_000),

  // Condiciones
  antiguedadMax: numero(0, 200),
  amoblado: z.enum(['none', 'partial', 'full']).optional().catch(undefined),
  mascotas: bandera,

  // Sellos
  verificados: bandera,
  rebajados: bandera,
  nuevos: bandera,

  // Presentación
  orden: z.enum(ORDENES).optional().catch('recientes'),
  vista: z.enum(VISTAS).optional().catch('lista'),
  pagina: numero(1, 500),
});

export type Filtros = z.infer<typeof esquema> & { operacion: Operacion };

/**
 * Lee los filtros de la URL.
 *
 * `safeParse` no alcanza: con `.catch()` en cada campo, un valor
 * inválido se cae solo y los demás siguen vivos. Es lo que hace que un
 * enlace viejo o manipulado no rompa la página.
 */
export function leerFiltros(
  operacion: Operacion,
  params: Record<string, string | string[] | undefined>,
): Filtros {
  // Un parámetro repetido (?dorm=2&dorm=3) llega como arreglo: se queda
  // el primero en vez de reventar.
  const plano: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(params)) {
    const uno = Array.isArray(valor) ? valor[0] : valor;
    if (typeof uno === 'string' && uno !== '') plano[clave] = uno;
  }

  const leidos = esquema.safeParse(plano);
  const datos = leidos.success ? leidos.data : {};

  const filtros: Filtros = { ...datos, operacion };

  // Un rango al revés (mín 500,000 y máx 100,000) no devolvería nada
  // nunca. Se da vuelta en silencio: es lo que la persona quiso decir.
  ordenarRango(filtros, 'precioMin', 'precioMax');
  ordenarRango(filtros, 'areaMin', 'areaMax');
  ordenarRango(filtros, 'techadaMin', 'techadaMax');

  return filtros;
}

function ordenarRango<C extends keyof Filtros>(filtros: Filtros, min: C, max: C) {
  const a = filtros[min] as number | undefined;
  const b = filtros[max] as number | undefined;
  if (a !== undefined && b !== undefined && a > b) {
    (filtros[min] as number) = b;
    (filtros[max] as number) = a;
  }
}

/** Los filtros que no son de presentación: los que de verdad recortan resultados. */
const DE_BUSQUEDA = [
  'departamento',
  'provincia',
  'distrito',
  'tipo',
  'precioMin',
  'precioMax',
  'dorm',
  'banos',
  'cocheras',
  'areaMin',
  'areaMax',
  'techadaMin',
  'techadaMax',
  'antiguedadMax',
  'amoblado',
  'mascotas',
  'verificados',
  'rebajados',
  'nuevos',
] as const satisfies readonly (keyof Filtros)[];

/** ¿Hay algún filtro aplicado, más allá de la operación? */
export function hayFiltros(filtros: Filtros): boolean {
  return DE_BUSQUEDA.some((clave) => filtros[clave] !== undefined);
}

export function cantidadDeFiltros(filtros: Filtros): number {
  return DE_BUSQUEDA.filter((clave) => filtros[clave] !== undefined).length;
}

/**
 * Escribe los filtros de vuelta en una URL.
 *
 * Solo salen los que tienen valor y los que no son el valor por defecto:
 * `?orden=recientes&pagina=1` ensucia la dirección y le da a Google dos
 * páginas idénticas con URL distinta.
 */
export function urlDeFiltros(filtros: Filtros, cambios: Partial<Filtros> = {}): string {
  const combinados: Filtros = { ...filtros, ...cambios };
  const params = new URLSearchParams();

  const escribir = (clave: string, valor: unknown) => {
    if (valor === undefined || valor === null || valor === '') return;
    params.set(clave, valor === true ? '1' : String(valor));
  };

  escribir('departamento', combinados.departamento);
  escribir('provincia', combinados.provincia);
  escribir('distrito', combinados.distrito);
  escribir(
    'tipo',
    combinados.tipo ? SLUG_DESDE_TIPO[combinados.tipo as TipoInmueble] : undefined,
  );
  escribir('moneda', combinados.moneda);
  escribir('precioMin', combinados.precioMin);
  escribir('precioMax', combinados.precioMax);
  escribir('dorm', combinados.dorm);
  escribir('banos', combinados.banos);
  escribir('cocheras', combinados.cocheras);
  escribir('areaMin', combinados.areaMin);
  escribir('areaMax', combinados.areaMax);
  escribir('techadaMin', combinados.techadaMin);
  escribir('techadaMax', combinados.techadaMax);
  escribir('antiguedadMax', combinados.antiguedadMax);
  escribir('amoblado', combinados.amoblado);
  escribir('mascotas', combinados.mascotas);
  escribir('verificados', combinados.verificados);
  escribir('rebajados', combinados.rebajados);
  escribir('nuevos', combinados.nuevos);

  if (combinados.orden && combinados.orden !== 'recientes') escribir('orden', combinados.orden);
  if (combinados.vista && combinados.vista !== 'lista') escribir('vista', combinados.vista);
  if (combinados.pagina && combinados.pagina > 1) escribir('pagina', combinados.pagina);

  const ruta = RUTA_DESDE_OPERACION[combinados.operacion];
  const cadena = params.toString();
  return cadena ? `${ruta}?${cadena}` : ruta;
}

/** La misma búsqueda sin ningún filtro: el botón de "limpiar". */
export function urlSinFiltros(filtros: Filtros): string {
  return urlDeFiltros({
    operacion: filtros.operacion,
    vista: filtros.vista,
    moneda: filtros.moneda,
  });
}

/**
 * Título de la búsqueda, en castellano y armado con lo que se filtró.
 *
 * Es el `<h1>` y también el `<title>`: "Departamentos en alquiler en
 * Miraflores" es exactamente lo que la gente escribe en Google.
 */
export function tituloDeBusqueda(filtros: Filtros, plurales: Record<string, string>): string {
  const cosa = filtros.tipo ? (plurales[filtros.tipo] ?? 'Propiedades') : 'Propiedades';

  const operacion =
    filtros.operacion === 'sale'
      ? 'en venta'
      : filtros.operacion === 'rent'
        ? 'en alquiler'
        : 'en proyectos';

  const donde = filtros.distrito
    ? ` en ${filtros.distrito}`
    : filtros.provincia
      ? ` en ${filtros.provincia}`
      : filtros.departamento
        ? ` en ${filtros.departamento}`
        : '';

  return `${cosa} ${operacion}${donde}`;
}
