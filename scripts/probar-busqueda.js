/**
 * Búsqueda pública: filtros, rangos entre monedas, facetas, orden.
 *
 *   node --experimental-strip-types scripts/probar-busqueda.js
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
  await db.query(`INSERT INTO migraciones (nombre) VALUES ($1) ON CONFLICT DO NOTHING`, [archivo]);
}
const consulta = async (t, p) => (await db.query(t, p)).rows;
usarBackend(consulta);

const subidos = new Map();
usarProveedor({ async buscar(id) { return subidos.get(id) ?? null; }, async borrar(id) { subidos.delete(id); } });

let fallos = 0;
const ok = (cond, nombre, detalle = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}${detalle ? ' — ' + detalle : ''}`);
  if (!cond) fallos++;
};
const JSONH = { 'content-type': 'application/json' };
const req = (m, ruta, body, ck) =>
  app.request(`/api/v1${ruta}`, {
    method: m, headers: ck ? { ...JSONH, cookie: ck } : JSONH,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const json = async (ruta) => (await app.request(`/api/v1${ruta}`)).json();

// --- usuarios: un agente y un propietario ---
const rAg = await req('POST', '/cuentas/registro',
  { email: 'ag@x.com', password: 'una frase larga', nombre: 'Ana Agente', rol: 'agente' });
const ckAg = (rAg.headers.get('set-cookie') ?? '').split(';')[0];
const agId = (await rAg.json()).usuario.id;

const rDu = await req('POST', '/cuentas/registro',
  { email: 'du@x.com', password: 'una frase larga', nombre: 'Beto Dueño', rol: 'propietario' });
const ckDu = (rDu.headers.get('set-cookie') ?? '').split(';')[0];
const duId = (await rDu.json()).usuario.id;
await consulta(`UPDATE usuarios SET email_verificado_en = now()`);
await consulta(`UPDATE usuarios SET verificado = true WHERE id = $1`, [agId]);

// Plan con más avisos para el agente.
const plan = (await consulta(`SELECT id FROM planes WHERE slug='agente-pro'`))[0].id;
await consulta(`INSERT INTO suscripciones (usuario_id,plan_id,estado,fin)
                VALUES ($1,$2,'activa', now() + interval '30 days')`, [agId, plan]);

const idDe = async (slug) =>
  (await consulta(`SELECT id FROM ubicaciones WHERE slug=$1`, [slug]))[0].id;

async function publicar(ck, datos) {
  const r = await req('POST', '/propiedades',
    { operacion: datos.operacion ?? 'venta', tipo: datos.tipo ?? 'departamento',
      ubicacion_id: await idDe(datos.distrito) }, ck);
  const id = (await r.json()).propiedad.id;
  await req('PATCH', `/propiedades/${id}`, {
    titulo: datos.titulo, area_m2: datos.area, dormitorios: datos.dorm,
    banos: datos.banos ?? 2, precio: datos.precio, moneda: datos.moneda ?? 'USD',
    descripcion: datos.descripcion ?? 'Departamento luminoso y bien ubicado.',
    caracteristicas: datos.caract ?? [],
  }, ck);
  for (const n of ['a', 'b', 'c']) {
    const pid = `wasipe/propiedades/${id}/${n}`;
    subidos.set(pid, { public_id: pid, secure_url: `https://x/${n}.jpg`,
      width: 1600, height: 1200, bytes: 4e5, format: 'jpg', phash: `${id}-${n}` });
    await req('POST', `/medios/${id}`, { public_id: pid }, ck);
  }
  await req('POST', `/propiedades/${id}/publicar`, {}, ck);
  return id;
}

console.log('\n  Sembrando avisos\n');
await publicar(ckAg, { distrito: 'miraflores', titulo: 'Departamento con vista al parque Kennedy',
  area: 92, dorm: 3, precio: 185000, caract: ['ascensor', 'piscina'] });
await publicar(ckAg, { distrito: 'miraflores', titulo: 'Departamento pequeño cerca al malecon',
  area: 55, dorm: 1, precio: 120000, caract: ['ascensor'] });
await publicar(ckAg, { distrito: 'san-isidro', titulo: 'Departamento amplio en San Isidro centro',
  area: 140, dorm: 4, precio: 420000, caract: ['ascensor', 'gimnasio'] });
await publicar(ckAg, { distrito: 'barranco', titulo: 'Casa bohemia con jardin en Barranco',
  tipo: 'casa', area: 210, dorm: 4, precio: 390000 });
// Uno en soles, para probar el rango entre monedas.
await publicar(ckDu, { distrito: 'surquillo', titulo: 'Departamento en Surquillo bien conectado',
  area: 70, dorm: 2, precio: 570000, moneda: 'PEN' });
// Alquiler.
await publicar(ckAg, { distrito: 'miraflores', operacion: 'alquiler',
  titulo: 'Departamento amoblado en alquiler Miraflores', area: 80, dorm: 2, precio: 1200 });
ok(true, '6 avisos publicados');

console.log('\n  Búsqueda básica\n');
{
  const b = await json('/buscar');
  ok(b.total === 6, 'sin filtros devuelve todo lo activo', `${b.total}`);
  ok(b.resultados[0].portada !== null, 'trae portada');
  ok(typeof b.resultados[0].precio_m2 === 'number', 'calcula precio por m²',
     `US$${b.resultados[0].precio_m2}/m²`);
  ok(b.paginas === 1 && b.por_pagina === 24, 'pagina correctamente');
}
{
  const b = await json('/buscar?operacion=alquiler');
  ok(b.total === 1, 'filtra por operación', `${b.total} en alquiler`);
}
{
  const b = await json('/buscar?tipo=casa');
  ok(b.total === 1 && b.resultados[0].tipo === 'casa', 'filtra por tipo');
}
{
  const b = await json('/buscar?ubicaciones=miraflores');
  ok(b.total === 3, 'filtra por distrito', `${b.total} en Miraflores`);
}
{
  const b = await json('/buscar?distrito=miraflores');
  ok(b.total === 3, 'acepta el parámetro viejo `distrito` (compatibilidad)');
}
{
  const b = await json('/buscar?ubicaciones=miraflores,barranco');
  ok(b.total === 4, 'acepta varios distritos', `${b.total}`);
}

console.log('\n  Precio entre monedas — el fallo documentado de Urbania\n');
{
  // El de Surquillo son S/570,000 ≈ US$150,000. Un rango en dólares
  // tiene que encontrarlo aunque esté guardado en soles.
  const b = await json('/buscar?precio_min=140000&precio_max=160000');
  const surq = b.resultados.find((r) => r.distrito === 'Surquillo');
  ok(!!surq, 'un aviso en SOLES aparece en un rango pedido en DÓLARES',
     surq ? `S/${surq.precio} = US$${surq.precio_ref_usd}` : 'no apareció');
  ok(b.resultados.every((r) => r.precio_ref_usd >= 140000 && r.precio_ref_usd <= 160000),
     'y todos los resultados caen dentro del rango');
}
{
  const b = await json('/buscar?precio_max=200000');
  ok(b.total === 4, 'precio máximo filtra bien', `${b.total} bajo US$200k`);
}
{
  const r = await app.request('/api/v1/buscar?precio_min=300000&precio_max=100000');
  const b = await r.json();
  ok(r.status === 422 && b.codigo === 'RANGO_INVALIDO', 'rechaza un rango invertido', b.error);
}

console.log('\n  Filtros del inmueble\n');
{
  const b = await json('/buscar?dormitorios_min=3');
  ok(b.total === 3, 'dormitorios mínimo', `${b.total} con 3+`);
}
{
  const b = await json('/buscar?area_min=100');
  ok(b.total === 2, 'área mínima', `${b.total} sobre 100 m²`);
}
{
  const b = await json('/buscar?caracteristicas=ascensor');
  ok(b.total === 3, 'una característica', `${b.total} con ascensor`);
  const b2 = await json('/buscar?caracteristicas=ascensor,piscina');
  ok(b2.total === 1, 'varias características se combinan con Y', `${b2.total}`);
}

console.log('\n  Dueño directo vs agente — el filtro que la competencia no tiene\n');
{
  const b = await json('/buscar?publica=dueno');
  ok(b.total === 1 && b.resultados[0].publica_rol === 'propietario',
     'filtra solo dueño directo', `${b.total}`);
  const b2 = await json('/buscar?publica=agente');
  ok(b2.total === 5, 'o solo agentes', `${b2.total}`);
}
{
  const b = await json('/buscar?solo_verificados=true');
  ok(b.total === 5 && b.resultados.every((r) => r.publica_verificado),
     'solo verificados', `${b.total}`);
}

console.log('\n  Texto libre\n');
{
  const b = await json('/buscar?q=malecon');
  ok(b.total === 1, 'busca en el título', b.resultados[0]?.titulo?.slice(0, 40));
}
{
  const b = await json('/buscar?q=jardin');
  ok(b.total === 1, 'y encuentra sin tilde lo escrito sin tilde', `${b.total}`);
}

console.log('\n  Orden\n');
{
  const b = await json('/buscar?orden=precio_asc');
  const precios = b.resultados.map((r) => r.precio_ref_usd);
  ok(precios.every((p, i) => i === 0 || p >= precios[i - 1]),
     'precio ascendente ordena bien entre monedas', precios.slice(0, 3).join(' < '));
}
{
  const b = await json('/buscar?orden=precio_desc');
  ok(b.resultados[0].precio_ref_usd === 420000, 'precio descendente');
}
{
  const b = await json('/buscar?orden=m2_asc');
  ok(b.resultados[0].precio_m2 <= b.resultados[1].precio_m2, 'orden por precio del m²',
     `${b.resultados[0].precio_m2} ≤ ${b.resultados[1].precio_m2}`);
}

console.log('\n  Badge vs mercado\n');
{
  const b = await json('/buscar?ubicaciones=miraflores&orden=precio_desc');
  const conBadge = b.resultados.filter((r) => r.vs_mercado !== null);
  ok(conBadge.length > 0, 'los resultados traen el badge vs mercado',
     `${conBadge[0].vs_mercado}% vs el índice`);
  ok(b.resumen?.precio_mediano > 0, 'y un resumen con la mediana',
     `US$${b.resumen.precio_mediano}`);
}

console.log('\n  Facetas\n');
{
  const f = await json('/buscar/facetas');
  ok(f.tipo.departamento === 5 && f.tipo.casa === 1, 'cuenta por tipo',
     JSON.stringify(f.tipo));
  ok(Object.keys(f.dormitorios).length > 1, 'cuenta por dormitorios',
     JSON.stringify(f.dormitorios));
  ok(f.caracteristicas.ascensor === 3, 'cuenta características', String(f.caracteristicas.ascensor));
}
{
  // Al filtrar por tipo, la faceta de tipo debe seguir mostrando los otros:
  // si no, no habría forma de cambiar de opinión.
  const f = await json('/buscar/facetas?tipo=casa');
  ok(f.tipo.departamento === 5, 'la faceta ignora su propio filtro', JSON.stringify(f.tipo));
}

console.log('\n  Errores\n');
{
  const r = await app.request('/api/v1/buscar?ubicaciones=narnia');
  const b = await r.json();
  ok(r.status === 422 && b.codigo === 'UBICACION_DESCONOCIDA',
     'un distrito inexistente da 422, no se ignora en silencio', b.error);
}
{
  const b = await json('/buscar/caracteristicas');
  ok(Object.keys(b.grupos).length >= 4, 'el catálogo de características viene agrupado',
     Object.keys(b.grupos).join(', '));
}

console.log('\n  Solo avisos activos\n');
{
  const uno = (await consulta(`SELECT id FROM propiedades LIMIT 1`))[0].id;
  await consulta(`UPDATE propiedades SET estado='pausado' WHERE id=$1`, [uno]);
  const b = await json('/buscar');
  ok(b.total === 5, 'un aviso pausado desaparece de la búsqueda', `${b.total}`);
  await consulta(`UPDATE propiedades SET estado='activo' WHERE id=$1`, [uno]);
}

console.log(fallos === 0 ? '\n  ✓ Todo en verde.\n' : `\n  ✗ ${fallos} fallo(s).\n`);
await db.close();
process.exit(fallos === 0 ? 0 : 1);
