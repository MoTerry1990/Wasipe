import { sql, una } from '../../db/cliente.ts';
import type { Estado } from './estados.ts';

export type Propiedad = {
  id: string;
  codigo: string;
  slug: string;
  usuario_id: string;
  agencia_id: string | null;
  operacion: string;
  tipo: string;
  titulo: string;
  descripcion: string | null;
  ubicacion_id: string;
  direccion: string | null;
  referencia: string | null;
  lat: number | null;
  lng: number | null;
  ocultar_mapa: boolean;
  area_m2: string | null;
  area_techada_m2: string | null;
  dormitorios: number | null;
  banos: number | null;
  cocheras: number | null;
  piso: number | null;
  antiguedad: number | null;
  estado_inmueble: string | null;
  amoblado: string | null;
  precio: string | null;
  moneda: string;
  precio_ref_usd: string | null;
  mantenimiento: string | null;
  caracteristicas: string[];
  estado: Estado;
  motivo_rechazo: string | null;
  destacado_hasta: string | null;
  vistas: number;
  publicado_en: string | null;
  vence_en: string | null;
  creado_en: string;
  actualizado_en: string;
};

export const porId = (id: string) =>
  una<Propiedad>(
    `SELECT * FROM propiedades WHERE id = $1 AND eliminado_en IS NULL`,
    [id],
  );

/** Acepta slug o UUID. Usado por la ficha pública. */
export const porSlugOId = (valor: string) =>
  una<Propiedad>(
    `SELECT * FROM propiedades
     WHERE (slug = $1 OR (length($1) = 36 AND id::text = $1))
       AND eliminado_en IS NULL`,
    [valor],
  );

export const slugHistorico = (slug: string) =>
  una<{ propiedad_id: string }>(
    `SELECT propiedad_id FROM slugs_historicos WHERE slug = $1`, [slug],
  );

export const siguienteCodigo = async (): Promise<string> => {
  const r = await una<{ n: string }>(`SELECT nextval('seq_codigo_aviso') AS n`);
  return `WSP-${r?.n ?? Date.now()}`;
};

export const slugExiste = async (slug: string): Promise<boolean> => {
  const r = await una(`SELECT 1 FROM propiedades WHERE slug = $1`, [slug]);
  return r !== null;
};

export async function crear(datos: {
  codigo: string;
  slug: string;
  usuario_id: string;
  agencia_id: string | null;
  operacion: string;
  tipo: string;
  titulo: string;
  ubicacion_id: string;
  origen: string;
  duplicado_de?: string | null;
}) {
  return una<Propiedad>(
    `INSERT INTO propiedades
       (codigo, slug, usuario_id, agencia_id, operacion, tipo, titulo,
        ubicacion_id, origen, duplicado_de)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      datos.codigo, datos.slug, datos.usuario_id, datos.agencia_id,
      datos.operacion, datos.tipo, datos.titulo, datos.ubicacion_id,
      datos.origen, datos.duplicado_de ?? null,
    ],
  );
}

/** UPDATE con lista blanca ya aplicada por el servicio. */
export async function actualizar(id: string, campos: Record<string, unknown>) {
  const claves = Object.keys(campos);
  if (claves.length === 0) return porId(id);
  const set = claves.map((k, i) => `${k} = $${i + 2}`).join(', ');
  return una<Propiedad>(
    `UPDATE propiedades SET ${set} WHERE id = $1 RETURNING *`,
    [id, ...claves.map((k) => campos[k])],
  );
}

export const cambiarEstado = (id: string, estado: Estado, extra: Record<string, unknown> = {}) =>
  actualizar(id, { estado, ...extra });

export const guardarSlugHistorico = (slug: string, propiedadId: string) =>
  sql(
    `INSERT INTO slugs_historicos (slug, propiedad_id) VALUES ($1,$2)
     ON CONFLICT (slug) DO NOTHING`,
    [slug, propiedadId],
  );

export const borrarLogico = (id: string) =>
  sql(`UPDATE propiedades SET eliminado_en = now() WHERE id = $1`, [id]);

/* --------------------------- características --------------------------- */

export const ponerCaracteristicas = async (propiedadId: string, slugs: string[]) => {
  await sql(`DELETE FROM propiedad_caracteristicas WHERE propiedad_id = $1`, [propiedadId]);
  if (slugs.length === 0) return;
  await sql(
    `INSERT INTO propiedad_caracteristicas (propiedad_id, caracteristica_id)
     SELECT $1, id FROM caracteristicas WHERE slug = ANY($2)`,
    [propiedadId, slugs],
  );
};

export const caracteristicasValidas = (slugs: string[]) =>
  sql<{ slug: string }>(`SELECT slug FROM caracteristicas WHERE slug = ANY($1) AND activo`, [slugs]);

/* ------------------------------- media -------------------------------- */

export const contarFotos = async (propiedadId: string): Promise<number> => {
  const r = await una<{ n: number }>(
    `SELECT count(*)::int AS n FROM medios WHERE propiedad_id = $1 AND tipo='foto'`,
    [propiedadId],
  );
  return r?.n ?? 0;
};

export const tienePortada = async (propiedadId: string): Promise<boolean> => {
  const r = await una(`SELECT 1 FROM medios WHERE propiedad_id = $1 AND es_portada`, [propiedadId]);
  return r !== null;
};

/* ------------------------------ listados ------------------------------ */

export const misAvisos = (usuarioId: string, estado?: string, pagina = 1, porPagina = 24) =>
  sql<Propiedad & { leads: number; leads_nuevos: number; portada: string | null; total: number }>(
    `SELECT p.*,
            (SELECT count(*)::int FROM leads l WHERE l.propiedad_id = p.id) AS leads,
            (SELECT count(*)::int FROM leads l
              WHERE l.propiedad_id = p.id AND l.estado = 'nuevo') AS leads_nuevos,
            (SELECT url FROM medios m WHERE m.propiedad_id = p.id
              ORDER BY es_portada DESC, orden LIMIT 1) AS portada,
            u.distrito, u.provincia,
            count(*) OVER() AS total
     FROM propiedades p
     JOIN ubicaciones u ON u.id = p.ubicacion_id
     WHERE p.usuario_id = $1 AND p.eliminado_en IS NULL
       AND ($2::text IS NULL OR p.estado = $2)
     ORDER BY p.actualizado_en DESC
     LIMIT $3 OFFSET $4`,
    [usuarioId, estado ?? null, porPagina, (pagina - 1) * porPagina],
  );

export const sumarVista = (id: string) =>
  sql(`UPDATE propiedades SET vistas = vistas + 1 WHERE id = $1`, [id]);
