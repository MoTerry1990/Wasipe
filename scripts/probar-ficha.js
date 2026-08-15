/**
 * Ficha pública: privacidad, badge vs mercado, redirección de slugs,
 * conteo de vistas, similares. Contra Postgres real.
 *
 *   node --experimental-strip-types scripts/probar-ficha.js
 */
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dividirSql } from '../src/db/dividir-sql.js';

process.env.JWT_SECRET ??= 'secreto-solo-para-pruebas';
process.env.CLOUDINARY_CLOUD_NAME = 'wasipe-test';
process.env.CLOUDINARY_API_KEY = '123';
process.env.CLOUDINARY_API_SECRET = 'falso';

const { usarBackend } = await import('../src/db/cliente.ts');
const { usarProveedor } = await import('../src/servicios/almacenamiento.ts');
const { app } = await import('../src/app.ts');

const CARPETA = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'db', 'migraciones');
const db = new PGlite({ extensions: { pg_trgm, unaccent, btree_gist } });
await db.waitReady;
await db.exec(`CREATE TABLE IF NOT EXISTS migraciones (
  nombre TEXT PRIMARY KEY, aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now())`);
for (const archivo of readdirSync(CARPETA).filter((x) => x.endsWith('.sql')).sort()) {
  for (const st of dividirSql(readFileSync(join(CARPETA, archivo), 'utf8'))) await db.exec(st);
  // Registrarlas evita que asegurarEsquema() las vuelva a aplicar.
  await db.query(`INSERT INTO migraciones (nombre) VALUES ($1)
                  ON CONFLICT (nombre) DO NOTHING`, [archivo]);
}
const consulta = async (t, p) => (await db.query(t, p)).rows;
usarBackend(consulta);

const subidos = new Map();
usarProveedor({
  async buscar(id) { return subidos.get(id) ?? null; },
  async borrar(id) { subidos.delete(id); },
});

let fallos = 0;
const ok = (cond, nombre, detalle = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}${detalle ? ' — ' + detalle : ''}`);
  if (!cond) fallos++;
};
const JSONH = { 'content-type': 'application/json' };
const req = (m, ruta, body, ck, extra = {}) =>
  app.request(`/api/v1${ruta}`, {
    method: m,
    headers: { ...(body !== undefined ? JSONH : {}), ...(ck ? { cookie: ck } : {}), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// --- datos ---
const rAna = await req('POST', '/cuentas/registro', {
  email: 'ana@x.com', password: 'una frase larga', nombre: 'Ana Quispe', rol: 'agente',
});
const cookie = (rAna.headers.get('set-cookie') ?? '').split(';')[0];
const anaId = (await rAna.json()).usuario.id;
await consulta(`UPDATE usuarios SET email_verificado_en=now(), verificado=true WHERE id=$1`, [anaId]);

const rBeto = await req('POST', '/cuentas/registro', {
  email: 'beto@x.com', password: 'una frase larga', nombre: 'Beto', rol: 'comprador',
});
const cookieBeto = (rBeto.headers.get('set-cookie') ?? '').split(';')[0];

const ubi = (await consulta(
  `INSERT INTO ubicaciones (departamento, provincia, distrito, slug)
   VALUES ('Lima','Lima','Miraflores','miraflores')
   ON CONFLICT (slug) DO UPDATE SET distrito = EXCLUDED.distrito
   RETURNING id`))[0].id;
await consulta(`INSERT INTO tipo_cambio (fecha,usd_a_pen) VALUES (CURRENT_DATE,3.80)
   ON CONFLICT (fecha) DO UPDATE SET usd_a_pen = 3.80`);
await consulta(
  `INSERT INTO indice_precios (ubicacion_id, periodo, precio_m2_usd, muestras, publicado)
   VALUES ($1, to_char(now(),'YYYY-MM'), 2285, 184, true)
   ON CONFLICT (ubicacion_id, periodo)
   DO UPDATE SET precio_m2_usd = 2285, muestras = 184, publicado = true`, [ubi]);

const crearAviso = async (titulo, precio, extra = {}) => {
  const r = await req('POST', '/propiedades',
    { operacion: 'venta', tipo: 'departamento', ubicacion_id: ubi }, cookie);
  const id = (await r.json()).propiedad.id;
  await req('PATCH', `/propiedades/${id}`, {
    titulo, area_m2: 92, dormitorios: 3, banos: 2, precio, moneda: 'USD',
    descripcion: 'Amplio y luminoso, a media cuadra del parque.',
    direccion: 'Av. Secreta 123, dpto 801',
    referencia: 'A media cuadra del parque Kennedy',
    lat: -12.121, lng: -77.030, ...extra,
  }, cookie);
  for (const n of ['a', 'b', 'c']) {
    const pid = `wasipe/propiedades/${id}/${n}`;
    subidos.set(pid, {
      public_id: pid, secure_url: `https://x/${n}.jpg`,
      width: 1600, height: 1200, bytes: 4e5, format: 'jpg', phash: `${id}-${n}`,
    });
    await req('POST', `/medios/${id}`, { public_id: pid }, cookie);
  }
  await req('POST', `/propiedades/${id}/publicar`, {}, cookie);
  return id;
};

const propId = await crearAviso('Departamento con vista al parque en Miraflores', 185000);
const slug = (await consulta(`SELECT slug FROM propiedades WHERE id=$1`, [propId]))[0].slug;

console.log('\n  Acceso\n');
{
  const r = await req('GET', `/propiedades/${slug}`);
  ok(r.status === 200, 'la ficha es pública, sin sesión', `status ${r.status}`);
}
{
  const r = await req('GET', `/propiedades/${propId}`);
  ok(r.status === 200, 'también responde por UUID');
}
{
  const r = await req('GET', '/propiedades/no-existe-este-slug');
  ok(r.status === 404, 'un slug inexistente da 404');
}

console.log('\n  Privacidad\n');
{
  const b = await (await req('GET', `/propiedades/${slug}`)).json();
  const texto = JSON.stringify(b);
  ok(!texto.includes('Av. Secreta'), 'la dirección exacta NUNCA sale en público');
  ok(b.propiedad.referencia?.includes('parque Kennedy'), 'sí sale la referencia');
  ok(b.propiedad.publica.telefono === null,
     'en el plan gratis no se muestra el teléfono');
  ok(b.propiedad.publica.etiqueta === 'Agente', 'indica quién publica', b.propiedad.publica.etiqueta);
  ok(b.propiedad.publica.verificado === true, 'y si está verificado');
}
{
  await consulta(`UPDATE propiedades SET ocultar_mapa=true WHERE id=$1`, [propId]);
  const b = await (await req('GET', `/propiedades/${slug}`)).json();
  ok(b.propiedad.mapa_aproximado === true, 'marca el mapa como aproximado');

  // Hay que medir la DISTANCIA, no solo la latitud: el desplazamiento va
  // en un ángulo derivado del id, y si apunta al este la latitud casi
  // no cambia. Comprobar solo lat hace la prueba intermitente.
  const dLat = (b.propiedad.lat - (-12.121)) * 111;
  const dLng = (b.propiedad.lng - (-77.030)) * 111 * Math.cos((-12.121 * Math.PI) / 180);
  const km = Math.sqrt(dLat * dLat + dLng * dLng);
  ok(km > 0.25 && km < 0.35, 'y desplaza las coordenadas ~300 m',
     `${Math.round(km * 1000)} m`);

  const b2 = await (await req('GET', `/propiedades/${slug}`)).json();
  ok(b2.propiedad.lat === b.propiedad.lat, 'el desplazamiento es estable entre visitas');
  await consulta(`UPDATE propiedades SET ocultar_mapa=false WHERE id=$1`, [propId]);
}

console.log('\n  Teléfono visible en plan pago\n');
{
  const plan = (await consulta(
    `INSERT INTO planes (slug,nombre,precio,periodo,tope_avisos,telefono_visible)
     VALUES ('agente','Agente',139,'mensual',20,true)
     ON CONFLICT (slug) DO UPDATE SET telefono_visible = true RETURNING id`))[0].id;
  await consulta(
    `INSERT INTO suscripciones (usuario_id,plan_id,estado,fin)
     VALUES ($1,$2,'activa', now() + interval '30 days')`, [anaId, plan]);
  await consulta(`UPDATE perfiles SET whatsapp='+51987654321' WHERE usuario_id=$1`, [anaId]);

  const b = await (await req('GET', `/propiedades/${slug}`)).json();
  ok(b.propiedad.publica.telefono === '+51987654321',
     'con plan pago SÍ se muestra el teléfono', b.propiedad.publica.telefono);
  ok(b.propiedad.publica.whatsapp_url?.includes('wa.me/51987654321'),
     'y trae el enlace de WhatsApp listo', b.propiedad.publica.whatsapp_url);
}

console.log('\n  Badge vs mercado\n');
{
  const b = await (await req('GET', `/propiedades/${slug}`)).json();
  const v = b.propiedad.vs_mercado;
  // 185000 / 92 = 2011 US$/m²  vs índice 2285  →  −12%
  ok(v !== null, 'calcula el badge');
  ok(v.porcentaje === -12, 'US$185k / 92m² = 2011/m² → 12% debajo del mercado',
     `${v.porcentaje}%`);
  ok(v.indice_m2 === 2285, 'con el índice del distrito', String(v.indice_m2));
  ok(v.confianza === 'alta', 'y el nivel de confianza según las muestras',
     `${v.confianza} (${v.muestras} muestras)`);
}
{
  const caro = await crearAviso('Departamento caro en Miraflores centro', 300000);
  const s2 = (await consulta(`SELECT slug FROM propiedades WHERE id=$1`, [caro]))[0].slug;
  const b = await (await req('GET', `/propiedades/${s2}`)).json();
  ok(b.propiedad.vs_mercado.porcentaje > 0, 'un aviso caro sale por encima del mercado',
     `${b.propiedad.vs_mercado.porcentaje}%`);
}

console.log('\n  Slug histórico → 301\n');
{
  const viejo = slug;
  await req('PATCH', `/propiedades/${propId}`,
    { titulo: 'Departamento remodelado frente al parque Kennedy' }, cookie);
  const nuevo = (await consulta(`SELECT slug FROM propiedades WHERE id=$1`, [propId]))[0].slug;
  ok(nuevo !== viejo, 'cambiar el título cambia el slug', nuevo);

  const r = await req('GET', `/propiedades/${viejo}`);
  const b = await r.json();
  ok(r.status === 301, 'el slug viejo devuelve 301, no 404', `status ${r.status}`);
  ok(b.redirigir_a === `/propiedad/${nuevo}`, 'y apunta al slug vigente', b.redirigir_a);
}

console.log('\n  Estados no públicos\n');
{
  const nuevo = (await consulta(`SELECT slug FROM propiedades WHERE id=$1`, [propId]))[0].slug;
  await req('POST', `/propiedades/${propId}/pausar`, {}, cookie);

  const anon = await req('GET', `/propiedades/${nuevo}`);
  ok(anon.status === 404, 'un aviso pausado no es visible para el público');

  const otro = await req('GET', `/propiedades/${nuevo}`, undefined, cookieBeto);
  ok(otro.status === 404, 'ni para otro usuario');

  const dueno = await req('GET', `/propiedades/${nuevo}`, undefined, cookie);
  ok(dueno.status === 200, 'pero el dueño sí lo ve');

  await req('POST', `/propiedades/${propId}/reactivar`, {}, cookie);
}

console.log('\n  Vistas\n');
{
  await consulta(`DELETE FROM vistas_propiedad`);
  await consulta(`DELETE FROM intentos_auth WHERE clave LIKE 'vista:%'`);
  const nuevo = (await consulta(`SELECT slug FROM propiedades WHERE id=$1`, [propId]))[0].slug;

  const ip = { 'x-forwarded-for': '190.1.1.1' };
  await req('GET', `/propiedades/${nuevo}`, undefined, undefined, ip);
  await req('GET', `/propiedades/${nuevo}`, undefined, undefined, ip);
  await req('GET', `/propiedades/${nuevo}`, undefined, undefined, { 'x-forwarded-for': '190.2.2.2' });

  const v = (await consulta(
    `SELECT vistas, vistas_unicas FROM vistas_propiedad WHERE propiedad_id=$1`, [propId]))[0];
  ok(v.vistas === 3, 'cuenta todas las vistas', String(v.vistas));
  ok(v.vistas_unicas === 2, 'y deduplica por IP y día', `${v.vistas_unicas} únicas de 2 IPs`);
}

console.log('\n  Similares\n');
{
  const nuevo = (await consulta(`SELECT slug FROM propiedades WHERE id=$1`, [propId]))[0].slug;
  const b = await (await req('GET', `/propiedades/${nuevo}`)).json();
  ok(Array.isArray(b.similares), 'devuelve avisos similares', `${b.similares.length}`);
  ok(!b.similares.some((s) => s.id === propId), 'sin incluirse a sí mismo');
}

console.log('\n  Medios y variantes\n');
{
  const nuevo = (await consulta(`SELECT slug FROM propiedades WHERE id=$1`, [propId]))[0].slug;
  const b = await (await req('GET', `/propiedades/${nuevo}`)).json();
  ok(b.propiedad.medios.length === 3, 'trae las fotos');
  ok(b.propiedad.medios[0].es_portada === true, 'la portada va primera');
  ok(b.propiedad.medios[0].variantes.miniatura.includes('f_auto'),
     'con variantes f_auto (AVIF/WebP según el navegador)');
  ok(b.propiedad.medios[0].variantes.og.includes('1200'), 'y una variante para compartir');
}

console.log('\n  Caché\n');
{
  const nuevo = (await consulta(`SELECT slug FROM propiedades WHERE id=$1`, [propId]))[0].slug;
  const r = await req('GET', `/propiedades/${nuevo}`);
  ok((r.headers.get('cache-control') ?? '').includes('stale-while-revalidate'),
     'la ficha se cachea con revalidación');
}

console.log(fallos === 0 ? '\n  ✓ Todo en verde.\n' : `\n  ✗ ${fallos} fallo(s).\n`);
await db.close();
process.exit(fallos === 0 ? 0 : 1);
