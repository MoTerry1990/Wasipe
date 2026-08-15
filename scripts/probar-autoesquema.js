/**
 * Arranca con una base COMPLETAMENTE VACÍA y comprueba que la función
 * levanta el esquema sola en el primer request.
 *
 * Es el camino del deploy manual: Netlify no corre el build, así que si
 * esto falla, el sitio queda con la base conectada pero sin tablas.
 *
 *   node --experimental-strip-types scripts/probar-autoesquema.js
 */
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

process.env.JWT_SECRET ??= 'secreto-solo-para-pruebas';

const { usarBackend } = await import('../src/db/cliente.ts');
const { app } = await import('../src/app.ts');
const { MIGRACIONES } = await import('../src/db/migraciones-embebidas.js');
const N_MIGRACIONES = MIGRACIONES.length;

let fallos = 0;
const ok = (cond, nombre, detalle = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}${detalle ? ' — ' + detalle : ''}`);
  if (!cond) fallos++;
};

// Base virgen: ni una tabla.
const db = new PGlite({ extensions: { pg_trgm, unaccent, btree_gist } });
await db.waitReady;
const consulta = async (t, p) => (await db.query(t, p)).rows;
usarBackend(consulta);

const tablas = async () =>
  (await consulta(
    `SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'`))[0].n;

console.log('\n  Base vacía\n');
ok((await tablas()) === 0, 'arrancamos sin ninguna tabla', `${await tablas()} tablas`);

console.log('\n  Primer request\n');
{
  const r = await app.request('/api/v1/salud');
  const b = await r.json();
  ok(r.status === 200, 'GET /salud responde 200', `status ${r.status}`);
  ok(b.bd === 'conectada', 'y reporta la base conectada', b.bd);

  const n = await tablas();
  ok(n >= 33, 'creó el esquema completo en el primer request', `${n} tablas`);

  const migs = await consulta(`SELECT nombre FROM migraciones ORDER BY nombre`);
  ok(migs.length === N_MIGRACIONES, `registró las ${N_MIGRACIONES} migraciones`,
     migs.map((m) => m.nombre).join(', '));
}

console.log('\n  Idempotencia\n');
{
  const antes = await tablas();
  for (let i = 0; i < 5; i++) await app.request('/api/v1/salud');
  const despues = await tablas();
  ok(antes === despues, 'requests siguientes no vuelven a migrar', `${antes} → ${despues}`);

  const migs = await consulta(`SELECT count(*)::int n FROM migraciones`);
  ok(migs[0].n === N_MIGRACIONES, 'sin duplicar filas en `migraciones`', String(migs[0].n));
}

console.log('\n  Datos iniciales (sin esto el asistente queda inservible)\n');
{
  const u = (await consulta(`SELECT count(*)::int n FROM ubicaciones`))[0].n;
  ok(u === 74, 'ubicaciones sembradas', `${u} distritos`);
  const c = (await consulta(`SELECT count(*)::int n FROM caracteristicas`))[0].n;
  ok(c === 18, 'características sembradas', `${c}`);
  const p = (await consulta(`SELECT count(*)::int n FROM planes`))[0].n;
  ok(p === 8, 'planes sembrados', `${p}`);
  const tc = (await consulta(`SELECT count(*)::int n FROM tipo_cambio`))[0].n;
  ok(tc === 1, 'tipo de cambio inicial', `${tc}`);

  const gratis = (await consulta(`SELECT tope_avisos FROM planes WHERE slug='gratis'`))[0];
  ok(gratis.tope_avisos === 2, 'el plan gratis da 2 avisos', String(gratis.tope_avisos));

  const ix = (await consulta(`SELECT count(*)::int n FROM indice_precios WHERE publicado`))[0].n;
  ok(ix >= 25, 'índice de arranque sembrado', `${ix} distritos`);

  const mir = (await consulta(
    `SELECT i.precio_m2_usd, i.muestras FROM indice_precios i
     JOIN ubicaciones u ON u.id = i.ubicacion_id WHERE u.slug = 'miraflores'`))[0];
  ok(Number(mir.precio_m2_usd) > 0, 'con precio por m²', `US$${mir.precio_m2_usd}`);
  ok(mir.muestras === 0,
     'y muestras = 0, para que la API lo marque "provisional" y no aparente precisión');
}

console.log('\n  El asistente puede funcionar de verdad\n');
{
  const r = await app.request('/api/v1/ubicaciones/sugerir?q=mira');
  const b = await r.json();
  ok(b.sugerencias?.[0]?.distrito === 'Miraflores',
     'el autocompletado del paso 1 devuelve distritos', b.sugerencias?.[0]?.distrito);
}
{
  const r = await app.request('/api/v1/cuentas/registro', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'ana@x.com', password: 'una frase larga', nombre: 'Ana', rol: 'agente',
    }),
  });
  ok(r.status === 201, 'se puede crear una cuenta enseguida', `status ${r.status}`);

  const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0];
  await consulta(`UPDATE usuarios SET email_verificado_en = now()`);

  const ubi = (await consulta(`SELECT id FROM ubicaciones WHERE slug='miraflores'`))[0].id;
  const cr = await app.request('/api/v1/propiedades', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ operacion: 'venta', tipo: 'departamento', ubicacion_id: ubi }),
  });
  const prop = (await cr.json()).propiedad;
  ok(cr.status === 201, 'se puede crear el borrador', `status ${cr.status}`);

  // Las chips del paso 5 mandan estos slugs: si la tabla estuviera vacía,
  // el backend respondería 422 y el asistente quedaría bloqueado.
  const pa = await app.request(`/api/v1/propiedades/${prop.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      titulo: 'Departamento con vista al parque en Miraflores',
      area_m2: 92, dormitorios: 3, precio: 185000, moneda: 'USD',
      caracteristicas: ['ascensor', 'piscina', 'acepta-mascotas'],
    }),
  });
  const pb = await pa.json();
  ok(pa.status === 200, 'las características del asistente son válidas', pb.error ?? 'ok');
  ok(pb.propiedad?.caracteristicas?.length === 3, 'y quedan guardadas',
     String(pb.propiedad?.caracteristicas));
  ok(Number(pb.propiedad?.precio_ref_usd) === 185000,
     'el tipo de cambio sembrado permite normalizar el precio');
}
{
  // Las extensiones y la función inmutable también quedaron.
  const r = await consulta(`SELECT sin_tildes('Jesús María') AS x`);
  ok(r[0].x === 'Jesus Maria', 'sin_tildes() quedó instalada', r[0].x);
}

console.log(fallos === 0 ? '\n  ✓ Todo en verde.\n' : `\n  ✗ ${fallos} fallo(s).\n`);
await db.close();
process.exit(fallos === 0 ? 0 : 1);
