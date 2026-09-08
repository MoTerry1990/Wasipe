import { SITIO } from '@/config/sitio';
import { dinero } from '@/lib/formato';
import { OPERACION, TIPO_INMUEBLE } from '@/lib/etiquetas';
import { enlaceDeAviso } from '@/lib/avisos/enlace';
import type { Mensaje } from '@/lib/notificaciones/proveedor';
import type { Moneda, Operacion, TipoInmueble } from '@/types/base-datos';

/**
 * El correo de una alerta.
 *
 * En texto plano y no en HTML, a propósito: lo que se manda son cuatro
 * líneas y unos enlaces, y un correo de texto llega igual a cualquier
 * cliente, no cae en spam por una plantilla mal cerrada y se lee en un
 * celular viejo.
 *
 * Tres cosas que tiene que traer sí o sí:
 *
 *  · qué se buscó, porque alguien puede tener cinco alertas y no
 *    acordarse de cuál es esta;
 *  · el precio de cada aviso, que es lo que hace que valga la pena
 *    abrirlo; y
 *  · **cómo dejar de recibirlo**. Un correo automático sin salida es
 *    spam, aunque lo haya pedido quien lo recibe.
 */

export type AvisoDeAlerta = {
  id: string;
  code: string;
  title: string;
  district: string;
  operation: Operacion;
  property_type: TipoInmueble;
  currency: Moneda;
  price: number;
};

export function armarCorreo({
  nombreDeLaBusqueda,
  avisos,
  total,
  para,
}: {
  nombreDeLaBusqueda: string;
  avisos: readonly AvisoDeAlerta[];
  /** Cuántos hay en total, que puede ser más de los que entran en el correo. */
  total: number;
  para: string;
}): Mensaje {
  const cuantos = total === 1 ? 'una propiedad nueva' : `${total} propiedades nuevas`;

  const lineas: string[] = [
    `Encontramos ${cuantos} para tu búsqueda «${nombreDeLaBusqueda}».`,
    '',
  ];

  for (const aviso of avisos) {
    lineas.push(
      `· ${aviso.title}`,
      `  ${TIPO_INMUEBLE[aviso.property_type]} en ${aviso.district} · ${OPERACION[aviso.operation]}`,
      `  ${dinero(aviso.price, aviso.currency)}`,
      `  ${SITIO.url}${enlaceDeAviso(aviso)}`,
      '',
    );
  }

  if (total > avisos.length) {
    const resto = total - avisos.length;
    lineas.push(
      resto === 1
        ? 'Hay una más que no entró en este correo.'
        : `Hay ${resto} más que no entraron en este correo.`,
      '',
    );
  }

  lineas.push(
    '---',
    'Recibes esto porque guardaste esta búsqueda con avisos activados.',
    `Para dejar de recibirlos, entra a ${SITIO.url}/panel/alertas y desactívala.`,
  );

  return {
    para,
    asunto:
      total === 1
        ? `Una propiedad nueva para «${nombreDeLaBusqueda}»`
        : `${total} propiedades nuevas para «${nombreDeLaBusqueda}»`,
    cuerpo: lineas.join('\n'),
  };
}
