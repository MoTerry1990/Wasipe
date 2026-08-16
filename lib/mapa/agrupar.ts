/**
 * Agrupación de marcadores en el mapa.
 *
 * Con cien departamentos en Miraflores, cien alfileres encima del mismo
 * par de cuadras no dicen nada: se tapan entre ellos y el mapa se vuelve
 * ilegible. Agruparlos por celda y mostrar el número es lo que lo hace
 * usable.
 *
 * Es una grilla, no un k-means. La grilla es estable —el mismo punto cae
 * siempre en la misma celda— y eso importa: con un método que dependa de
 * un sorteo, los grupos saltarían de lugar en cada carga y el mapa
 * parecería nervioso.
 */

export type PuntoDelMapa = {
  id: string;
  lat: number;
  lon: number;
};

export type Grupo<T extends PuntoDelMapa> = {
  /** Identificador estable: la celda que ocupa. */
  id: string;
  lat: number;
  lon: number;
  puntos: T[];
};

export type Limites = {
  norte: number;
  sur: number;
  este: number;
  oeste: number;
};

/**
 * Cuántos grados mide el lado de la celda en cada nivel de acercamiento.
 *
 * A 0.02° (≈ 2 km en Lima) se ven barrios; a 0.0005° (≈ 55 m) se ve casi
 * edificio por edificio. Los saltos son de a mitades para que acercar
 * una vez parta cada grupo en cuatro, que es lo que la vista espera.
 */
const LADOS = [0.32, 0.16, 0.08, 0.04, 0.02, 0.01, 0.005, 0.0025, 0.00125, 0.000625] as const;

export const ZOOM_MINIMO = 0;
export const ZOOM_MAXIMO = LADOS.length - 1;

export function ladoDeCelda(zoom: number): number {
  const nivel = Math.min(Math.max(Math.round(zoom), ZOOM_MINIMO), ZOOM_MAXIMO);
  return LADOS[nivel] ?? LADOS[LADOS.length - 1]!;
}

/**
 * Agrupa puntos en celdas cuadradas.
 *
 * El centro del grupo es el promedio de sus puntos y no el centro de la
 * celda: así el marcador cae sobre las propiedades reales y no en medio
 * del mar cuando la celda toca la costa.
 */
export function agrupar<T extends PuntoDelMapa>(
  puntos: readonly T[],
  zoom: number,
): Grupo<T>[] {
  const lado = ladoDeCelda(zoom);
  const celdas = new Map<string, T[]>();

  for (const punto of puntos) {
    if (!Number.isFinite(punto.lat) || !Number.isFinite(punto.lon)) continue;

    const fila = Math.floor(punto.lat / lado);
    const columna = Math.floor(punto.lon / lado);
    const clave = `${fila}:${columna}`;

    const celda = celdas.get(clave);
    if (celda) celda.push(punto);
    else celdas.set(clave, [punto]);
  }

  const grupos: Grupo<T>[] = [];

  for (const [clave, miembros] of celdas) {
    const suma = miembros.reduce(
      (acumulado, punto) => ({
        lat: acumulado.lat + punto.lat,
        lon: acumulado.lon + punto.lon,
      }),
      { lat: 0, lon: 0 },
    );

    grupos.push({
      id: clave,
      lat: suma.lat / miembros.length,
      lon: suma.lon / miembros.length,
      puntos: miembros,
    });
  }

  // Los grupos grandes se dibujan al final para que queden encima: un
  // marcador de "48 propiedades" tapado por uno de una sola es un error
  // que se nota enseguida.
  return grupos.sort((a, b) => a.puntos.length - b.puntos.length);
}

/** El rectángulo que contiene todos los puntos, con un margen. */
export function limitesDe(puntos: readonly PuntoDelMapa[], margen = 0.01): Limites | null {
  const validos = puntos.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (validos.length === 0) return null;

  let norte = -90;
  let sur = 90;
  let este = -180;
  let oeste = 180;

  for (const punto of validos) {
    norte = Math.max(norte, punto.lat);
    sur = Math.min(sur, punto.lat);
    este = Math.max(este, punto.lon);
    oeste = Math.min(oeste, punto.lon);
  }

  // Con un solo punto el rectángulo tendría lado cero y no se podría
  // proyectar: se le da un mínimo.
  const alto = Math.max(norte - sur, margen);
  const ancho = Math.max(este - oeste, margen);

  return {
    norte: norte + alto * 0.12,
    sur: sur - alto * 0.12,
    este: este + ancho * 0.12,
    oeste: oeste - ancho * 0.12,
  };
}

/**
 * Pasa una coordenada a una posición en porcentaje dentro del recuadro.
 *
 * Proyección plana. A escala de un distrito el error frente a una
 * proyección esférica es de centímetros, y a cambio no hace falta
 * ninguna biblioteca de cartografía.
 */
export function proyectar(
  punto: { lat: number; lon: number },
  limites: Limites,
): { x: number; y: number } {
  const ancho = limites.este - limites.oeste || 1;
  const alto = limites.norte - limites.sur || 1;

  return {
    x: ((punto.lon - limites.oeste) / ancho) * 100,
    // La latitud crece hacia el norte y la pantalla hacia abajo.
    y: ((limites.norte - punto.lat) / alto) * 100,
  };
}

/**
 * ¿Este aviso puede mostrarse en el mapa?
 *
 * Los avisos publicados como "solo distrito" no llevan punto: quien
 * publica pidió que no se supiera dónde queda, y ponerle un alfiler
 * aproximado igual sería contradecirlo.
 */
export function tienePuntoPublico(aviso: {
  lat: number | null;
  lon: number | null;
  address_privacy: string;
}): boolean {
  return aviso.lat !== null && aviso.lon !== null && aviso.address_privacy !== 'district_only';
}
