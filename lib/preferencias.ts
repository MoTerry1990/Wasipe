import 'server-only';

import { cookies } from 'next/headers';
import { leerMoneda } from '@/lib/moneda';
import type { Moneda } from '@/types/base-datos';

/**
 * Preferencias que viajan en una cookie.
 *
 * La moneda se guarda en cookie y no en localStorage a propósito: el
 * servidor tiene que saberla para pintar los precios ya convertidos en
 * el HTML. Si se leyera en el navegador, la página se dibujaría en
 * dólares y saltaría a soles un instante después — un parpadeo feo
 * justo en el número más importante de la pantalla.
 */

export const COOKIE_MONEDA = 'wasipe_moneda';

/** Un año: es una preferencia, no una sesión. */
export const DURACION_PREFERENCIA = 60 * 60 * 24 * 365;

export async function monedaPreferida(): Promise<Moneda> {
  const almacen = await cookies();
  return leerMoneda(almacen.get(COOKIE_MONEDA)?.value);
}

/**
 * Cuánto puede medir la nota de un favorito.
 *
 * Doscientos ochenta caracteres: lo que entra en un recordatorio de por
 * qué guardaste algo —«preguntar por el mantenimiento», «queda a tres
 * cuadras del colegio»— y no lo suficiente para escribir un contrato.
 * La base admite hasta 500 con un CHECK; este es más estrecho a
 * propósito, y es el que ve la persona. Si algún día se afloja acá, el
 * de la base sigue siendo el techo.
 */
export const LARGO_MAXIMO_DE_NOTA = 280;
