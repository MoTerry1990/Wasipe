import { normalizar } from '@/config/ubicaciones';

/**
 * Punto público de un aviso.
 *
 * En el mapa nunca se muestra la dirección real: el punto se desplaza
 * unos 300 metros en una dirección que depende del propio aviso. Eso
 * alcanza para ubicar la zona y no alcanza para tocarle el timbre a
 * nadie.
 *
 * El desplazamiento es determinista —el mismo aviso da siempre el mismo
 * punto— y esa es la parte importante. Con un desplazamiento al azar en
 * cada carga, bastaría con recargar diez veces y promediar los puntos
 * para obtener la dirección exacta.
 */

/** Metros que se desplaza el punto. */
export const DESPLAZAMIENTO_M = 300;

/** Un grado de latitud son ~111.320 metros en cualquier lugar del mundo. */
const METROS_POR_GRADO = 111_320;

export type Punto = { lat: number; lon: number };

/**
 * Hash estable de una cadena.
 *
 * Es el algoritmo FNV-1a de 32 bits: chico, sin dependencias y con buena
 * dispersión. No es criptográfico y no necesita serlo — lo único que se
 * le pide es que el mismo texto dé siempre el mismo número.
 */
function hash(texto: string): number {
  let valor = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    valor ^= texto.charCodeAt(i);
    valor = Math.imul(valor, 16777619);
  }
  return valor >>> 0;
}

export function desplazarPunto(punto: Punto, semilla: string): Punto {
  const angulo = (hash(semilla) % 360) * (Math.PI / 180);

  const norte = (Math.cos(angulo) * DESPLAZAMIENTO_M) / METROS_POR_GRADO;
  // Los meridianos se juntan hacia los polos: a la latitud de Lima, un
  // grado de longitud mide bastante menos que uno de latitud.
  const este =
    (Math.sin(angulo) * DESPLAZAMIENTO_M) /
    (METROS_POR_GRADO * Math.cos((punto.lat * Math.PI) / 180));

  return {
    lat: Number((punto.lat + norte).toFixed(7)),
    lon: Number((punto.lon + este).toFixed(7)),
  };
}

/**
 * Centro aproximado de los distritos donde más se publica.
 *
 * Es un punto de partida hasta que haya geocodificación de verdad: con
 * la dirección escrita a mano no se puede saber la coordenada exacta, y
 * poner el centro del distrito es más honesto que inventar precisión.
 */
const CENTROS: Record<string, Punto> = {
  miraflores: { lat: -12.1211, lon: -77.0298 },
  'san-isidro': { lat: -12.0975, lon: -77.0387 },
  barranco: { lat: -12.1467, lon: -77.0219 },
  'santiago-de-surco': { lat: -12.1092, lon: -76.9853 },
  'san-borja': { lat: -12.1027, lon: -76.9986 },
  'la-molina': { lat: -12.0797, lon: -76.9447 },
  'jesus-maria': { lat: -12.0742, lon: -77.0489 },
  'magdalena-del-mar': { lat: -12.093, lon: -77.073 },
  'pueblo-libre': { lat: -12.0742, lon: -77.0631 },
  'san-miguel': { lat: -12.0776, lon: -77.0925 },
  lince: { lat: -12.0864, lon: -77.0364 },
  surquillo: { lat: -12.1119, lon: -77.0186 },
  chorrillos: { lat: -12.1683, lon: -77.0142 },
  'la-victoria': { lat: -12.0678, lon: -77.0164 },
  brena: { lat: -12.0603, lon: -77.05 },
  'cercado-de-lima': { lat: -12.0464, lon: -77.0428 },
  callao: { lat: -12.0508, lon: -77.1181 },
  cieneguilla: { lat: -12.0908, lon: -76.7826 },
  yanahuara: { lat: -16.3898, lon: -71.5537 },
  cusco: { lat: -13.5319, lon: -71.9675 },
  trujillo: { lat: -8.112, lon: -79.0288 },
  arequipa: { lat: -16.409, lon: -71.5375 },
  piura: { lat: -5.1945, lon: -80.6328 },
  chiclayo: { lat: -6.7714, lon: -79.8409 },
};

/** Plaza Mayor de Lima: el punto de caída cuando no se conoce el distrito. */
export const CENTRO_DE_LIMA: Punto = { lat: -12.0464, lon: -77.0428 };

export function centroDeDistrito(distrito: string): Punto {
  const clave = normalizar(distrito).replace(/\s+/g, '-');
  return CENTROS[clave] ?? CENTRO_DE_LIMA;
}
