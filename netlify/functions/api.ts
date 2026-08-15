import { app } from '../../src/app.ts';

/**
 * Entrada de la función API.
 *
 * Netlify puede invocarla de dos formas:
 *
 *  a) por redirect clásico  →  /.netlify/functions/api/api/v1/salud
 *  b) por ruta directa      →  /api/v1/salud
 *
 * En (a) llega con el prefijo interno pegado adelante, y Hono —que tiene
 * basePath '/api/v1'— no lo reconocería. Así que lo quitamos antes.
 *
 * NO se exporta `config.path`: en un deploy manual las funciones van
 * pre-empaquetadas y minificadas, y Netlify no siempre puede leer ese
 * export por análisis estático. El enrutado se resuelve con redirects
 * en netlify.toml, que es lo que sí funciona en ambos casos.
 */
const PREFIJO = '/.netlify/functions/api';

export default async function handler(peticion: Request): Promise<Response> {
  const url = new URL(peticion.url);

  if (url.pathname.startsWith(PREFIJO)) {
    url.pathname = url.pathname.slice(PREFIJO.length) || '/';
    return app.fetch(new Request(url, peticion));
  }

  return app.fetch(peticion);
}
