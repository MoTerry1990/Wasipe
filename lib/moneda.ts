import { dinero, porMetro } from '@/lib/formato';
import type { Moneda } from '@/types/base-datos';

/**
 * Preferencia de moneda.
 *
 * En el Perú se publica en soles y en dólares a la vez, y cada persona
 * piensa en una sola. Poder ver todo el listado en la moneda propia es
 * la diferencia entre comparar y hacer cuentas de cabeza.
 *
 * La conversión es solo para mostrar: el precio que escribió quien
 * publica no se toca nunca, y siempre se dice cuál es el original.
 */

export const MONEDA_POR_DEFECTO: Moneda = 'USD';

/** Tipo de cambio de respaldo, del orden del real. */
export const TIPO_DE_CAMBIO_POR_DEFECTO = 3.75;

export function esMoneda(valor: unknown): valor is Moneda {
  return valor === 'PEN' || valor === 'USD';
}

export function leerMoneda(valor: unknown): Moneda {
  return esMoneda(valor) ? valor : MONEDA_POR_DEFECTO;
}

type PrecioOriginal = {
  price: number;
  currency: Moneda;
  price_usd?: number | null;
};

/** Convierte un monto a la moneda pedida usando el tipo de cambio del día. */
export function convertir(
  monto: number,
  desde: Moneda,
  hacia: Moneda,
  tipoDeCambio = TIPO_DE_CAMBIO_POR_DEFECTO,
): number {
  if (desde === hacia) return monto;
  return hacia === 'PEN' ? monto * tipoDeCambio : monto / tipoDeCambio;
}

export type PrecioMostrado = {
  /** Lo que se ve grande: "S/ 730,275" */
  texto: string;
  /** Si se convirtió, el precio tal como lo publicaron: "Publicado en US$ 195,000" */
  original: string | null;
  /** true cuando el número mostrado es una conversión y no el precio real. */
  convertido: boolean;
};

/**
 * Precio de un aviso en la moneda que la persona eligió.
 *
 * Cuando hay conversión se devuelve también el precio original para
 * mostrarlo debajo. Ocultarlo sería engañoso: quien vende pide dólares,
 * y el sol convertido es una referencia, no lo que va a firmar.
 */
export function precioMostrado(
  propiedad: PrecioOriginal,
  preferida: Moneda,
  tipoDeCambio = TIPO_DE_CAMBIO_POR_DEFECTO,
): PrecioMostrado {
  if (propiedad.currency === preferida) {
    return {
      texto: dinero(propiedad.price, propiedad.currency),
      original: null,
      convertido: false,
    };
  }

  // Si la base ya calculó la referencia en dólares, se usa esa: es el
  // mismo número con el que se filtra y se ordena, así que la tarjeta y
  // el buscador nunca se contradicen.
  const enDolares =
    propiedad.price_usd ?? convertir(propiedad.price, propiedad.currency, 'USD', tipoDeCambio);

  const monto = preferida === 'USD' ? enDolares : enDolares * tipoDeCambio;

  return {
    texto: dinero(Math.round(monto), preferida),
    original: `Publicado en ${dinero(propiedad.price, propiedad.currency)}`,
    convertido: true,
  };
}

/** Precio por m² en la moneda elegida. */
export function porMetroMostrado(
  valorPorM2: number,
  monedaOriginal: Moneda,
  preferida: Moneda,
  tipoDeCambio = TIPO_DE_CAMBIO_POR_DEFECTO,
): string {
  const monto = convertir(valorPorM2, monedaOriginal, preferida, tipoDeCambio);
  return porMetro(Math.round(monto), preferida);
}
