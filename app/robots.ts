import type { MetadataRoute } from 'next';
import { ES_PRODUCCION, SITIO } from '@/config/sitio';

/**
 * robots.txt. Resuelve KNOWN_ISSUES P-10: el sitio anterior devolvía 404.
 *
 * Lo que se bloquea acá y lo que se marca `noindex` en los metadatos son
 * dos cosas distintas y hay que no confundirlas:
 *
 *  · `Disallow` impide **rastrear**. Se usa para lo privado y para lo que
 *    no aporta nada al índice. Ojo: una página bloqueada acá puede seguir
 *    apareciendo en resultados si alguien la enlaza, porque el robot
 *    nunca entra a leer el `noindex`.
 *  · `noindex` impide **indexar**, y para eso el robot tiene que poder
 *    entrar. Por eso las búsquedas con filtros NO se bloquean acá: se
 *    dejan rastrear para que se lea su `noindex` y para que los enlaces
 *    a las fichas se sigan.
 *
 * De ahí que la lista de abajo sea corta a propósito.
 */
export default function robots(): MetadataRoute.Robots {
  // Fuera de producción no se rastrea nada, y no se ofrece sitemap. Un
  // Preview indexado compite contra el sitio real por las mismas
  // búsquedas, y quitarlo del índice después cuesta semanas.
  if (!ES_PRODUCCION) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          // Privado: nada de esto tiene por qué ser rastreado.
          '/panel',
          '/bienvenida',
          '/ingresar',
          '/registrarse',
          '/recuperar',
          '/nueva-clave',
          '/auth',
          '/api',
          // La comparación es una selección personal: cada combinación de
          // cuatro avisos es una dirección distinta y ninguna es contenido.
          '/comparar',
          // Presentación pura. No cambian qué hay, solo cómo se ve, así
          // que rastrearlas es gastar presupuesto en la misma página.
          '/*?*vista=',
          '/*?*orden=',
          '/*?*pagina=',
        ],
      },
    ],
    sitemap: `${SITIO.url}/sitemap.xml`,
    host: SITIO.url,
  };
}
