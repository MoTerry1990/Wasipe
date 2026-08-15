import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { sql, una } from '../../db/cliente.ts';
import { conSesion } from '../../lib/middleware.ts';
import { ErrorHTTP, noEncontrado, sinPermiso } from '../../lib/errores.ts';
import { validar, uuid, textoOpcional } from '../../lib/validar.ts';
import { puede } from '../../lib/permisos.ts';
import { verificarPuedeSubirFotos } from '../../servicios/limites.ts';
import {
  carpetaDe,
  datosDeSubida,
  verificarAsset,
  borrarAsset,
  variantes,
} from '../../servicios/almacenamiento.ts';

export const medios = new Hono();

type PropFila = { id: string; usuario_id: string; agencia_id: string | null; estado: string };

/** Carga el aviso y comprueba que el usuario pueda tocarlo. */
async function avisoPropio(c: Context, id: string) {
  const p = await una<PropFila>(
    `SELECT id, usuario_id, agencia_id, estado FROM propiedades
     WHERE id = $1 AND eliminado_en IS NULL`,
    [id],
  );
  if (!p) throw noEncontrado('Ese aviso');
  if (!puede(c.get('usuario'), 'medio.subir', p)) throw sinPermiso();
  return p;
}

/* ------------------------- 1. pedir la firma ------------------------- */

medios.post('/firma', conSesion(), async (c) => {
  const d = validar(
    z.object({ propiedad_id: uuid, cantidad: z.number().int().min(1).max(20).default(1) }),
    await c.req.json(),
  );

  const u = c.get('usuario');
  const p = await avisoPropio(c, d.propiedad_id);

  const { restantes } = await verificarPuedeSubirFotos(
    u.id, p.id, d.cantidad, p.agencia_id,
  );

  return c.json({ ...datosDeSubida(carpetaDe(p.id)), restantes });
});

/* ---------------------- 2. confirmar la subida ---------------------- */

medios.post('/:propiedadId', conSesion(), async (c) => {
  const propiedadId = validar(uuid, c.req.param('propiedadId'));
  const d = validar(
    z.object({
      public_id: z.string().min(3).max(300),
      tipo: z.enum(['foto', 'plano', 'video', 'tour360']).default('foto'),
      ambiente: textoOpcional(40),
      texto_alt: textoOpcional(200),
    }),
    await c.req.json(),
  );

  const u = c.get('usuario');
  const p = await avisoPropio(c, propiedadId);
  await verificarPuedeSubirFotos(u.id, p.id, 1, p.agencia_id);

  // El paso que suele faltar: confirmar contra Cloudinary que el asset
  // existe y está en la carpeta de ESTE aviso.
  const asset = await verificarAsset(d.public_id, carpetaDe(p.id));

  // Fotos robadas o avisos duplicados: mismo hash perceptual en otro aviso.
  if (asset.phash) {
    const repetida = await una<{ propiedad_id: string }>(
      `SELECT propiedad_id FROM medios WHERE phash = $1 AND propiedad_id <> $2 LIMIT 1`,
      [asset.phash, p.id],
    );
    if (repetida) {
      throw new ErrorHTTP(409, 'Esa foto ya está publicada en otro aviso.', {
        codigo: 'MEDIO_DUPLICADO',
      });
    }
  }

  const hayPortada = await una<{ n: number }>(
    `SELECT count(*)::int AS n FROM medios WHERE propiedad_id = $1 AND es_portada`,
    [p.id],
  );
  const siguienteOrden = await una<{ n: number }>(
    `SELECT COALESCE(max(orden), -1) + 1 AS n FROM medios WHERE propiedad_id = $1`,
    [p.id],
  );

  const medio = await una<{ id: string; url: string; orden: number; es_portada: boolean }>(
    `INSERT INTO medios (propiedad_id, tipo, public_id, url, ancho, alto, bytes,
                         phash, ambiente, texto_alt, orden, es_portada)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id, url, orden, es_portada`,
    [
      p.id, d.tipo, asset.public_id, asset.secure_url,
      asset.width, asset.height, asset.bytes, asset.phash ?? null,
      d.ambiente ?? null, d.texto_alt ?? null,
      siguienteOrden?.n ?? 0,
      (hayPortada?.n ?? 0) === 0, // la primera foto queda de portada
    ],
  );

  return c.json({ medio: { ...medio, variantes: variantes(asset.public_id) } }, 201);
});

/* ------------------- 3. reordenar y elegir portada ------------------ */

medios.patch('/:propiedadId', conSesion(), async (c) => {
  const propiedadId = validar(uuid, c.req.param('propiedadId'));
  const d = validar(
    z.object({ orden: z.array(uuid).min(1).max(60), portada: uuid.optional() }),
    await c.req.json(),
  );

  const p = await avisoPropio(c, propiedadId);

  const suyos = await sql<{ id: string }>(
    `SELECT id FROM medios WHERE propiedad_id = $1`, [p.id],
  );
  const validos = new Set(suyos.map((m) => m.id));

  if (d.orden.some((id) => !validos.has(id))) {
    throw new ErrorHTTP(422, 'Esa lista incluye fotos que no son de este aviso.', {
      codigo: 'MEDIO_AJENO',
      campo: 'orden',
    });
  }
  if (d.portada && !d.orden.includes(d.portada)) {
    throw new ErrorHTTP(422, 'La portada tiene que estar en la lista.', {
      codigo: 'PORTADA_FUERA_DE_LISTA',
      campo: 'portada',
    });
  }

  // Quitar la portada primero: el índice único parcial solo admite una.
  await sql(`UPDATE medios SET es_portada = false WHERE propiedad_id = $1`, [p.id]);
  for (const [i, id] of d.orden.entries()) {
    await sql(`UPDATE medios SET orden = $2 WHERE id = $1`, [id, i]);
  }
  const portada = d.portada ?? d.orden[0]!;
  await sql(`UPDATE medios SET es_portada = true WHERE id = $1`, [portada]);

  return c.json({ ok: true, mensaje: 'Listo, guardamos el orden.' });
});

/* ---------------------------- 4. borrar ---------------------------- */

medios.delete('/:propiedadId/:medioId', conSesion(), async (c) => {
  const propiedadId = validar(uuid, c.req.param('propiedadId'));
  const medioId = validar(uuid, c.req.param('medioId'));
  const p = await avisoPropio(c, propiedadId);

  const m = await una<{ id: string; public_id: string; es_portada: boolean }>(
    `SELECT id, public_id, es_portada FROM medios WHERE id = $1 AND propiedad_id = $2`,
    [medioId, p.id],
  );
  if (!m) throw noEncontrado('Esa foto');

  const total = await una<{ n: number }>(
    `SELECT count(*)::int AS n FROM medios WHERE propiedad_id = $1 AND tipo = 'foto'`,
    [p.id],
  );
  if (p.estado === 'activo' && (total?.n ?? 0) <= 3) {
    throw new ErrorHTTP(409, 'Un aviso publicado necesita al menos 3 fotos.', {
      codigo: 'MINIMO_FOTOS',
    });
  }

  await sql(`DELETE FROM medios WHERE id = $1`, [m.id]);

  // Si era la portada, la siguiente la asume.
  if (m.es_portada) {
    await sql(
      `UPDATE medios SET es_portada = true
       WHERE id = (SELECT id FROM medios WHERE propiedad_id = $1 ORDER BY orden LIMIT 1)`,
      [p.id],
    );
  }

  await borrarAsset(m.public_id);
  return c.json({ ok: true, mensaje: 'Foto eliminada.' });
});
