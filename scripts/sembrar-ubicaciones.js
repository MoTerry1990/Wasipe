/**
 * Siembra la tabla `ubicaciones`. Idempotente: se puede correr las veces
 * que haga falta, actualiza alias y coordenadas sin duplicar filas.
 *
 *   node scripts/sembrar-ubicaciones.js
 */
import { neon } from '@neondatabase/serverless';
import { UBICACIONES } from './datos/ubicaciones.js';

/**
 * `consulta` se inyecta en las pruebas para apuntar a PGlite.
 * Si no se pasa, se conecta a Neon con DATABASE_URL.
 */
function consultaPorDefecto() {
  const url =
    process.env.DATABASE_URL ??
    process.env.NETLIFY_DATABASE_URL ??
    process.env.NETLIFY_DB_URL;
  if (!url) {
    console.error('\n  ✗ Falta DATABASE_URL.\n');
    process.exit(1);
  }
  const sql = neon(url);
  return (t, p) => sql(t, p);
}

export async function sembrar(consulta = consultaPorDefecto()) {
  let nuevas = 0;
  let actualizadas = 0;

  for (const [dep, prov, dist, slug, alias, lat, lng, destacado] of UBICACIONES) {
    const r = await consulta(
      `INSERT INTO ubicaciones (departamento, provincia, distrito, slug, alias, lat, lng, destacado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (slug) DO UPDATE SET
         alias = EXCLUDED.alias,
         lat = EXCLUDED.lat,
         lng = EXCLUDED.lng,
         destacado = EXCLUDED.destacado
       RETURNING (xmax = 0) AS insertada`,
      [dep, prov, dist, slug, alias, lat, lng, destacado],
    );
    if (r[0]?.insertada) nuevas++;
    else actualizadas++;
  }
  return { nuevas, actualizadas, total: UBICACIONES.length };
}

// Solo corre si se invoca directo, no al importarlo desde una prueba.
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const r = await sembrar();
  console.log(
    `\n  ✓ Ubicaciones: ${r.nuevas} nuevas, ${r.actualizadas} actualizadas (${r.total} en total)\n`,
  );
}
