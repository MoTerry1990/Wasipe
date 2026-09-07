/**
 * De dónde salen las calles del mapa.
 *
 * **OpenFreeMap**, con teselas vectoriales servidas gratis y sin clave.
 * No hay token que configurar, ni cuenta que crear, ni tarjeta que dar, y
 * por eso no hay una variable de entorno más que se pueda olvidar en un
 * despliegue.
 *
 * Se eligió `positron` y no `liberty` ni `bright`: es el estilo más
 * apagado de los tres, y acá el fondo tiene que dejar leer los precios
 * que van encima. Un mapa vistoso con los alfileres perdidos adentro no
 * sirve para buscar casa. Además pesa la mitad que `liberty`.
 *
 * **La atribución es obligatoria y hay que ponerla a mano**: el estilo de
 * OpenFreeMap no la declara en sus fuentes, así que si nadie la agrega, el
 * mapa se sirve sin crédito a quien hizo los datos. Se pasa como
 * `customAttribution` al control de MapLibre.
 */

export const ESTILO_DE_TESELAS = 'https://tiles.openfreemap.org/styles/positron';

/**
 * Los tres créditos que corresponden, en el orden en que se deben.
 *
 * OpenStreetMap son los datos; OpenMapTiles, el esquema de las teselas;
 * OpenFreeMap, quien las sirve.
 */
export const ATRIBUCION = [
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>',
  '<a href="https://openmaptiles.org" target="_blank" rel="noopener">OpenMapTiles</a>',
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
].join(' · ');
