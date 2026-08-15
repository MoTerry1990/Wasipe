import { sql, una } from '../../db/cliente.ts';

export type Ubicacion = {
  id: string;
  departamento: string;
  provincia: string;
  distrito: string;
  slug: string;
  lat: number | null;
  lng: number | null;
  destacado: boolean;
};

export type Sugerencia = Ubicacion & { avisos_activos: number; etiqueta: string };

/**
 * Autocompletado tolerante a tildes y a errores de tipeo.
 *
 * Tres formas de acertar, en orden de prioridad:
 *   1. el nombre empieza por lo escrito        ("mira" → Miraflores)
 *   2. un alias coincide                        ("surco" → Santiago de Surco)
 *   3. similitud por trigramas                  ("mirafores" → Miraflores)
 *
 * Todo pasa por sin_tildes(), así que "jesus maria" encuentra "Jesús María".
 */
export function sugerir(q: string, limite = 8) {
  return sql<Sugerencia>(
    `WITH t AS (SELECT sin_tildes(lower($1)) AS q)
     SELECT u.id, u.departamento, u.provincia, u.distrito, u.slug,
            u.lat, u.lng, u.destacado,
            (SELECT count(*)::int FROM propiedades p
              WHERE p.ubicacion_id = u.id AND p.estado = 'activo'
                AND p.eliminado_en IS NULL) AS avisos_activos,
            u.distrito || ', ' || u.provincia AS etiqueta
     FROM ubicaciones u, t
     WHERE u.activo
       AND (
         sin_tildes(lower(u.distrito)) LIKE t.q || '%'
         OR EXISTS (
           SELECT 1 FROM unnest(u.alias) a
           WHERE sin_tildes(lower(a)) LIKE t.q || '%')
         OR similarity(sin_tildes(lower(u.distrito)), t.q) > 0.3
       )
     ORDER BY
       (sin_tildes(lower(u.distrito)) LIKE t.q || '%') DESC,
       EXISTS (SELECT 1 FROM unnest(u.alias) a
               WHERE sin_tildes(lower(a)) LIKE t.q || '%') DESC,
       similarity(sin_tildes(lower(u.distrito)), t.q) DESC,
       u.destacado DESC,
       u.distrito
     LIMIT $2`,
    [q, limite],
  );
}

export const porSlug = (slug: string) =>
  una<Ubicacion>(`SELECT * FROM ubicaciones WHERE slug = $1 AND activo`, [slug]);

export const porId = (id: string) =>
  una<Ubicacion>(`SELECT * FROM ubicaciones WHERE id = $1 AND activo`, [id]);

/** Resuelve varios slugs de una vez. Usado por los filtros de búsqueda. */
export const porSlugs = (slugs: string[]) =>
  sql<Ubicacion>(`SELECT * FROM ubicaciones WHERE slug = ANY($1) AND activo`, [slugs]);

/** Distritos con más avisos, para la sección "Busca por distrito" del home. */
export const destacadas = (limite = 8) =>
  sql<Sugerencia>(
    `SELECT u.*, u.distrito || ', ' || u.provincia AS etiqueta,
            (SELECT count(*)::int FROM propiedades p
              WHERE p.ubicacion_id = u.id AND p.estado='activo'
                AND p.eliminado_en IS NULL) AS avisos_activos
     FROM ubicaciones u
     WHERE u.activo AND u.destacado
     ORDER BY avisos_activos DESC, u.distrito
     LIMIT $1`,
    [limite],
  );

/** Árbol departamento → provincia → distrito. Se cachea 24 h. */
export async function arbol() {
  const filas = await sql<Ubicacion>(
    `SELECT * FROM ubicaciones WHERE activo
     ORDER BY departamento, provincia, distrito`,
  );

  const mapa = new Map<string, Map<string, Ubicacion[]>>();
  for (const u of filas) {
    if (!mapa.has(u.departamento)) mapa.set(u.departamento, new Map());
    const provs = mapa.get(u.departamento)!;
    if (!provs.has(u.provincia)) provs.set(u.provincia, []);
    provs.get(u.provincia)!.push(u);
  }

  return [...mapa].map(([departamento, provs]) => ({
    departamento,
    provincias: [...provs].map(([provincia, distritos]) => ({
      provincia,
      distritos: distritos.map((d) => ({ slug: d.slug, distrito: d.distrito })),
    })),
  }));
}
