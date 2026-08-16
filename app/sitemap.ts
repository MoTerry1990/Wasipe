import type { MetadataRoute } from 'next';
import { SITIO } from '@/config/sitio';
import { UBICACIONES } from '@/config/ubicaciones';
import {
  landingsConAvisos,
  avisosPublicados,
  inmobiliariasPublicas,
  distritosConIndice,
} from '@/lib/consultas/sitemap';

/**
 * El sitemap.
 *
 * Una sola regla, y de ella salen todas las decisiones de este archivo:
 * **acá solo entra una dirección canónica, pública, que responde 200 y
 * que tiene contenido detrás**.
 *
 * Por eso no está `/publicar` aunque sea una página importante —es un
 * formulario, no contenido—, ni ninguna landing con menos de tres avisos,
 * ni ninguna dirección con parámetros. Un sitemap no es la lista de todo
 * lo que existe: es lo que le pedimos a Google que gaste su tiempo en
 * rastrear, y ese tiempo es finito por dominio.
 *
 * Cuando la base no responde queda el esqueleto estático. Es corto, pero
 * cada línea es verdad, que es lo único que un sitemap tiene que ser.
 */

// Se regenera cada seis horas. Los avisos nuevos no necesitan estar en el
// sitemap en el minuto uno; lo que sí importa es no rehacer cinco mil
// filas en cada petición de un robot.
export const revalidate = 21600;

/** Lo que existe siempre, con base o sin ella. */
const FIJAS: { ruta: string; prioridad: number; frecuencia: 'daily' | 'weekly' | 'monthly' }[] =
  [
    { ruta: '', prioridad: 1, frecuencia: 'daily' },
    { ruta: '/comprar', prioridad: 0.9, frecuencia: 'daily' },
    { ruta: '/alquilar', prioridad: 0.9, frecuencia: 'daily' },
    { ruta: '/proyectos', prioridad: 0.7, frecuencia: 'weekly' },
    { ruta: '/precio-m2', prioridad: 0.8, frecuencia: 'weekly' },
    { ruta: '/busquedas', prioridad: 0.6, frecuencia: 'weekly' },
    { ruta: '/wasi-ai', prioridad: 0.6, frecuencia: 'monthly' },
  ];

const SLUG_DE_DISTRITO = new Map(UBICACIONES.map((u) => [u.nombre, u.slug]));

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const ahora = new Date();

  // En paralelo: son cuatro consultas independientes y encadenarlas
  // multiplicaría por cuatro lo que tarda en responder un robot.
  const [landings, avisos, inmobiliarias, distritos] = await Promise.all([
    landingsConAvisos(),
    avisosPublicados(),
    inmobiliariasPublicas(),
    distritosConIndice(),
  ]);

  const entradas: MetadataRoute.Sitemap = FIJAS.map(({ ruta, prioridad, frecuencia }) => ({
    url: `${SITIO.url}${ruta}`,
    lastModified: ahora,
    changeFrequency: frecuencia,
    priority: prioridad,
  }));

  for (const landing of landings) {
    entradas.push({
      url: `${SITIO.url}${landing.href}`,
      lastModified: ahora,
      changeFrequency: 'daily',
      // Las que llevan distrito valen más: son las que la gente escribe.
      priority: landing.distrito ? 0.8 : 0.7,
    });
  }

  for (const distrito of distritos) {
    const slug = SLUG_DE_DISTRITO.get(distrito);
    // Un distrito con índice pero sin slug conocido no tiene página. Se
    // omite en vez de inventar la dirección.
    if (!slug) continue;
    entradas.push({
      url: `${SITIO.url}/precio-m2/${slug}`,
      lastModified: ahora,
      changeFrequency: 'weekly',
      priority: 0.7,
    });
  }

  for (const aviso of avisos) {
    entradas.push({
      url: `${SITIO.url}${aviso.ruta}`,
      lastModified: new Date(aviso.actualizado),
      changeFrequency: 'weekly',
      priority: 0.6,
    });
  }

  for (const agencia of inmobiliarias) {
    entradas.push({
      url: `${SITIO.url}/inmobiliaria/${agencia.slug}`,
      lastModified: new Date(agencia.actualizado),
      changeFrequency: 'weekly',
      priority: 0.5,
    });
  }

  // Último cerrojo contra duplicados. No debería hacer falta —cada bloque
  // genera direcciones de una familia distinta— pero un sitemap con la
  // misma URL dos veces es un error que Search Console reporta y que
  // nadie mira hasta que se acumulan cien.
  const vistas = new Set<string>();
  return entradas.filter((entrada) => {
    if (vistas.has(entrada.url)) return false;
    vistas.add(entrada.url);
    return true;
  });
}
