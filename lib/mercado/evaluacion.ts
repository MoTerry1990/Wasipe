import { dinero, numero, porMetro, fecha } from '@/lib/formato';
import type { Moneda } from '@/types/base-datos';

/**
 * Evaluación del precio de un aviso contra su distrito.
 *
 * Es el diferenciador del producto y, por lo mismo, el lugar donde más
 * fácil se pierde la confianza. Una cifra sin sustento vale menos que no
 * publicar nada, así que este archivo tiene tantas reglas para NO decir
 * algo como para decirlo.
 *
 * Todo lo que se calcula acá es aritmética sobre los agregados de
 * `market_stats`. No hay modelo, no hay estimación de valor de mercado y
 * no hay tasación: hay una comparación con la mediana del distrito, con
 * el tamaño de la muestra siempre a la vista.
 */

/** El aviso legal. Va en TODA pantalla que muestre una evaluación. */
export const AVISO_ESTIMACION_INFORMATIVA =
  'Esta es una estimación informativa y no reemplaza una tasación profesional.';

/** Debajo de esto no se publica una cifra. Es el mismo número que la base. */
export const MUESTRA_MINIMA = 5;

// ---------------------------------------------------------------------
// Las bandas
// ---------------------------------------------------------------------

export type ClaveDeBanda = 'oportunidad' | 'competitivo' | 'promedio' | 'elevado' | 'sin-datos';

type Banda = {
  etiqueta: string;
  /** Qué significa, sin jerga. */
  resumen: string;
  tono: 'verde' | 'maiz' | 'neutro' | 'fucsia';
};

export const BANDAS: Record<ClaveDeBanda, Banda> = {
  oportunidad: {
    etiqueta: 'Oportunidad',
    resumen: 'Bastante debajo de lo que se pide en el distrito por un inmueble parecido.',
    tono: 'verde',
  },
  competitivo: {
    etiqueta: 'Precio competitivo',
    resumen: 'Algo debajo de la mediana del distrito.',
    tono: 'verde',
  },
  promedio: {
    etiqueta: 'Precio promedio',
    resumen: 'En línea con lo que se pide en el distrito.',
    tono: 'neutro',
  },
  elevado: {
    etiqueta: 'Precio elevado',
    resumen: 'Encima de la mediana del distrito.',
    tono: 'maiz',
  },
  'sin-datos': {
    etiqueta: 'Pocos datos',
    resumen: 'Todavía no hay avisos suficientes en este distrito para comparar.',
    tono: 'neutro',
  },
};

/**
 * Los cortes.
 *
 * No son simétricos a propósito. En el mercado peruano los avisos se
 * publican con margen para negociar, así que estar 8% encima de la
 * mediana es normal y estar 15% debajo no lo es. Un corte simétrico
 * marcaría «elevado» a casi la mitad del mercado.
 */
export const CORTES = {
  oportunidad: -0.15,
  competitivo: -0.05,
  elevado: 0.1,
} as const;

// ---------------------------------------------------------------------
// La entrada
// ---------------------------------------------------------------------

/** Lo que devuelve `market_stats` para un distrito, operación y tipo. */
export type EstadisticaDeMercado = {
  district: string;
  operation: string;
  property_type: string | null;
  period: string;
  listings: number;
  avg_usd_per_m2: number | null;
  median_usd_per_m2: number | null;
  p25_usd_per_m2: number | null;
  p75_usd_per_m2: number | null;
  median_price_usd: number | null;
  median_area: number | null;
  outliers: number;
  sufficient: boolean;
  pen_per_usd: number;
  computed_at: string;
};

export type Evaluacion = {
  banda: ClaveDeBanda;
  /** Diferencia contra la mediana, en tanto por uno. null sin datos. */
  diferencia: number | null;
  /** La frase que se muestra. Nunca afirma más de lo que se sabe. */
  frase: string;
  /** De cuántos avisos sale la comparación. Va siempre a la vista. */
  muestra: number;
  /** Cuántos se dejaron fuera por atípicos. */
  atipicos: number;
  actualizado: string | null;
  /** El tipo de cambio con el que se normalizó, y cuándo. */
  tipoDeCambio: { valor: number; fecha: string } | null;
};

// ---------------------------------------------------------------------
// La cuenta
// ---------------------------------------------------------------------

/**
 * Evalúa el precio por m² de un aviso contra la mediana de su distrito.
 *
 * Devuelve `sin-datos` —y NINGUNA cifra— cuando la muestra no alcanza,
 * cuando falta la mediana o cuando el aviso no tiene precio por m². Es la
 * regla que más importa de todo el archivo: sin datos suficientes no se
 * produce una precisión falsa, se dice que no se sabe.
 */
export function evaluarPrecio(
  precioUsdPorM2: number | null | undefined,
  estadistica: EstadisticaDeMercado | null | undefined,
): Evaluacion {
  const vacia: Evaluacion = {
    banda: 'sin-datos',
    diferencia: null,
    frase: BANDAS['sin-datos'].resumen,
    muestra: estadistica?.listings ?? 0,
    atipicos: estadistica?.outliers ?? 0,
    actualizado: estadistica?.computed_at ?? null,
    tipoDeCambio: estadistica
      ? { valor: Number(estadistica.pen_per_usd), fecha: estadistica.computed_at }
      : null,
  };

  if (!estadistica || !estadistica.sufficient) return vacia;
  if (estadistica.listings < MUESTRA_MINIMA) return vacia;

  const mediana = Number(estadistica.median_usd_per_m2);
  if (!Number.isFinite(mediana) || mediana <= 0) return vacia;
  if (!precioUsdPorM2 || !Number.isFinite(precioUsdPorM2) || precioUsdPorM2 <= 0) return vacia;

  const diferencia = (precioUsdPorM2 - mediana) / mediana;

  const banda: ClaveDeBanda =
    diferencia <= CORTES.oportunidad
      ? 'oportunidad'
      : diferencia <= CORTES.competitivo
        ? 'competitivo'
        : diferencia <= CORTES.elevado
          ? 'promedio'
          : 'elevado';

  return {
    banda,
    diferencia,
    frase: frasePara(banda, diferencia, estadistica),
    muestra: estadistica.listings,
    atipicos: estadistica.outliers,
    actualizado: estadistica.computed_at,
    tipoDeCambio: { valor: Number(estadistica.pen_per_usd), fecha: estadistica.computed_at },
  };
}

/**
 * La frase.
 *
 * Siempre dice contra qué se compara y de cuántos avisos sale. Un
 * «Oportunidad» suelto no es información: es publicidad.
 */
function frasePara(
  banda: ClaveDeBanda,
  diferencia: number,
  estadistica: EstadisticaDeMercado,
): string {
  const puntos = Math.abs(Math.round(diferencia * 100));
  const referencia = `${porMetro(Number(estadistica.median_usd_per_m2), 'USD')} de mediana en ${estadistica.district}, con ${numero(estadistica.listings)} avisos`;

  if (banda === 'promedio') return `En línea con el distrito: ${referencia}.`;
  const direccion = diferencia < 0 ? 'debajo' : 'encima';
  return `${puntos}% ${direccion} de la mediana del distrito: ${referencia}.`;
}

/** Texto del tamaño de muestra, para poner al pie de cualquier cifra. */
export function pieDeMuestra(evaluacion: Evaluacion): string {
  const partes = [`Calculado con ${numero(evaluacion.muestra)} avisos publicados`];
  if (evaluacion.atipicos > 0) {
    partes.push(
      `${numero(evaluacion.atipicos)} ${evaluacion.atipicos === 1 ? 'quedó fuera' : 'quedaron fuera'} por estar muy lejos del resto`,
    );
  }
  if (evaluacion.actualizado) {
    partes.push(`actualizado el ${fecha(evaluacion.actualizado)}`);
  }
  if (evaluacion.tipoDeCambio) {
    partes.push(
      `tipo de cambio S/ ${evaluacion.tipoDeCambio.valor.toFixed(2)} por dólar al ${fecha(evaluacion.tipoDeCambio.fecha)}`,
    );
  }
  return `${partes.join(' · ')}.`;
}

// ---------------------------------------------------------------------
// Los períodos
// ---------------------------------------------------------------------

export const PERIODOS = {
  m3: 'Últimos 3 meses',
  m6: 'Últimos 6 meses',
  m12: 'Último año',
  todo: 'Todo el historial',
} as const;

export type ClaveDePeriodo = keyof typeof PERIODOS;
export const CLAVES_DE_PERIODO = Object.keys(PERIODOS) as ClaveDePeriodo[];

export function esPeriodo(valor: string): valor is ClaveDePeriodo {
  return Object.prototype.hasOwnProperty.call(PERIODOS, valor);
}

// ---------------------------------------------------------------------
// El historial de precios, listo para graficar
// ---------------------------------------------------------------------

export type PuntoDePrecio = {
  price: number;
  currency: Moneda;
  price_usd: number | null;
  changed_at: string;
};

export type Serie = {
  puntos: { fecha: string; valor: number; etiqueta: string }[];
  minimo: number;
  maximo: number;
  /** Variación entre el primero y el último, en tanto por uno. */
  variacion: number | null;
  resumen: string;
};

/**
 * Arma la serie del gráfico.
 *
 * En dólares, no en la moneda de cada punto: un aviso que pasó de soles a
 * dólares mostraría un salto absurdo si se grafica el número crudo. La
 * etiqueta sí conserva la moneda original, porque es lo que la persona
 * vio publicado ese día.
 */
export function armarSerie(historial: readonly PuntoDePrecio[]): Serie | null {
  const puntos = historial
    .filter((p) => Number(p.price_usd) > 0)
    .map((p) => ({
      fecha: p.changed_at,
      valor: Number(p.price_usd),
      etiqueta: dinero(Number(p.price), p.currency),
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  // Un solo punto no es una historia: es el precio de hoy, que ya está
  // arriba en la ficha. Graficarlo sugiere un movimiento que no hubo.
  if (puntos.length < 2) return null;

  const valores = puntos.map((p) => p.valor);
  const primero = valores[0]!;
  const ultimo = valores.at(-1)!;
  const variacion = primero > 0 ? (ultimo - primero) / primero : null;

  const cambios = puntos.length - 1;
  const resumen =
    variacion === null || Math.abs(variacion) < 0.005
      ? `${cambios} ${cambios === 1 ? 'cambio' : 'cambios'} de precio, sin variación neta.`
      : variacion < 0
        ? `Bajó ${Math.abs(Math.round(variacion * 100))}% desde que se publicó.`
        : `Subió ${Math.round(variacion * 100)}% desde que se publicó.`;

  return {
    puntos,
    minimo: Math.min(...valores),
    maximo: Math.max(...valores),
    variacion,
    resumen,
  };
}
