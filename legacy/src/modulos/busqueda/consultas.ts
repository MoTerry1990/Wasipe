import { sql } from '../../db/cliente.ts';
import { POR_PAGINA, type Busqueda } from './filtros.ts';

/**
 * Construye el WHERE de forma incremental.
 *
 * Los rangos de precio se comparan SIEMPRE contra `precio_ref_usd`, nunca
 * contra `precio`: si no, buscar "US$100k–200k" mezcla soles con dólares y
 * devuelve cualquier cosa. Es la queja documentada de Urbania.
 */
function armarWhere(f: Busqueda, ubicacionIds: string[]) {
  const donde: string[] = [
    `p.estado = 'activo'`,
    `p.eliminado_en IS NULL`,
  ];
  const params: unknown[] = [];
  const nuevo = (v: unknown) => `$${params.push(v)}`;

  if (f.operacion) donde.push(`p.operacion = ${nuevo(f.operacion)}`);
  if (f.tipo?.length) donde.push(`p.tipo = ANY(${nuevo(f.tipo)})`);
  if (ubicacionIds.length) donde.push(`p.ubicacion_id = ANY(${nuevo(ubicacionIds)})`);

  // Tipo de cambio para convertir el filtro a la misma unidad del índice.
  if (f.precio_min !== undefined) {
    const usd = f.moneda_vista === 'PEN' ? f.precio_min / 3.8 : f.precio_min;
    donde.push(`p.precio_ref_usd >= ${nuevo(usd)}`);
  }
  if (f.precio_max !== undefined) {
    const usd = f.moneda_vista === 'PEN' ? f.precio_max / 3.8 : f.precio_max;
    donde.push(`p.precio_ref_usd <= ${nuevo(usd)}`);
  }
  if (f.con_precio) donde.push(`p.precio IS NOT NULL`);

  if (f.area_min !== undefined) donde.push(`p.area_m2 >= ${nuevo(f.area_min)}`);
  if (f.area_max !== undefined) donde.push(`p.area_m2 <= ${nuevo(f.area_max)}`);
  if (f.dormitorios_min !== undefined) donde.push(`p.dormitorios >= ${nuevo(f.dormitorios_min)}`);
  if (f.dormitorios_max !== undefined) donde.push(`p.dormitorios <= ${nuevo(f.dormitorios_max)}`);
  if (f.banos_min !== undefined) donde.push(`p.banos >= ${nuevo(f.banos_min)}`);
  if (f.cocheras_min !== undefined) donde.push(`p.cocheras >= ${nuevo(f.cocheras_min)}`);
  if (f.antiguedad_max !== undefined) donde.push(`p.antiguedad <= ${nuevo(f.antiguedad_max)}`);
  if (f.estado_inmueble) donde.push(`p.estado_inmueble = ${nuevo(f.estado_inmueble)}`);
  if (f.amoblado) donde.push(`p.amoblado = ${nuevo(f.amoblado)}`);

  // Array con GIN: mucho más rápido que un JOIN + HAVING count.
  if (f.caracteristicas?.length) {
    donde.push(`p.caracteristicas @> ${nuevo(f.caracteristicas)}`);
  }

  // Ojo con los alias: `u` es ubicaciones, `us` es usuarios.
  if (f.publica) {
    donde.push(
      f.publica === 'dueno'
        ? `us.rol = 'propietario'`
        : `us.rol = ${nuevo(f.publica)}`,
    );
  }
  if (f.solo_verificados) donde.push(`us.verificado = true`);

  if (f.q) {
    donde.push(
      `p.busqueda_tsv @@ plainto_tsquery('spanish', sin_tildes(${nuevo(f.q)}))`,
    );
  }

  return { donde: donde.join(' AND '), params };
}

const ORDEN_SQL: Record<string, string> = {
  relevancia: 'p.publicado_en DESC',
  recientes: 'p.publicado_en DESC',
  precio_asc: 'p.precio_ref_usd ASC NULLS LAST',
  precio_desc: 'p.precio_ref_usd DESC NULLS LAST',
  area_desc: 'p.area_m2 DESC NULLS LAST',
  m2_asc: '(p.precio_ref_usd / NULLIF(p.area_m2,0)) ASC NULLS LAST',
};

export async function buscar(f: Busqueda, ubicacionIds: string[]) {
  const { donde, params } = armarWhere(f, ubicacionIds);
  const offset = (f.pagina - 1) * POR_PAGINA;

  const filas = await sql<Record<string, unknown>>(
    `SELECT p.id, p.slug, p.codigo, p.titulo, p.operacion, p.tipo,
            p.precio, p.moneda, p.precio_ref_usd, p.mantenimiento,
            p.area_m2, p.dormitorios, p.banos, p.cocheras,
            p.caracteristicas, p.publicado_en, p.destacado_hasta,
            u.distrito, u.provincia, u.slug AS ubicacion_slug,
            us.nombre AS publica_nombre, us.rol AS publica_rol,
            us.verificado AS publica_verificado,
            (SELECT m.url FROM medios m WHERE m.propiedad_id = p.id
              ORDER BY m.es_portada DESC, m.orden LIMIT 1) AS portada,
            (SELECT count(*)::int FROM medios m WHERE m.propiedad_id = p.id) AS fotos,
            -- El badge vs mercado sale en la MISMA consulta: cero llamadas extra.
            ROUND(100.0 * ((p.precio_ref_usd / NULLIF(p.area_m2,0)) - i.precio_m2_usd)
                        / NULLIF(i.precio_m2_usd,0)) AS vs_mercado,
            EXTRACT(DAY FROM now() - p.actualizado_en)::int AS actualizado_hace_dias,
            count(*) OVER() AS total
     FROM propiedades p
     JOIN ubicaciones u  ON u.id = p.ubicacion_id
     JOIN usuarios   us  ON us.id = p.usuario_id
     LEFT JOIN LATERAL (
       SELECT precio_m2_usd FROM indice_precios ip
       WHERE ip.ubicacion_id = p.ubicacion_id AND ip.publicado
       ORDER BY ip.periodo DESC LIMIT 1
     ) i ON true
     WHERE ${donde}
     ORDER BY
       CASE WHEN p.destacado_hasta > now() THEN 0 ELSE 1 END,
       ${ORDEN_SQL[f.orden] ?? ORDEN_SQL.relevancia},
       p.id
     LIMIT ${POR_PAGINA} OFFSET ${offset}`,
    params,
  );

  const total = Number(filas[0]?.total ?? 0);
  return { filas, total };
}

/** Rango y mediana del conjunto encontrado. Sirve para orientar al comprador. */
export async function resumen(f: Busqueda, ubicacionIds: string[]) {
  const { donde, params } = armarWhere(f, ubicacionIds);
  const r = await sql<{
    precio_min: string | null; precio_max: string | null; precio_mediano: string | null;
  }>(
    `SELECT min(p.precio_ref_usd) AS precio_min,
            max(p.precio_ref_usd) AS precio_max,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY p.precio_ref_usd) AS precio_mediano
     FROM propiedades p
     JOIN ubicaciones u ON u.id = p.ubicacion_id
     JOIN usuarios us   ON us.id = p.usuario_id
     WHERE ${donde}`,
    params,
  );
  const x = r[0];
  return {
    precio_min: x?.precio_min ? Number(x.precio_min) : null,
    precio_max: x?.precio_max ? Number(x.precio_max) : null,
    precio_mediano: x?.precio_mediano ? Math.round(Number(x.precio_mediano)) : null,
  };
}

/**
 * Conteos para pintar los filtros.
 *
 * Cada faceta se cuenta ignorando su PROPIO filtro: si no, al elegir
 * "departamento" el resto de tipos mostraría cero y no se podría cambiar.
 */
export async function facetas(f: Busqueda, ubicacionIds: string[]) {
  const sinTipo = armarWhere({ ...f, tipo: undefined }, ubicacionIds);
  const sinDorm = armarWhere({ ...f, dormitorios_min: undefined, dormitorios_max: undefined }, ubicacionIds);
  const sinCar = armarWhere({ ...f, caracteristicas: undefined }, ubicacionIds);
  const base = 'FROM propiedades p JOIN ubicaciones u ON u.id = p.ubicacion_id JOIN usuarios us ON us.id = p.usuario_id';

  const [tipos, dorms, cars] = await Promise.all([
    sql<{ k: string; n: number }>(
      `SELECT p.tipo AS k, count(*)::int AS n ${base} WHERE ${sinTipo.donde}
       GROUP BY p.tipo ORDER BY n DESC`, sinTipo.params),
    sql<{ k: number; n: number }>(
      `SELECT p.dormitorios AS k, count(*)::int AS n ${base} WHERE ${sinDorm.donde}
         AND p.dormitorios IS NOT NULL GROUP BY p.dormitorios ORDER BY p.dormitorios`,
      sinDorm.params),
    sql<{ k: string; n: number }>(
      `SELECT c AS k, count(*)::int AS n ${base}, unnest(p.caracteristicas) c
       WHERE ${sinCar.donde} GROUP BY c ORDER BY n DESC LIMIT 20`, sinCar.params),
  ]);

  const aObjeto = (xs: { k: unknown; n: number }[]) =>
    Object.fromEntries(xs.map((x) => [String(x.k), x.n]));

  return { tipo: aObjeto(tipos), dormitorios: aObjeto(dorms), caracteristicas: aObjeto(cars) };
}

/** Resuelve slugs (o nombres) de distrito a ids. Devuelve los no encontrados. */
export async function resolverUbicaciones(slugs: string[]) {
  if (!slugs.length) return { ids: [], desconocidos: [] };
  const filas = await sql<{ id: string; slug: string; distrito: string }>(
    `SELECT id, slug, distrito FROM ubicaciones
     WHERE activo AND (slug = ANY($1) OR sin_tildes(lower(distrito)) = ANY($1))`,
    [slugs],
  );
  const hallados = new Set(filas.map((x) => x.slug));
  const desconocidos = slugs.filter(
    (s) => !hallados.has(s) && !filas.some((f) => f.distrito.toLowerCase().includes(s)),
  );
  return { ids: filas.map((x) => x.id), filas, desconocidos };
}
