/**
 * Prueba el módulo de medios contra Postgres real (PGlite) y un
 * Cloudinary falso, para poder verificar el flujo completo de subida
 * firmada sin credenciales reales.
 *
 *   node --experimental-strip-types scripts/probar-medios.js
 */
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dividirSql } from '../src/db/dividir-sql.js';

process.env.JWT_SECRET ??= 'secreto-solo-para-pruebas';
process.env.CLOUDINARY_CLOUD_NAME = 'wasipe-test';
process.env.CLOUDINARY_API_KEY = '123456789';
process.env.CLOUDINARY_API_SECRET = 'secreto-cloudinary-falso';

const { usarBackend } = await import('../src/db/cliente.ts');
const { usarProveedor, firmar } = await import('../src/servicios/almacenamiento.ts');
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

// --- Cloudinary falso: solo conoce los assets que "se subieron" ---
const subidos = new Map();
const subir = (publicId, phash = null) =>
  subidos.set(publicId, {
    public_id: publicId,
    secure_url: `https://res.cloudinary.com/wasipe-test/image/upload/${publicId}.jpg`,
    width: 1600, height: 1200, bytes: 480000, format: 'jpg',
    phash: phash ?? createHash('md5').update(publicId).digest('hex').slice(0, 16),
  });
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
const req = (metodo, ruta, body, cookie) =>
  app.request(`/api/v1${ruta}`, {
    method: metodo,
    headers: cookie ? { ...JSONH, cookie } : JSONH,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const galleta = (r) => (r.headers.get('set-cookie') ?? '').split(';')[0];

// --- datos ---
const rAna = await req('POST', '/cuentas/registro', {
  email: 'ana@x.com', password: 'una frase larga', nombre: 'Ana', rol: 'agente',
});
const cookieAna = galleta(rAna);
const anaId = (await rAna.json()).usuario.id;

const rBeto = await req('POST', '/cuentas/registro', {
  email: 'beto@x.com', password: 'una frase larga', nombre: 'Beto', rol: 'agente',
});
const cookieBeto = galleta(rBeto);

const ubi = (await consulta(
  `INSERT INTO ubicaciones (departamento, provincia, distrito, slug)
   VALUES ('Lima','Lima','Miraflores','miraflores')
   ON CONFLICT (slug) DO UPDATE SET distrito = EXCLUDED.distrito
   RETURNING id`))[0].id;
const prop = (await consulta(
  `INSERT INTO propiedades (codigo,slug,usuario_id,operacion,tipo,titulo,ubicacion_id,precio,moneda)
   VALUES ('WSP-1','depa-miraflores',$1,'venta','departamento',
           'Departamento amplio en Miraflores',$2, 190000,'USD') RETURNING id`,
  [anaId, ubi]))[0].id;

console.log('\n  Firma de subida\n');
{
  const r = await req('POST', '/medios/firma', { propiedad_id: prop, cantidad: 3 }, cookieAna);
  const b = await r.json();
  ok(r.status === 200, 'devuelve la firma');
  ok(b.folder === `wasipe/propiedades/${prop}`, 'la carpeta es la del aviso', b.folder);
  ok(b.exif === 'false', 'pide a Cloudinary quitar el EXIF (GPS de la casa)');
  ok(!('secreto' in b) && !JSON.stringify(b).includes('secreto-cloudinary-falso'),
     'el api_secret NUNCA sale del servidor');
  ok(b.restantes === 5, 'informa cuántas fotos quedan (8 del plan gratis − 3)', String(b.restantes));

  // La firma tiene que reproducirse exactamente con los mismos parámetros.
  const esperada = firmar({ folder: b.folder, timestamp: b.timestamp, exif: 'false' });
  ok(b.firma === esperada, 'la firma corresponde a los parámetros enviados');
}
{
  const r = await req('POST', '/medios/firma', { propiedad_id: prop, cantidad: 1 }, cookieBeto);
  ok(r.status === 403, 'otro usuario NO puede pedir firma para este aviso', `status ${r.status}`);
}
{
  const r = await req('POST', '/medios/firma', { propiedad_id: prop, cantidad: 1 });
  ok(r.status === 401, 'sin sesión tampoco');
}
{
  const r = await req('POST', '/medios/firma', { propiedad_id: prop, cantidad: 99 }, cookieAna);
  ok(r.status === 422, 'rechaza pedir más de 20 de una vez');
}

console.log('\n  Confirmar subida\n');
const ids = [];
{
  for (const n of ['a', 'b', 'c']) {
    const pid = `wasipe/propiedades/${prop}/${n}`;
    subir(pid);
    const r = await req('POST', `/medios/${prop}`, { public_id: pid }, cookieAna);
    const b = await r.json();
    if (r.status === 201) ids.push(b.medio.id);
    ok(r.status === 201, `sube la foto "${n}"`, `status ${r.status}`);
  }
  ok(ids.length === 3, 'quedaron 3 fotos');
}
{
  const b = await (await req('POST', `/medios/${prop}`,
    { public_id: `wasipe/propiedades/${prop}/no-subida` }, cookieAna)).json();
  ok(b.codigo === 'MEDIO_NO_ENCONTRADO',
     'rechaza un public_id que Cloudinary no tiene (id inventado)', b.error);
}
{
  // El ataque: reclamar una imagen que está en la carpeta de otro aviso.
  const ajena = 'wasipe/propiedades/00000000-0000-0000-0000-000000000000/x';
  subir(ajena);
  const b = await (await req('POST', `/medios/${prop}`,
    { public_id: ajena }, cookieAna)).json();
  ok(b.codigo === 'MEDIO_AJENO', 'rechaza una imagen de la carpeta de otro aviso', b.error);
}
{
  const pid = `wasipe/propiedades/${prop}/dup`;
  const otroProp = (await consulta(
    `INSERT INTO propiedades (codigo,slug,usuario_id,operacion,tipo,titulo,ubicacion_id)
     VALUES ('WSP-2','otro-aviso',$1,'venta','casa','Casa en otro lugar distinta',$2)
     RETURNING id`, [anaId, ubi]))[0].id;
  await consulta(
    `INSERT INTO medios (propiedad_id, public_id, url, phash)
     VALUES ($1,'otro/x','http://x', 'PHASH-REPETIDO')`, [otroProp]);
  subir(pid, 'PHASH-REPETIDO');
  const b = await (await req('POST', `/medios/${prop}`, { public_id: pid }, cookieAna)).json();
  ok(b.codigo === 'MEDIO_DUPLICADO',
     'detecta foto repetida en otro aviso por hash perceptual', b.error);
}

console.log('\n  Portada\n');
{
  const r = await consulta(
    `SELECT id, es_portada, orden FROM medios WHERE propiedad_id=$1 ORDER BY orden`, [prop]);
  ok(r[0].es_portada === true, 'la primera foto queda de portada automáticamente');
  ok(r.filter((m) => m.es_portada).length === 1, 'solo una es portada');
  ok(r.map((m) => m.orden).join(',') === '0,1,2', 'el orden se asigna incremental');
}
{
  const nuevoOrden = [ids[2], ids[0], ids[1]];
  const r = await req('PATCH', `/medios/${prop}`,
    { orden: nuevoOrden, portada: ids[2] }, cookieAna);
  ok(r.status === 200, 'reordena y cambia la portada');

  const filas = await consulta(
    `SELECT id, orden, es_portada FROM medios WHERE propiedad_id=$1 ORDER BY orden`, [prop]);
  ok(filas[0].id === ids[2] && filas[0].es_portada === true, 'la nueva portada quedó primera');
  ok(filas.filter((m) => m.es_portada).length === 1, 'sigue habiendo una sola portada');
}
{
  const b = await (await req('PATCH', `/medios/${prop}`,
    { orden: [ids[0], '00000000-0000-0000-0000-000000000000'] }, cookieAna)).json();
  ok(b.codigo === 'MEDIO_AJENO', 'rechaza reordenar con fotos de otro aviso');
}
{
  const b = await (await req('PATCH', `/medios/${prop}`,
    { orden: [ids[0]], portada: ids[1] }, cookieAna)).json();
  ok(b.codigo === 'PORTADA_FUERA_DE_LISTA', 'la portada debe estar en la lista');
}

console.log('\n  Tope del plan\n');
{
  // Gratis = 8 fotos. Ya hay 3; subimos 5 más y la novena debe fallar.
  for (let i = 0; i < 5; i++) {
    const pid = `wasipe/propiedades/${prop}/extra${i}`;
    subir(pid);
    await req('POST', `/medios/${prop}`, { public_id: pid }, cookieAna);
  }
  const total = (await consulta(
    `SELECT count(*)::int n FROM medios WHERE propiedad_id=$1`, [prop]))[0].n;
  ok(total === 8, 'llegó a las 8 fotos del plan gratis', String(total));

  const pid = `wasipe/propiedades/${prop}/novena`;
  subir(pid);
  const r = await req('POST', `/medios/${prop}`, { public_id: pid }, cookieAna);
  const b = await r.json();
  ok(r.status === 402 && b.codigo === 'TOPE_PLAN', 'la novena da 402', b.error);
  ok(b.plan_sugerido === 'agente-inicial', 'sugiere el plan siguiente', b.plan_sugerido);
}

console.log('\n  Borrado\n');
{
  const antes = subidos.size;
  const r = await req('DELETE', `/medios/${prop}/${ids[1]}`, undefined, cookieAna);
  ok(r.status === 200, 'borra la foto');
  ok(subidos.size === antes - 1, 'y también la borra de Cloudinary');
}
{
  await consulta(`UPDATE propiedades SET estado='activo', publicado_en=now() WHERE id=$1`, [prop]);
  await consulta(
    `DELETE FROM medios WHERE id IN (
       SELECT id FROM medios WHERE propiedad_id=$1 ORDER BY orden OFFSET 3)`, [prop]);
  const quedan = (await consulta(
    `SELECT count(*)::int n FROM medios WHERE propiedad_id=$1`, [prop]))[0].n;
  const b = await (await req('DELETE',
    `/medios/${prop}/${(await consulta(`SELECT id FROM medios WHERE propiedad_id=$1 LIMIT 1`, [prop]))[0].id}`,
    undefined, cookieAna)).json();
  ok(b.codigo === 'MINIMO_FOTOS',
     `un aviso activo no baja de 3 fotos (tenía ${quedan})`, b.error);
}

console.log(fallos === 0 ? '\n  ✓ Todo en verde.\n' : `\n  ✗ ${fallos} fallo(s).\n`);
await db.close();
process.exit(fallos === 0 ? 0 : 1);
