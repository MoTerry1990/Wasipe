/**
 * Circuito completo del aviso: crear borrador → editar → fotos → publicar
 * → pausar → renovar → duplicar → cerrar. Contra Postgres real.
 *
 *   node --experimental-strip-types scripts/probar-propiedades.js
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
const subirFoto = async (propId, n) => {
  const pid = `wasipe/propiedades/${propId}/${n}`;
  subidos.set(pid, {
    public_id: pid, secure_url: `https://x/${n}.jpg`,
    width: 1600, height: 1200, bytes: 400000, format: 'jpg',
    phash: `${propId}-${n}`,
  });
  return req('POST', `/medios/${propId}`, { public_id: pid }, cookie);
};

let fallos = 0;
const ok = (cond, nombre, detalle = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}${detalle ? ' — ' + detalle : ''}`);
  if (!cond) fallos++;
};
const JSONH = { 'content-type': 'application/json' };
const req = (m, ruta, body, ck) =>
  app.request(`/api/v1${ruta}`, {
    method: m,
    headers: ck ? { ...JSONH, cookie: ck } : JSONH,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// --- usuarios ---
const rAna = await req('POST', '/cuentas/registro', {
  email: 'ana@x.com', password: 'una frase larga', nombre: 'Ana', rol: 'agente',
});
const cookie = (rAna.headers.get('set-cookie') ?? '').split(';')[0];
const anaId = (await rAna.json()).usuario.id;

const rBeto = await req('POST', '/cuentas/registro', {
  email: 'beto@x.com', password: 'una frase larga', nombre: 'Beto', rol: 'agente',
});
const cookieBeto = (rBeto.headers.get('set-cookie') ?? '').split(';')[0];

const ubi = (await consulta(
  `INSERT INTO ubicaciones (departamento, provincia, distrito, slug)
   VALUES ('Lima','Lima','Miraflores','miraflores')
   ON CONFLICT (slug) DO UPDATE SET distrito = EXCLUDED.distrito
   RETURNING id`))[0].id;
await consulta(
  `INSERT INTO caracteristicas (slug,nombre,grupo) VALUES
   ('ascensor','Ascensor','edificio'),('piscina','Piscina','exterior')
   ON CONFLICT (slug) DO NOTHING`);
await consulta(`INSERT INTO tipo_cambio (fecha,usd_a_pen) VALUES (CURRENT_DATE,3.80)
   ON CONFLICT (fecha) DO UPDATE SET usd_a_pen = 3.80`);

console.log('\n  Crear borrador\n');
let propId;
{
  // Sin RESEND_API_KEY el correo de verificación no se puede enviar, así
  // que exigirlo dejaría al usuario encerrado: sin poder publicar y sin
  // forma de desbloquearse. Se permite publicar.
  delete process.env.RESEND_API_KEY;
  const r = await req('POST', '/propiedades',
    { operacion: 'venta', tipo: 'departamento', ubicacion_id: ubi }, cookie);
  ok(r.status === 201, 'sin correo configurado NO bloquea publicar', `status ${r.status}`);
  if (r.status === 201) {
    await consulta(`DELETE FROM propiedades WHERE id = $1`, [(await r.json()).propiedad.id]);
  }
}
{
  // Con el correo configurado, la exigencia se activa sola.
  process.env.RESEND_API_KEY = 're_falsa_para_pruebas';
  const r = await req('POST', '/propiedades',
    { operacion: 'venta', tipo: 'departamento', ubicacion_id: ubi }, cookie);
  const b = await r.json();
  ok(r.status === 403 && b.codigo === 'EMAIL_NO_VERIFICADO',
     'con correo configurado SÍ exige verificar', `status ${r.status}`);
  delete process.env.RESEND_API_KEY;
}
await consulta(`UPDATE usuarios SET email_verificado_en = now() WHERE id = $1`, [anaId]);
{
  const r = await req('POST', '/propiedades',
    { operacion: 'venta', tipo: 'departamento', ubicacion_id: ubi }, cookie);
  const b = await r.json();
  propId = b.propiedad?.id;
  ok(r.status === 201, 'crea el borrador con lo mínimo');
  ok(/^WSP-\d+$/.test(b.propiedad.codigo), 'asigna código correlativo', b.propiedad.codigo);
  ok(b.propiedad.estado === 'borrador', 'nace en borrador');
  ok(b.propiedad.slug.endsWith(b.propiedad.codigo.toLowerCase()),
     'el slug lleva el código para ser único', b.propiedad.slug);
}
{
  const r = await req('POST', '/propiedades',
    { operacion: 'venta', tipo: 'departamento', ubicacion_id: '00000000-0000-0000-0000-000000000000' },
    cookie);
  ok(r.status === 422, 'rechaza un distrito inexistente');
}

console.log('\n  Editar\n');
{
  const r = await req('PATCH', `/propiedades/${propId}`, {
    titulo: 'Departamento con vista al parque en Miraflores',
    descripcion: 'Amplio, luminoso y a media cuadra del parque Kennedy.',
    area_m2: 92, dormitorios: 3, banos: 2, piso: 8, antiguedad: 4,
    precio: 190000, moneda: 'USD',
    caracteristicas: ['ascensor', 'piscina'],
  }, cookie);
  const b = await r.json();
  ok(r.status === 200, 'guarda los datos');
  ok(b.propiedad.caracteristicas.length === 2, 'guarda las características', String(b.propiedad.caracteristicas));
  ok(b.propiedad.slug.includes('vista-al-parque'), 'el slug se rehace desde el título', b.propiedad.slug);
  ok(Number(b.propiedad.precio_ref_usd) === 190000, 'calcula precio_ref_usd');
}
{
  const r = await req('PATCH', `/propiedades/${propId}`,
    { caracteristicas: ['ascensor', 'inventada'] }, cookie);
  const b = await r.json();
  ok(r.status === 422 && b.codigo === 'CARACTERISTICA_INVALIDA',
     'rechaza características que no existen', b.error);
}
{
  const r = await req('PATCH', `/propiedades/${propId}`,
    { titulo: 'Vendo depa llamar al 987654321 urgente' }, cookie);
  const b = await r.json();
  ok(b.codigo === 'CONTACTO_EN_TITULO', 'no deja teléfonos en el título', b.error);
}
{
  // Plan gratis: el teléfono en la descripción se pide quitar.
  const r = await req('PATCH', `/propiedades/${propId}`,
    { descripcion: 'Bonito depa, escríbeme al 987 654 321' }, cookie);
  const b = await r.json();
  ok(b.codigo === 'CONTACTO_EN_DESCRIPCION',
     'en el plan gratis pide quitar el teléfono de la descripción');
  ok(b.plan_sugerido === 'dueno-plus', 'y sugiere el plan que sí lo muestra', b.plan_sugerido);
}
{
  const r = await req('PATCH', `/propiedades/${propId}`, { titulo: 'Otro titulo cualquiera' }, cookieBeto);
  ok(r.status === 403, 'otro usuario no puede editar');
}

console.log('\n  Publicar\n');
{
  const r = await req('POST', `/propiedades/${propId}/publicar`, {}, cookie);
  const b = await r.json();
  ok(r.status === 422 && b.codigo === 'AVISO_INCOMPLETO', 'sin fotos no publica');
  ok(Array.isArray(b.faltantes) && b.faltantes.length > 0,
     'devuelve TODOS los faltantes juntos, no el primero',
     b.faltantes.map((f) => f.campo).join(', '));
  ok(b.faltantes.every((f) => typeof f.paso === 'number'),
     'cada faltante dice en qué paso del asistente está');
}
{
  await subirFoto(propId, 'a'); await subirFoto(propId, 'b');
  const r = await req('POST', `/propiedades/${propId}/publicar`, {}, cookie);
  const b = await r.json();
  ok(b.faltantes?.some((f) => f.campo === 'medios'), 'con 2 fotos sigue faltando (mínimo 3)',
     b.faltantes?.find((f) => f.campo === 'medios')?.mensaje);
}
{
  await subirFoto(propId, 'c');
  const r = await req('POST', `/propiedades/${propId}/publicar`, {}, cookie);
  const b = await r.json();
  ok(r.status === 200 && b.estado === 'activo', 'con 3 fotos y precio publica', b.mensaje);

  const p = (await consulta(`SELECT * FROM propiedades WHERE id=$1`, [propId]))[0];
  ok(p.publicado_en !== null, 'marca publicado_en');
  ok(p.vence_en !== null, 'asigna vencimiento a 90 días', String(p.vence_en).slice(0, 10));
}

console.log('\n  Tope del plan gratis (2 avisos)\n');
{
  const crear = async () => {
    const r = await req('POST', '/propiedades',
      { operacion: 'venta', tipo: 'casa', ubicacion_id: ubi }, cookie);
    const id = (await r.json()).propiedad.id;
    await req('PATCH', `/propiedades/${id}`, {
      titulo: 'Casa amplia con jardin en Miraflores', area_m2: 200,
      dormitorios: 4, precio: 300000, moneda: 'USD',
    }, cookie);
    await subirFoto(id, 'x'); await subirFoto(id, 'y'); await subirFoto(id, 'z');
    return { id, r: await req('POST', `/propiedades/${id}/publicar`, {}, cookie) };
  };
  const segundo = await crear();
  ok(segundo.r.status === 200, 'el segundo aviso sí publica (gratis = 2)');

  const tercero = await crear();
  const b = await tercero.r.json();
  ok(tercero.r.status === 402 && b.codigo === 'TOPE_PLAN', 'el tercero da 402', b.error);
  ok(b.plan_sugerido === 'agente-inicial', 'sugiere plan', b.plan_sugerido);

  // Pausar libera cupo.
  await req('POST', `/propiedades/${segundo.id}/pausar`, {}, cookie);
  const otra = await req('POST', `/propiedades/${tercero.id}/publicar`, {}, cookie);
  ok(otra.status === 200, 'al pausar uno, se libera cupo y el tercero publica');
}

console.log('\n  Estados\n');
{
  const r = await req('POST', `/propiedades/${propId}/pausar`, {}, cookie);
  ok(r.status === 200, 'pausa un aviso activo');
  const r2 = await req('POST', `/propiedades/${propId}/pausar`, {}, cookie);
  const b2 = await r2.json();
  ok(r2.status === 409 && b2.codigo === 'ESTADO_SIN_CAMBIO', 'pausar dos veces da 409', b2.error);
  await req('POST', `/propiedades/${propId}/reactivar`, {}, cookie);
}
{
  const r = await req('POST', `/propiedades/${propId}/renovar`, {}, cookie);
  const b = await r.json();
  ok(r.status === 200 && b.vence_en, 'renueva y empuja el vencimiento', b.vence_en);
}

console.log('\n  Duplicar (retención de agentes)\n');
{
  const r = await req('POST', `/propiedades/${propId}/duplicar`, { piso: 12, precio: 205000 }, cookie);
  const b = await r.json();
  ok(r.status === 201, 'duplica el aviso');
  ok(b.propiedad.piso === 12 && Number(b.propiedad.precio) === 205000,
     'aplica los cambios pedidos', `piso ${b.propiedad.piso}, ${b.propiedad.precio}`);
  ok(b.propiedad.dormitorios === 3, 'copia el resto de los datos');
  ok(b.propiedad.estado === 'borrador', 'el duplicado nace en borrador');
  ok(b.propiedad.codigo !== 'WSP-10001' && b.propiedad.slug !== undefined, 'con código y slug propios');
  const fotos = (await consulta(
    `SELECT count(*)::int n FROM medios WHERE propiedad_id=$1`, [b.propiedad.id]))[0].n;
  ok(fotos === 0, 'NO copia las fotos (son de otro inmueble)');
  ok(b.propiedad.caracteristicas.length === 2, 'sí copia las características');
}

console.log('\n  Cerrar y alimentar el índice\n');
{
  const r = await req('POST', `/propiedades/${propId}/cerrar`,
    { motivo: 'vendida', precio_final: 178000, moneda: 'USD' }, cookie);
  const b = await r.json();
  ok(r.status === 200, 'cierra el aviso');
  ok(b.regalo_indice === 3, 'regala consultas de índice por dar el precio real', String(b.regalo_indice));

  const p = (await consulta(`SELECT * FROM propiedades WHERE id=$1`, [propId]))[0];
  ok(p.estado === 'cerrado' && Number(p.precio_final) === 178000,
     'guarda el precio de cierre — esto es lo que vuelve real al índice');
}

console.log('\n  Completitud\n');
{
  const b = await (await req('GET', `/propiedades/${propId}/completitud`, undefined, cookie)).json();
  ok(typeof b.completitud === 'number', 'calcula el porcentaje', `${b.completitud}%`);
  ok(b.listo_para_publicar === true, 'y dice si está listo');
}

console.log('\n  Listado\n');
{
  const b = await (await req('GET', '/propiedades', undefined, cookie)).json();
  ok(Array.isArray(b.resultados) && b.total >= 3, 'lista mis avisos', `${b.total} avisos`);
  ok(b.resultados[0].leads !== undefined, 'trae contadores de leads');
  ok('dias_para_vencer' in b.resultados[0], 'y los días que faltan para vencer');
  const ajeno = await (await req('GET', '/propiedades', undefined, cookieBeto)).json();
  ok(ajeno.total === 0, 'no muestra los avisos de otro usuario');
}

console.log(fallos === 0 ? '\n  ✓ Todo en verde.\n' : `\n  ✗ ${fallos} fallo(s).\n`);
await db.close();
process.exit(fallos === 0 ? 0 : 1);
