import type { MetadataRoute } from 'next';
import { SITIO } from '@/config/sitio';

/**
 * Solo rutas que existen y son indexables. Las fichas de propiedad se
 * agregan en el Sprint 8, cuando haya avisos que listar.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const ahora = new Date();
  const rutas = [
    { ruta: '', prioridad: 1 },
    { ruta: '/comprar', prioridad: 0.9 },
    { ruta: '/alquilar', prioridad: 0.9 },
    { ruta: '/proyectos', prioridad: 0.6 },
    { ruta: '/precio-m2', prioridad: 0.8 },
    { ruta: '/wasi-ai', prioridad: 0.7 },
    { ruta: '/publicar', prioridad: 0.7 },
  ];

  return rutas.map(({ ruta, prioridad }) => ({
    url: `${SITIO.url}${ruta}`,
    lastModified: ahora,
    changeFrequency: 'daily' as const,
    priority: prioridad,
  }));
}
