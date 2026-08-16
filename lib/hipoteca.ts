/**
 * Estimación de cuota hipotecaria.
 *
 * Es una referencia para tener una idea, no una oferta ni una
 * preaprobación. La cuota real la fija el banco después de mirar
 * ingresos, historial en la central de riesgo y seguros, y siempre sale
 * distinta de esta cuenta.
 *
 * Los valores por defecto son los del mercado peruano al momento de
 * escribir esto: 20% de cuota inicial (lo mínimo que pide la banca para
 * primera vivienda), 20 años de plazo y una tasa efectiva anual del 9%.
 */

export const CUOTA_INICIAL_MINIMA = 0.1;
export const CUOTA_INICIAL_POR_DEFECTO = 0.2;
export const PLAZO_POR_DEFECTO = 20;
export const TASA_POR_DEFECTO = 9;

export const AVISO_HIPOTECA =
  'Cálculo referencial. No es una oferta de crédito ni una preaprobación: la cuota real la define el banco según tus ingresos, tu historial crediticio y los seguros que correspondan.';

export type Hipoteca = {
  /** Lo que se financia. */
  monto: number;
  cuotaInicial: number;
  /** Cuota mensual estimada. */
  cuota: number;
  /** Lo que se termina pagando en total. */
  total: number;
  /** Cuánto de eso son intereses. */
  intereses: number;
};

/**
 * Cuota de un crédito francés (cuota fija).
 *
 *     cuota = P · i / (1 − (1 + i)^−n)
 *
 * En el Perú los bancos publican la Tasa Efectiva Anual, que ya incluye
 * la capitalización. Para pasarla a mensual no se divide entre 12 —eso
 * daría una cuota más baja que la real— sino que se saca la raíz
 * doceava: (1 + TEA)^(1/12) − 1.
 */
export function calcularHipoteca({
  precio,
  porcentajeInicial = CUOTA_INICIAL_POR_DEFECTO,
  anios = PLAZO_POR_DEFECTO,
  tasaAnual = TASA_POR_DEFECTO,
}: {
  precio: number;
  porcentajeInicial?: number;
  anios?: number;
  tasaAnual?: number;
}): Hipoteca | null {
  if (!Number.isFinite(precio) || precio <= 0) return null;
  if (!Number.isFinite(anios) || anios <= 0) return null;

  // Se admite hasta el 100%: pagar todo al contado no es un error, pero
  // entonces no hay crédito que calcular y la función devuelve null.
  const inicial = Math.min(Math.max(porcentajeInicial, 0), 1);
  const cuotaInicial = Math.round(precio * inicial);
  const monto = precio - cuotaInicial;

  if (monto <= 0) return null;

  const meses = Math.round(anios * 12);
  const tea = Math.max(tasaAnual, 0) / 100;
  const mensual = Math.pow(1 + tea, 1 / 12) - 1;

  // Sin intereses la cuota es una división simple; la fórmula general
  // divide entre cero en ese caso.
  const cuota =
    mensual === 0 ? monto / meses : (monto * mensual) / (1 - Math.pow(1 + mensual, -meses));

  const total = cuota * meses;

  return {
    monto,
    cuotaInicial,
    cuota: Math.round(cuota),
    total: Math.round(total),
    intereses: Math.round(total - monto),
  };
}

/**
 * Cuánto habría que ganar para que el banco preste.
 *
 * La regla que usa la banca peruana es que la cuota no pase del 30% del
 * ingreso neto mensual del hogar.
 */
export function ingresoSugerido(cuota: number, proporcion = 0.3): number {
  return Math.round(cuota / proporcion);
}
