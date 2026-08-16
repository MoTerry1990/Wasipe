import { dinero, metros, numero, porMetro } from '@/lib/formato';
import { ESTADO_VERIFICACION, nombreDeCaracteristica } from '@/lib/etiquetas';
import type { Moneda, Operacion, TipoInmueble, EstadoVerificacion } from '@/types/base-datos';

/**
 * Comparación de hasta cuatro avisos.
 *
 * Todo lo que se muestra sale de `comparar_avisos()`, que lee la base sin
 * intermediarios. Acá no se calcula ningún valor nuevo: se ordena, se
 * marca cuál es el mejor de cada fila y se explica por qué.
 *
 * La recomendación tampoco la escribe un modelo. Es una suma ponderada de
 * los mismos números, con las prioridades que la persona eligió. Un
 * modelo que "recomienda" una propiedad está opinando sobre la decisión
 * de compra más grande de la vida de alguien, con datos que no verificó;
 * una cuenta que se puede mostrar entera, no.
 */

export const MAXIMO_A_COMPARAR = 4;

// ---------------------------------------------------------------------
// La fila que devuelve la base
// ---------------------------------------------------------------------

export type AvisoComparado = {
  id: string;
  code: string;
  title: string;
  district: string;
  province: string;
  operation: Operacion;
  property_type: TipoInmueble;
  currency: Moneda;
  price: number;
  price_usd: number | null;
  maintenance: number | null;
  total_area: number;
  built_area: number | null;
  price_per_m2: number | null;
  price_usd_per_m2: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking: number | null;
  age_years: number | null;
  verification_status: EstadoVerificacion;
  cover_url: string | null;
  features: string[];
  district_avg_usd_per_m2: number | null;
  district_listings: number | null;
};

// ---------------------------------------------------------------------
// Las filas de la tabla
// ---------------------------------------------------------------------

export type FilaComparativa = {
  clave: string;
  etiqueta: string;
  /** Uno por aviso, en el mismo orden. */
  valores: string[];
  /** Índices de los avisos que ganan esta fila. Vacío = no se compara. */
  mejores: number[];
  /** Aclaración cuando el número necesita contexto. */
  nota?: string;
};

const sinDato = '—';

/** Los índices con el valor más bajo (o más alto) entre los que tienen dato. */
function mejoresPor(
  avisos: readonly AvisoComparado[],
  valor: (a: AvisoComparado) => number | null | undefined,
  direccion: 'menor' | 'mayor',
): number[] {
  const conDato = avisos
    .map((a, i) => ({ i, v: valor(a) }))
    .filter((x): x is { i: number; v: number } => typeof x.v === 'number' && x.v > 0);

  if (conDato.length < 2) return [];

  const objetivo =
    direccion === 'menor'
      ? Math.min(...conDato.map((x) => x.v))
      : Math.max(...conDato.map((x) => x.v));

  return conDato.filter((x) => x.v === objetivo).map((x) => x.i);
}

/**
 * Arma la tabla.
 *
 * Los precios se comparan en dólares (`price_usd`), no en la moneda de
 * cada aviso: uno en soles y otro en dólares no se comparan por el número
 * crudo. Es la misma normalización que usa toda la búsqueda del portal.
 */
export function armarComparacion(avisos: readonly AvisoComparado[]): FilaComparativa[] {
  if (avisos.length === 0) return [];

  const filas: FilaComparativa[] = [
    {
      clave: 'precio',
      etiqueta: 'Precio',
      valores: avisos.map((a) => dinero(a.price, a.currency)),
      mejores: mejoresPor(avisos, (a) => a.price_usd, 'menor'),
      nota: 'Se compara en dólares: un aviso en soles y otro en dólares no se comparan por el número crudo.',
    },
    {
      clave: 'area',
      etiqueta: 'Área total',
      valores: avisos.map((a) => metros(a.total_area)),
      mejores: mejoresPor(avisos, (a) => a.total_area, 'mayor'),
    },
    {
      clave: 'm2',
      etiqueta: 'Precio por m²',
      valores: avisos.map((a) =>
        a.price_per_m2 ? porMetro(a.price_per_m2, a.currency) : sinDato,
      ),
      mejores: mejoresPor(avisos, (a) => a.price_usd_per_m2, 'menor'),
      nota: 'El dato que más dice: dos avisos con el mismo precio pueden ser muy distintos por metro.',
    },
    {
      clave: 'mantenimiento',
      etiqueta: 'Mantenimiento',
      valores: avisos.map((a) =>
        a.maintenance ? `${dinero(a.maintenance, 'PEN')} mensuales` : sinDato,
      ),
      mejores: mejoresPor(avisos, (a) => a.maintenance, 'menor'),
    },
    {
      clave: 'dormitorios',
      etiqueta: 'Dormitorios',
      valores: avisos.map((a) => (a.bedrooms ? numero(a.bedrooms) : sinDato)),
      mejores: mejoresPor(avisos, (a) => a.bedrooms, 'mayor'),
    },
    {
      clave: 'banos',
      etiqueta: 'Baños',
      valores: avisos.map((a) => (a.bathrooms ? numero(a.bathrooms) : sinDato)),
      mejores: mejoresPor(avisos, (a) => a.bathrooms, 'mayor'),
    },
    {
      clave: 'cocheras',
      etiqueta: 'Cocheras',
      valores: avisos.map((a) => (a.parking ? numero(a.parking) : sinDato)),
      mejores: mejoresPor(avisos, (a) => a.parking, 'mayor'),
    },
    {
      clave: 'antiguedad',
      etiqueta: 'Antigüedad',
      valores: avisos.map((a) =>
        a.age_years === null
          ? sinDato
          : a.age_years === 0
            ? 'De estreno'
            : `${numero(a.age_years)} años`,
      ),
      // Menos años gana, y «de estreno» (0) también: por eso se suma 1
      // antes de comparar, para que el cero no quede fuera.
      mejores: mejoresPor(
        avisos,
        (a) => (a.age_years === null ? null : a.age_years + 1),
        'menor',
      ),
    },
    {
      clave: 'distrito',
      etiqueta: 'Promedio del distrito',
      valores: avisos.map((a) =>
        a.district_avg_usd_per_m2
          ? `${porMetro(a.district_avg_usd_per_m2, 'USD')} en ${a.district}`
          : `Sin referencia en ${a.district}`,
      ),
      // No se marca ganador: un distrito más caro no es peor, es otro.
      mejores: [],
      nota: 'Promedio de los avisos publicados en ese distrito. No es una tasación.',
    },
    {
      clave: 'contra-mercado',
      etiqueta: 'Contra el promedio',
      valores: avisos.map((a) => contraElPromedio(a)),
      mejores: mejoresPor(avisos, (a) => relacionConDistrito(a), 'menor'),
    },
    {
      clave: 'verificacion',
      etiqueta: 'Verificación',
      valores: avisos.map((a) => ESTADO_VERIFICACION[a.verification_status]),
      mejores: avisos
        .map((a, i) => (a.verification_status === 'verified' ? i : -1))
        .filter((i) => i >= 0),
    },
  ];

  // Características: solo las que alguno tiene. Una fila de "no · no · no"
  // ocupa espacio y no ayuda a decidir nada.
  const todas = [...new Set(avisos.flatMap((a) => a.features ?? []))].sort();
  for (const caracteristica of todas) {
    const tienen = avisos.map((a) => (a.features ?? []).includes(caracteristica));
    if (tienen.every((v) => !v)) continue;
    filas.push({
      clave: `car-${caracteristica}`,
      etiqueta: nombreDeCaracteristica(caracteristica),
      valores: tienen.map((v) => (v ? 'Sí' : sinDato)),
      mejores: tienen.map((v, i) => (v ? i : -1)).filter((i) => i >= 0),
    });
  }

  return filas;
}

/** Cuánto se aleja del promedio de su distrito. 1 = está en el promedio. */
export function relacionConDistrito(aviso: AvisoComparado): number | null {
  if (!aviso.price_usd_per_m2 || !aviso.district_avg_usd_per_m2) return null;
  return aviso.price_usd_per_m2 / aviso.district_avg_usd_per_m2;
}

export function contraElPromedio(aviso: AvisoComparado): string {
  const relacion = relacionConDistrito(aviso);
  if (relacion === null) return sinDato;

  const porcentaje = Math.round((relacion - 1) * 100);
  if (Math.abs(porcentaje) <= 3) return 'En el promedio';
  return porcentaje < 0
    ? `${Math.abs(porcentaje)}% debajo del promedio`
    : `${porcentaje}% encima del promedio`;
}

// ---------------------------------------------------------------------
// Prioridades
// ---------------------------------------------------------------------

export const PRIORIDADES = {
  precio: {
    etiqueta: 'Gastar lo menos posible',
    hecho: 'es el más barato de los que comparas',
  },
  metro: {
    etiqueta: 'Que el metro cuadrado rinda',
    hecho: 'tiene el precio por m² más bajo',
  },
  espacio: { etiqueta: 'Espacio', hecho: 'es el más grande' },
  dormitorios: { etiqueta: 'Dormitorios', hecho: 'tiene más dormitorios' },
  cochera: { etiqueta: 'Cochera', hecho: 'tiene más cocheras' },
  nuevo: { etiqueta: 'Que sea nuevo', hecho: 'es el más nuevo' },
  verificado: { etiqueta: 'Que esté verificado', hecho: 'está verificado por Wasipe' },
  mantenimiento: {
    etiqueta: 'Mantenimiento bajo',
    hecho: 'tiene el mantenimiento más bajo',
  },
} as const;

export type ClaveDePrioridad = keyof typeof PRIORIDADES;
export const CLAVES_DE_PRIORIDAD = Object.keys(PRIORIDADES) as ClaveDePrioridad[];

export function esPrioridad(valor: string): valor is ClaveDePrioridad {
  return Object.prototype.hasOwnProperty.call(PRIORIDADES, valor);
}

/** Cómo se puntúa cada prioridad. Devuelve null cuando no hay dato. */
const MEDIDAS: Record<
  ClaveDePrioridad,
  { valor: (a: AvisoComparado) => number | null; direccion: 'menor' | 'mayor' }
> = {
  precio: { valor: (a) => a.price_usd, direccion: 'menor' },
  metro: { valor: (a) => a.price_usd_per_m2, direccion: 'menor' },
  espacio: { valor: (a) => a.total_area, direccion: 'mayor' },
  dormitorios: { valor: (a) => a.bedrooms, direccion: 'mayor' },
  cochera: { valor: (a) => a.parking, direccion: 'mayor' },
  nuevo: { valor: (a) => (a.age_years === null ? null : a.age_years), direccion: 'menor' },
  verificado: {
    valor: (a) => (a.verification_status === 'verified' ? 1 : 0),
    direccion: 'mayor',
  },
  mantenimiento: { valor: (a) => a.maintenance ?? 0, direccion: 'menor' },
};

// ---------------------------------------------------------------------
// La recomendación
// ---------------------------------------------------------------------

export type Recomendacion = {
  /** Índice del aviso recomendado, o null si no alcanza para decidir. */
  ganador: number | null;
  /** Cuánto sacó cada uno, de 0 a 1. */
  puntajes: number[];
  /**
   * Hechos verificables, sacados de la base. Cada uno se puede contrastar
   * con la tabla de arriba.
   */
  hechos: string[];
  /** Lo que la comparación NO puede decir. Va siempre. */
  advertencias: string[];
};

/**
 * Puntúa cada aviso contra las prioridades elegidas.
 *
 * Cada prioridad reparte de 0 a 1 según dónde cae el aviso entre el mejor
 * y el peor de los comparados. Es una escala relativa a propósito: no
 * existe un «buen precio» absoluto, existe el más barato de estos cuatro.
 *
 * Sin prioridades elegidas no hay recomendación. Elegir por la persona
 * cuál es su prioridad sería exactamente la clase de opinión que este
 * archivo evita.
 */
export function recomendar(
  avisos: readonly AvisoComparado[],
  prioridades: readonly ClaveDePrioridad[],
): Recomendacion {
  const advertencias = [
    'Esta comparación usa solo lo que dice cada aviso. No reemplaza una visita ni una tasación.',
    'No se comparan la calidad de la construcción, el estado real, la seguridad de la zona ni los gastos que no estén declarados.',
  ];

  if (avisos.length < 2 || prioridades.length === 0) {
    return { ganador: null, puntajes: avisos.map(() => 0), hechos: [], advertencias };
  }

  const puntajes = avisos.map(() => 0);
  const hechos: string[] = [];

  for (const prioridad of prioridades) {
    const medida = MEDIDAS[prioridad];
    const valores = avisos.map(medida.valor);
    const conDato = valores.filter((v): v is number => typeof v === 'number');
    if (conDato.length < 2) continue;

    const min = Math.min(...conDato);
    const max = Math.max(...conDato);
    const rango = max - min;

    valores.forEach((valor, i) => {
      if (typeof valor !== 'number') return;
      // Todos iguales: nadie gana ni pierde por esta prioridad.
      const normalizado = rango === 0 ? 0.5 : (valor - min) / rango;
      puntajes[i]! += medida.direccion === 'menor' ? 1 - normalizado : normalizado;
    });

    const objetivo = medida.direccion === 'menor' ? min : max;
    const lider = valores.findIndex((v) => v === objetivo);
    if (lider >= 0 && rango > 0) {
      hechos.push(`${avisos[lider]!.code} ${PRIORIDADES[prioridad].hecho}.`);
    }
  }

  const total = Math.max(...puntajes);
  const normalizados = puntajes.map((p) => (prioridades.length ? p / prioridades.length : 0));

  // Empate: no se inventa un desempate. Decir «cualquiera de los dos» es
  // más útil que elegir uno por el orden en que se cargaron.
  const empatados = puntajes.filter((p) => p === total).length;
  const ganador = total > 0 && empatados === 1 ? puntajes.indexOf(total) : null;

  return { ganador, puntajes: normalizados, hechos, advertencias };
}

/** El texto que acompaña a la recomendación. Separa el hecho de la lectura. */
export const AVISO_DE_RECOMENDACION =
  'La recomendación es una cuenta con los datos de los avisos y las prioridades que elegiste, no una opinión sobre el inmueble. Los hechos de abajo se pueden contrastar uno por uno con la tabla.';

/**
 * Lo que nunca entra en una recomendación.
 *
 * Se repite acá, además de en la búsqueda, porque una recomendación es
 * donde más fácil se cuela: basta con una frase sobre «el tipo de gente
 * del barrio» para que el producto empiece a hacer algo que no debe.
 */
export const NUNCA_EN_UNA_RECOMENDACION = [
  'Quién vive en el edificio o en el distrito.',
  'La nacionalidad, el origen, la raza o la religión de los vecinos.',
  'Si la zona es «segura», «tranquila» o «familiar».',
  'Si el inmueble conviene «para una familia», «para solteros» o «para adultos mayores».',
];
