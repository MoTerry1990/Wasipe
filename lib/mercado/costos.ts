import { calcularHipoteca, AVISO_HIPOTECA } from '@/lib/hipoteca';
import { MUESTRA_MINIMA, type EstadisticaDeMercado } from '@/lib/mercado/evaluacion';
import type { Moneda } from '@/types/base-datos';

/**
 * Cuánto cuesta de verdad, al mes.
 *
 * El precio de lista no es lo que se paga: hay cuota del crédito y hay
 * mantenimiento, y en un edificio con áreas comunes el mantenimiento
 * puede ser el 15% del desembolso mensual. Mostrar solo la cuota es la
 * forma más común de que alguien firme algo que no puede pagar.
 *
 * Todo lo de acá es aritmética explícita y referencial. La cuota real la
 * fija el banco; el mantenimiento real lo fija la junta de propietarios.
 */

/**
 * Costo mensual de comprar.
 *
 * `mantenimiento` viene del aviso y está en soles: así se cobra en el
 * Perú, aunque el departamento se venda en dólares. Por eso el total se
 * arma en la moneda del aviso y el mantenimiento se convierte, con el
 * tipo de cambio a la vista.
 */
export type CostoMensual = {
  moneda: Moneda;
  /** Cuota estimada del crédito. */
  cuota: number;
  /** Mantenimiento, ya convertido a la moneda del total. */
  mantenimiento: number;
  /** La suma. Es el número que la persona necesita. */
  total: number;
  /** El tipo de cambio usado, cuando hubo que convertir. */
  tipoDeCambio: number | null;
  aviso: string;
};

export function costoMensual({
  precio,
  moneda,
  mantenimiento,
  tipoDeCambio,
  porcentajeInicial,
  anios,
  tasaAnual,
}: {
  precio: number;
  moneda: Moneda;
  /** Mantenimiento mensual del aviso, en soles. */
  mantenimiento?: number | null;
  tipoDeCambio: number;
  porcentajeInicial?: number;
  anios?: number;
  tasaAnual?: number;
}): CostoMensual | null {
  const hipoteca = calcularHipoteca({ precio, porcentajeInicial, anios, tasaAnual });
  if (!hipoteca) return null;

  const enSoles = Number(mantenimiento) > 0 ? Number(mantenimiento) : 0;
  const convertido = moneda === 'PEN' ? enSoles : tipoDeCambio > 0 ? enSoles / tipoDeCambio : 0;

  return {
    moneda,
    cuota: hipoteca.cuota,
    mantenimiento: Math.round(convertido * 100) / 100,
    total: Math.round((hipoteca.cuota + convertido) * 100) / 100,
    tipoDeCambio: enSoles > 0 && moneda === 'USD' ? tipoDeCambio : null,
    aviso: AVISO_HIPOTECA,
  };
}

// ---------------------------------------------------------------------
// Rentabilidad bruta
// ---------------------------------------------------------------------

export type Rentabilidad = {
  /** Alquiler mensual estimado, en dólares. */
  alquilerEstimado: number;
  /** Rentabilidad bruta anual, en tanto por uno. */
  anual: number;
  muestra: number;
  frase: string;
  aviso: string;
};

/** El aviso de la rentabilidad. Bruta significa antes de todo lo demás. */
export const AVISO_RENTABILIDAD =
  'Rentabilidad BRUTA: no descuenta mantenimiento, impuesto predial, arbitrios, seguros, comisión de corretaje, ni los meses en que el inmueble esté vacío. La rentabilidad neta siempre es menor.';

/**
 * Rentabilidad bruta anual de comprar para alquilar.
 *
 *     alquiler estimado = mediana de alquiler por m² del distrito × área
 *     rentabilidad      = alquiler × 12 / precio
 *
 * Devuelve null cuando la muestra de alquileres del distrito no alcanza.
 * Publicar una rentabilidad calculada con dos alquileres sería exactamente
 * la precisión falsa que este sprint evita: es un número con el que
 * alguien decide invertir los ahorros de veinte años.
 */
export function rentabilidadBruta({
  precioUsd,
  areaTotal,
  alquileres,
}: {
  precioUsd: number | null | undefined;
  areaTotal: number;
  /** El agregado de ALQUILER del mismo distrito y tipo. */
  alquileres: EstadisticaDeMercado | null | undefined;
}): Rentabilidad | null {
  if (!precioUsd || precioUsd <= 0 || !areaTotal || areaTotal <= 0) return null;
  if (!alquileres?.sufficient || alquileres.listings < MUESTRA_MINIMA) return null;

  const porM2 = Number(alquileres.median_usd_per_m2);
  if (!Number.isFinite(porM2) || porM2 <= 0) return null;

  const alquilerEstimado = porM2 * areaTotal;
  const anual = (alquilerEstimado * 12) / precioUsd;

  // Una rentabilidad bruta de 25% anual no es una oportunidad: es un dato
  // mal calculado, casi siempre porque el aviso de alquiler estaba en la
  // moneda equivocada. No se publica.
  if (!Number.isFinite(anual) || anual <= 0 || anual > 0.25) return null;

  return {
    alquilerEstimado: Math.round(alquilerEstimado),
    anual,
    muestra: alquileres.listings,
    frase: `Con los alquileres publicados en ${alquileres.district} (${alquileres.listings} avisos), este inmueble rendiría alrededor de ${(anual * 100).toFixed(1)}% bruto al año.`,
    aviso: AVISO_RENTABILIDAD,
  };
}
