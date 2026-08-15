import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import * as q from './consultas.ts';
import * as s from './servicio.ts';
import * as pub from './publico.ts';
import { conSesion, conVerificado } from '../../lib/middleware.ts';
import { noEncontrado, sinPermiso } from '../../lib/errores.ts';
import { puede } from '../../lib/permisos.ts';
import { validar, uuid, textoOpcional } from '../../lib/validar.ts';

export const propiedades = new Hono();

const ipDe = (c: Context) =>
  c.req.header('x-nf-client-connection-ip') ??
  c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
  'desconocida';

const OPERACIONES = ['venta', 'alquiler', 'traspaso'] as const;
const TIPOS = ['departamento', 'casa', 'terreno', 'oficina', 'local', 'almacen', 'cochera'] as const;

async function mio(c: Context, accion: Parameters<typeof puede>[1] = 'aviso.editar') {
  const p = await q.porId(validar(uuid, c.req.param('id')));
  if (!p) throw noEncontrado('Ese aviso');
  if (!puede(c.get('usuario'), accion, p)) throw sinPermiso();
  return p;
}

/* ----------------------------- mis avisos ----------------------------- */

propiedades.get('/', conSesion(), async (c) => {
  const pagina = Math.max(1, Number(c.req.query('pagina')) || 1);
  const filas = await q.misAvisos(c.get('usuario').id, c.req.query('estado'), pagina);
  const total = Number(filas[0]?.total ?? 0);

  return c.json({
    resultados: filas.map(({ total: _t, ...r }) => ({
      ...r,
      dias_para_vencer: r.vence_en
        ? Math.ceil((new Date(r.vence_en).getTime() - Date.now()) / 86400000)
        : null,
    })),
    total,
    pagina,
    paginas: Math.max(1, Math.ceil(total / 24)),
    por_pagina: 24,
  });
});

/* ------------------------------- crear -------------------------------- */

propiedades.post('/', conSesion(), conVerificado(), async (c) => {
  const d = validar(
    z.object({
      operacion: z.enum(OPERACIONES),
      tipo: z.enum(TIPOS),
      ubicacion_id: uuid,
      origen: z.enum(['wizard', 'rapido']).default('wizard'),
    }),
    await c.req.json(),
  );

  const u = c.get('usuario');
  if (!puede(u, 'aviso.crear')) throw sinPermiso();

  const p = await s.crearBorrador(u.id, u.agencias?.[0]?.agencia_id ?? null, d);
  return c.json({ propiedad: p }, 201);
});

/* ------------------------------- editar ------------------------------- */

const esquemaEditar = z.object({
  titulo: z.string().trim().min(10).max(140).optional(),
  descripcion: textoOpcional(5000),
  ubicacion_id: uuid.optional(),
  direccion: textoOpcional(200),
  referencia: textoOpcional(200),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  ocultar_mapa: z.boolean().optional(),
  area_m2: z.number().positive().max(1_000_000).nullable().optional(),
  area_techada_m2: z.number().positive().nullable().optional(),
  dormitorios: z.number().int().min(0).max(30).nullable().optional(),
  banos: z.number().int().min(0).max(30).nullable().optional(),
  cocheras: z.number().int().min(0).max(30).nullable().optional(),
  piso: z.number().int().min(-5).max(120).nullable().optional(),
  antiguedad: z.number().int().min(0).max(200).nullable().optional(),
  estado_inmueble: z
    .enum(['estreno', 'buen-estado', 'a-refaccionar', 'en-construccion', 'en-planos'])
    .nullable().optional(),
  amoblado: z.enum(['si', 'no', 'semi']).nullable().optional(),
  precio: z.number().positive().max(999_999_999_99).nullable().optional(),
  moneda: z.enum(['USD', 'PEN']).optional(),
  mantenimiento: z.number().min(0).nullable().optional(),
  precio_negociable: z.boolean().optional(),
  operacion: z.enum(OPERACIONES).optional(),
  tipo: z.enum(TIPOS).optional(),
  caracteristicas: z.array(z.string().max(60)).max(40).optional(),
});

propiedades.patch('/:id', conSesion(), async (c) => {
  const p = await mio(c);
  const { caracteristicas, ...campos } = validar(esquemaEditar, await c.req.json());
  const actualizado = await s.editar(p, campos, caracteristicas);
  return c.json({ propiedad: actualizado, mensaje: 'Guardado.' });
});

/* ------------------------- ciclo de vida ------------------------------ */

propiedades.post('/:id/publicar', conSesion(), async (c) => {
  const p = await mio(c, 'aviso.publicar');
  return c.json(await s.publicar(p, c.get('usuario').email_verificado));
});

propiedades.post('/:id/pausar', conSesion(), async (c) => {
  const p = await mio(c);
  await s.pausar(p);
  return c.json({ ok: true, estado: 'pausado', mensaje: 'Aviso pausado.' });
});

propiedades.post('/:id/reactivar', conSesion(), async (c) => {
  const p = await mio(c);
  await s.reactivar(p);
  return c.json({ ok: true, estado: 'activo', mensaje: 'Aviso publicado de nuevo.' });
});

propiedades.post('/:id/renovar', conSesion(), async (c) => {
  const p = await mio(c);
  return c.json(await s.renovar(p));
});

propiedades.post('/:id/cerrar', conSesion(), async (c) => {
  const p = await mio(c);
  const d = validar(
    z.object({
      motivo: z.enum(['vendida', 'alquilada', 'desistio', 'otro']),
      precio_final: z.number().positive().nullable().optional(),
      moneda: z.enum(['USD', 'PEN']).nullable().optional(),
    }),
    await c.req.json(),
  );
  return c.json(await s.cerrar(p, d));
});

propiedades.post('/:id/duplicar', conSesion(), async (c) => {
  const p = await mio(c, 'aviso.crear');
  const d = validar(
    z.object({
      piso: z.number().int().min(-5).max(120).nullable().optional(),
      precio: z.number().positive().nullable().optional(),
      titulo: z.string().trim().min(10).max(140).nullable().optional(),
    }),
    await c.req.json().catch(() => ({})),
  );
  return c.json(await s.duplicar(p, d), 201);
});

propiedades.delete('/:id', conSesion(), async (c) => {
  const p = await mio(c, 'aviso.eliminar');
  return c.json(await s.eliminar(p));
});

/* --------------------------- estado del alta -------------------------- */

propiedades.get('/:id/completitud', conSesion(), async (c) => {
  const p = await mio(c);
  const faltantes = await s.faltantesPara(p);
  return c.json({
    completitud: await s.recalcularCompletitud(p),
    listo_para_publicar: faltantes.length === 0,
    faltantes,
  });
});

/* --------------------------- ficha pública ---------------------------- */

/**
 * Público. Acepta slug o UUID. Es la página que trae el tráfico orgánico:
 * 60–80% de las visitas de un portal inmobiliario entran por acá.
 *
 * Va al final para que las rutas concretas (/:id/publicar, /:id/completitud)
 * se resuelvan antes.
 */
propiedades.get('/:slug', async (c) => {
  const valor = c.req.param('slug');
  let p = await q.porSlugOId(valor);

  // Slug viejo: 301 al vigente, para no perder lo ya indexado en Google.
  if (!p) {
    const hist = await q.slugHistorico(valor);
    if (hist) {
      const actual = await q.porId(hist.propiedad_id);
      if (actual) {
        return c.json(
          { redirigir_a: `/propiedad/${actual.slug}`, codigo: 'SLUG_MOVIDO' },
          301,
          { Location: `/api/v1/propiedades/${actual.slug}` },
        );
      }
    }
    throw noEncontrado('Ese aviso');
  }

  // Solo los activos son públicos; el dueño y el staff ven el suyo igual.
  const u = c.get('usuario');
  const puedeVerlo =
    p.estado === 'activo' ||
    (u && (puede(u, 'aviso.editar', p) || u.rol === 'admin' || u.rol === 'moderador'));
  if (!puedeVerlo) throw noEncontrado('Ese aviso');

  if (p.estado === 'activo') {
    await pub.registrarVista(p.id, ipDe(c));
  }

  const [propiedad, parecidos] = await Promise.all([
    pub.fichaPublica(p),
    pub.similares(p),
  ]);

  c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
  return c.json({ propiedad, similares: parecidos });
});

