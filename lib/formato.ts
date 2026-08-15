import { SITIO } from '@/config/sitio';

/**
 * Formato peruano: moneda, números y fechas.
 *
 * Portado del sitio anterior, donde ya tenía 20 pruebas. `Intl` con es-PE
 * da bien los soles ("S/ 450,000") pero para dólares devuelve
 * "USD 120,000"; en el mercado peruano se escribe "US$ 120,000".
 */

export type Moneda = 'PEN' | 'USD';

const { local, zonaHoraria } = SITIO;

/** "S/ 450,000" · "US$ 120,000" */
export function dinero(monto: number, moneda: Moneda = 'USD'): string {
  const cifra = new Intl.NumberFormat(local, { maximumFractionDigits: 0 }).format(monto);
  return moneda === 'PEN' ? `S/ ${cifra}` : `US$ ${cifra}`;
}

/** Con decimales, para mantenimiento o montos exactos: "S/ 280.50" */
export function dineroExacto(monto: number, moneda: Moneda = 'PEN'): string {
  const cifra = new Intl.NumberFormat(local, { minimumFractionDigits: 2 }).format(monto);
  return moneda === 'PEN' ? `S/ ${cifra}` : `US$ ${cifra}`;
}

/** "US$ 1,750 por m²" */
export const porMetro = (monto: number, moneda: Moneda = 'USD') =>
  `${dinero(monto, moneda)} por m²`;

/** "S/ 2,500 mensuales" */
export const mensual = (monto: number, moneda: Moneda = 'PEN') =>
  `${dinero(monto, moneda)} mensuales`;

/** "2,285" */
export const numero = (n: number) => new Intl.NumberFormat(local).format(n);

/** "15 de agosto de 2026", en hora de Lima. */
export const fecha = (valor: string | Date) =>
  new Intl.DateTimeFormat(local, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: zonaHoraria,
  }).format(new Date(valor));

/** "15 ago. 2026" — en español la abreviatura del mes lleva punto. */
export const fechaCorta = (valor: string | Date) =>
  new Intl.DateTimeFormat(local, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: zonaHoraria,
  }).format(new Date(valor));

/** "hoy" · "ayer" · "hace 5 días" */
export const hace = (dias: number) =>
  dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`;

/** "92 m²" */
export const metros = (m2: number) => `${numero(m2)} m²`;

/**
 * "12% debajo del promedio de Miraflores"
 *
 * Es el diferenciador del producto: el precio por m² siempre visible y
 * comparado contra el índice del distrito.
 */
export function contraMercado(porcentaje: number, distrito: string): string {
  if (Math.abs(porcentaje) <= 3) return `En el promedio de ${distrito}`;
  return porcentaje < 0
    ? `${Math.abs(porcentaje)}% debajo del promedio de ${distrito}`
    : `${porcentaje}% encima del promedio de ${distrito}`;
}
