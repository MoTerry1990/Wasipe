import { paraSitemap } from '../../src/modulos/propiedades/publico.ts';
import { sql } from '../../src/db/cliente.ts';

const SITIO = process.env.URL_SITIO ?? 'https://wasipe.netlify.app';

const escapar = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Se enruta por redirect en netlify.toml, no por config.path (ver api.ts). */
export default async function handler(): Promise<Response> {
  const urls: { loc: string; lastmod?: string; prio: string; freq: string }[] = [
    { loc: '/', prio: '1.0', freq: 'daily' },
    { loc: '/buscar', prio: '0.9', freq: 'daily' },
    { loc: '/registro', prio: '0.5', freq: 'monthly' },
  ];

  try {
    const distritos = await sql<{ slug: string }>(
      `SELECT slug FROM ubicaciones WHERE activo ORDER BY destacado DESC, distrito`,
    );
    for (const d of distritos) {
      urls.push({ loc: `/buscar?distrito=${d.slug}`, prio: '0.7', freq: 'daily' });
    }

    const avisos = await paraSitemap();
    for (const a of avisos) {
      urls.push({
        loc: `/propiedad/${a.slug}`,
        lastmod: new Date(a.actualizado_en).toISOString().slice(0, 10),
        prio: '0.8',
        freq: 'weekly',
      });
    }
  } catch {
    // Sin base, al menos se sirven las páginas fijas.
  }

  const cuerpo =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url><loc>${escapar(SITIO + u.loc)}</loc>` +
          (u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : '') +
          `<changefreq>${u.freq}</changefreq>` +
          `<priority>${u.prio}</priority></url>`,
      )
      .join('\n') +
    `\n</urlset>\n`;

  return new Response(cuerpo, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
