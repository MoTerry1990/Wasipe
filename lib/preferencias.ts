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
