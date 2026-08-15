import type { MetadataRoute } from 'next';
import { SITIO } from '@/config/sitio';

/** Resuelve KNOWN_ISSUES P-10: el sitio anterior devolvía 404 en /robots.txt. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/panel', '/favoritos', '/ingresar'] }],
    sitemap: `${SITIO.url}/sitemap.xml`,
  };
}
