import { Hono } from 'hono';
import * as q from './consultas.ts';
import { esquemaBusqueda, slugsPedidos, POR_PAGINA } from './filtros.ts';
import { validar } from '../../lib/validar.ts';
import { ErrorHTTP } from '../../lib/errores.ts';
import { sql } from '../../db/cliente.ts';

export const busqueda = new Hono();

async function preparar(c: { req: { query: () => Record<string, string> } }) {
  const f = validar(esquemaBusqueda, c.req.query());

  if (f.precio_min !== undefined && f.precio_max !== undefined && f.precio_min > f.precio_max) {
    throw new ErrorHTTP(422, 'El precio mínimo no puede ser mayor que el máximo.', {
      codigo: 'RANGO_INVALIDO',
      campo: 'precio_min',
    });
  }

  const slugs = slugsPedidos(f);
  const { ids, desconocidos } = await q.resolverUbicaciones(slugs);

  // Un slug que no existe NO se ignora: si se ignorara, el usuario vería
  // resultados de todo el Perú creyendo que filtró por un distrito.
  if (desconocidos.length) {
    throw new ErrorHTTP(422, `No conocemos: ${desconocidos.join(', ')}`, {
      codigo: 'UBICACION_DESCONOCIDA',
      campo: 'ubicaciones',
      extra: { desconocidos },
    });
  }
  return { f, ids };
}

/* ------------------------------ búsqueda ------------------------------ */

busqueda.get('/', async (c) => {
  const { f, ids } = await preparar(c);
  const { filas, total } = await q.buscar(f, ids);

  const resultados = filas.map((r) => ({
    id: r.id,
    slug: r.slug,
    codigo: r.codigo,
    titulo: r.titulo,
    operacion: r.operacion,
    tipo: r.tipo,
    precio: r.precio ? Number(r.precio) : null,
    moneda: r.moneda,
    precio_ref_usd: r.precio_ref_usd ? Number(r.precio_ref_usd) : null,
    precio_m2:
      r.precio_ref_usd && r.area_m2
        ? Math.round(Number(r.precio_ref_usd) / Number(r.area_m2))
        : null,
    mantenimiento: r.mantenimiento ? Number(r.mantenimiento) : null,
    area_m2: r.area_m2 ? Number(r.area_m2) : null,
    dormitorios: r.dormitorios,
    banos: r.banos,
    cocheras: r.cocheras,
    caracteristicas: r.caracteristicas ?? [],
    distrito: r.distrito,
    provincia: r.provincia,
    ubicacion_slug: r.ubicacion_slug,
    portada: r.portada,
    fotos: r.fotos,
    vs_mercado: r.vs_mercado === null ? null : Number(r.vs_mercado),
    destacado: r.destacado_hasta ? new Date(String(r.destacado_hasta)) > new Date() : false,
    publica: r.publica_nombre,
    publica_rol: r.publica_rol,
    publica_verificado: r.publica_verificado,
    publicado_en: r.publicado_en,
    actualizado_hace_dias: r.actualizado_hace_dias,
  }));

  c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  return c.json({
    resultados,
    total,
    pagina: f.pagina,
    paginas: Math.max(1, Math.ceil(total / POR_PAGINA)),
    por_pagina: POR_PAGINA,
    orden: f.orden,
    resumen: total > 0 ? await q.resumen(f, ids) : null,
  });
});

/* ------------------------------- facetas ------------------------------ */

busqueda.get('/facetas', async (c) => {
  const { f, ids } = await preparar(c);
  c.header('Cache-Control', 'public, max-age=120');
  return c.json(await q.facetas(f, ids));
});

/* --------------------------- características -------------------------- */

busqueda.get('/caracteristicas', async (c) => {
  const filas = await sql<{ slug: string; nombre: string; grupo: string }>(
    `SELECT slug, nombre, grupo FROM caracteristicas WHERE activo ORDER BY grupo, orden`,
  );
  const grupos: Record<string, { slug: string; nombre: string }[]> = {};
  for (const f of filas) (grupos[f.grupo] ??= []).push({ slug: f.slug, nombre: f.nombre });

  c.header('Cache-Control', 'public, max-age=86400');
  return c.json({ grupos });
});
