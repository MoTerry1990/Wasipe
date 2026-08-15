import { Hono } from 'hono';
import * as q from './consultas.ts';
import { noEncontrado } from '../../lib/errores.ts';

export const ubicaciones = new Hono();

const CACHE_LARGO = 'public, max-age=86400, stale-while-revalidate=604800';
const CACHE_CORTO = 'public, max-age=300';

/** GET /ubicaciones/sugerir?q=jesus&limite=8 — autocompletado */
ubicaciones.get('/sugerir', async (c) => {
  const texto = (c.req.query('q') ?? '').trim();
  if (texto.length < 2) return c.json({ sugerencias: [] });

  const limite = Math.min(Math.max(Number(c.req.query('limite')) || 8, 1), 20);
  const sugerencias = await q.sugerir(texto.slice(0, 60), limite);

  c.header('Cache-Control', CACHE_CORTO);
  return c.json({ sugerencias });
});

/** GET /ubicaciones/destacadas — para el home */
ubicaciones.get('/destacadas', async (c) => {
  const destacadas = await q.destacadas(Number(c.req.query('limite')) || 8);
  c.header('Cache-Control', CACHE_CORTO);
  return c.json({ destacadas });
});

/** GET /ubicaciones — árbol completo */
ubicaciones.get('/', async (c) => {
  const arbol = await q.arbol();
  c.header('Cache-Control', CACHE_LARGO);
  return c.json({ departamentos: arbol });
});

/** GET /ubicaciones/:slug */
ubicaciones.get('/:slug', async (c) => {
  const u = await q.porSlug(c.req.param('slug'));
  if (!u) throw noEncontrado('Ese distrito');
  c.header('Cache-Control', CACHE_LARGO);
  return c.json({ ubicacion: u });
});
