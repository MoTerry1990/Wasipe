/**
 * Comprueba que las garantías del esquema se cumplen de verdad.
 * No basta con que las tablas se creen: lo que importa es que la base
 * impida lo que tiene que impedir.
 *
 *   node scripts/probar-invariantes.js
 */
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dividirSql } from '../src/db/dividir-sql.js';

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

let fallos = 0;
const ok = (cond, nombre, detalle = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}${detalle ? ' — ' + detalle : ''}`);
  if (!cond) fallos++;
};
/** Espera que la operación sea RECHAZADA por la base. */
async function rechaza(nombre, fn) {
  try { await fn(); ok(false, nombre, 'la base lo permitió y no debía'); }
  catch (e) { ok(true, nombre, e.message.split('\n')[0].slice(0, 60)); }
}
const uno = async (q, p = []) => (await db.query(q, p)).rows[0];

console.log('\n  Preparando datos\n');

const { id: ubi } = await uno(
  `INSERT INTO ubicaciones (departamento, provincia, distrito, slug, alias)
   VALUES ('Lima','Lima','Miraflores','miraflores', ARRAY['Miraflores'])
   ON CONFLICT (slug) DO UPDATE SET distrito = EXCLUDED.distrito
   RETURNING id`);
await db.query(
  `INSERT INTO ubicaciones (departamento, provincia, distrito, slug, alias)
   VALUES ('Lima','Lima','Santiago de Surco','santiago-de-surco', ARRAY['Surco','Santiago de Surco'])
   ON CONFLICT (slug) DO UPDATE SET distrito = EXCLUDED.distrito
   `);
await db.query(
  `INSERT INTO ubicaciones (departamento, provincia, distrito, slug)
   VALUES ('Lima','Lima','Jesús María','jesus-maria')
   ON CONFLICT (slug) DO UPDATE SET distrito = EXCLUDED.distrito
   `);

const { id: usr } = await uno(
  `INSERT INTO usuarios (email, password_hash, rol, nombre)
   VALUES ('Ana@Correo.com','x','agente','Ana Quispe') RETURNING id`);

await db.query(`INSERT INTO tipo_cambio (fecha, usd_a_pen) VALUES (CURRENT_DATE, 3.80)
   ON CONFLICT (fecha) DO UPDATE SET usd_a_pen = 3.80`);

const { id: prop } = await uno(
  `INSERT INTO propiedades (codigo, slug, usuario_id, operacion, tipo, titulo, ubicacion_id,
                            precio, moneda, area_m2, estado)
   VALUES ('WSP-1','depa-miraflores-wsp1',$1,'venta','departamento',
           'Departamento en Miraflores con vista al parque',$2, 190000,'USD', 92,'borrador')
   RETURNING id`, [usr, ubi]);
console.log('  datos listos\n');

console.log('  Unicidad y normalización\n');
await rechaza('email único ignorando mayúsculas', () =>
  db.query(`INSERT INTO usuarios (email,password_hash,rol,nombre)
            VALUES ('ANA@correo.com','x','agente','Otra')`));
await rechaza('slug de aviso único', () =>
  db.query(`INSERT INTO propiedades (codigo,slug,usuario_id,operacion,tipo,titulo,ubicacion_id)
            VALUES ('WSP-2','depa-miraflores-wsp1',$1,'venta','casa','Otro titulo largo aqui',$2)`,
           [usr, ubi]));

console.log('\n  Precio y moneda\n');
{
  const r = await uno(`SELECT precio, moneda, precio_ref_usd FROM propiedades WHERE id=$1`, [prop]);
  ok(Number(r.precio_ref_usd) === 190000, 'aviso en USD: precio_ref_usd = precio', String(r.precio_ref_usd));
}
{
  const { id } = await uno(
    `INSERT INTO propiedades (codigo,slug,usuario_id,operacion,tipo,titulo,ubicacion_id,precio,moneda)
     VALUES ('WSP-3','casa-surco-wsp3',$1,'alquiler','casa','Casa amplia en Surco con jardin',$2, 3800,'PEN')
     RETURNING id`, [usr, ubi]);
  const r = await uno(`SELECT precio_ref_usd FROM propiedades WHERE id=$1`, [id]);
  ok(Number(r.precio_ref_usd) === 1000, 'aviso en PEN se convierte a USD con el tipo de cambio',
     `S/3800 / 3.80 = US$${r.precio_ref_usd}`);
}
await rechaza('rechaza precio negativo', () =>
  db.query(`UPDATE propiedades SET precio = -5 WHERE id=$1`, [prop]));
await rechaza('rechaza moneda inválida', () =>
  db.query(`UPDATE propiedades SET moneda = 'EUR' WHERE id=$1`, [prop]));

console.log('\n  Fotos\n');
await db.query(
  `INSERT INTO medios (propiedad_id, public_id, url, es_portada)
   VALUES ($1,'a','http://x/a.jpg', true)`, [prop]);
await rechaza('solo una portada por aviso', () =>
  db.query(`INSERT INTO medios (propiedad_id, public_id, url, es_portada)
            VALUES ($1,'b','http://x/b.jpg', true)`, [prop]));
await db.query(
  `INSERT INTO medios (propiedad_id, public_id, url) VALUES ($1,'c','http://x/c.jpg')`, [prop]);
{
  const r = await uno(`SELECT count(*)::int n FROM medios WHERE propiedad_id=$1`, [prop]);
  ok(r.n === 2, 'se pueden tener varias fotos sin portada duplicada', `${r.n} fotos`);
}

console.log('\n  Características (trigger de sincronización)\n');
{
  const { id: c1 } = await uno(
    `INSERT INTO caracteristicas (slug,nombre,grupo) VALUES ('ascensor','Ascensor','edificio')
     ON CONFLICT (slug) DO UPDATE SET nombre=EXCLUDED.nombre RETURNING id`);
  const { id: c2 } = await uno(
    `INSERT INTO caracteristicas (slug,nombre,grupo) VALUES ('piscina','Piscina','exterior')
     ON CONFLICT (slug) DO UPDATE SET nombre=EXCLUDED.nombre RETURNING id`);
  await db.query(`INSERT INTO propiedad_caracteristicas VALUES ($1,$2),($1,$3)`, [prop, c1, c2]);
  const r = await uno(`SELECT caracteristicas FROM propiedades WHERE id=$1`, [prop]);
  ok(JSON.stringify(r.caracteristicas) === JSON.stringify(['ascensor', 'piscina']),
     'el array se llena solo al insertar en la tabla puente', JSON.stringify(r.caracteristicas));

  await db.query(`DELETE FROM propiedad_caracteristicas WHERE caracteristica_id=$1`, [c2]);
  const r2 = await uno(`SELECT caracteristicas FROM propiedades WHERE id=$1`, [prop]);
  ok(JSON.stringify(r2.caracteristicas) === JSON.stringify(['ascensor']),
     'y se limpia solo al borrar', JSON.stringify(r2.caracteristicas));
}

console.log('\n  Búsqueda en español\n');
{
  const r = await uno(
    `SELECT distrito FROM ubicaciones
     WHERE sin_tildes(distrito) ILIKE sin_tildes($1) LIMIT 1`, ['%jesus maria%']);
  ok(r?.distrito === 'Jesús María', 'encuentra "Jesús María" escribiendo "jesus maria"', r?.distrito);
}
{
  const r = await uno(`SELECT distrito FROM ubicaciones WHERE 'Surco' = ANY(alias) LIMIT 1`);
  ok(r?.distrito === 'Santiago de Surco', '"Surco" resuelve a "Santiago de Surco" por alias', r?.distrito);
}
{
  const r = await uno(
    `SELECT titulo FROM propiedades
     WHERE busqueda_tsv @@ plainto_tsquery('spanish', sin_tildes('vista parque')) LIMIT 1`);
  ok(!!r, 'la columna generada tsvector indexa el título', r?.titulo?.slice(0, 40));
}

console.log('\n  Estados y reglas de negocio\n');
await rechaza('un aviso activo no puede quedar sin precio', () =>
  db.query(`UPDATE propiedades SET estado='activo', publicado_en=now(), precio=NULL WHERE id=$1`, [prop]));
await rechaza('rechaza un estado que no existe', () =>
  db.query(`UPDATE propiedades SET estado='inventado' WHERE id=$1`, [prop]));
await db.query(`UPDATE propiedades SET estado='activo', publicado_en=now() WHERE id=$1`, [prop]);
ok(true, 'activo con precio y publicado_en sí se permite');

console.log('\n  Destaques sin solapamiento\n');
await db.query(
  `INSERT INTO destaques (propiedad_id,tipo,inicio,fin)
   VALUES ($1,'destacado', now(), now() + interval '7 days')`, [prop]);
await rechaza('no se puede vender el mismo destaque solapado', () =>
  db.query(`INSERT INTO destaques (propiedad_id,tipo,inicio,fin)
            VALUES ($1,'destacado', now() + interval '3 days', now() + interval '10 days')`, [prop]));
await db.query(
  `INSERT INTO destaques (propiedad_id,tipo,inicio,fin)
   VALUES ($1,'destacado', now() + interval '8 days', now() + interval '15 days')`, [prop]);
ok(true, 'sí se permite un destaque posterior que no se solapa');
await db.query(
  `INSERT INTO destaques (propiedad_id,tipo,inicio,fin)
   VALUES ($1,'super', now(), now() + interval '7 days')`, [prop]);
ok(true, 'sí se permite otro TIPO de destaque en las mismas fechas');

console.log('\n  Planes y suscripciones\n');
{
  const { id: plan } = await uno(
    `INSERT INTO planes (slug,nombre,precio,periodo,tope_avisos)
     VALUES ('agente','Agente',139,'mensual',20)
     ON CONFLICT (slug) DO UPDATE SET precio = EXCLUDED.precio RETURNING id`);
  await db.query(
    `INSERT INTO suscripciones (usuario_id,plan_id,estado,fin)
     VALUES ($1,$2,'activa', now() + interval '30 days')`, [usr, plan]);
  await rechaza('una sola suscripción vigente por usuario', () =>
    db.query(`INSERT INTO suscripciones (usuario_id,plan_id,estado,fin)
              VALUES ($1,$2,'activa', now() + interval '30 days')`, [usr, plan]));
  await rechaza('la suscripción necesita titular (usuario o agencia, no ambos)', () =>
    db.query(`INSERT INTO suscripciones (plan_id,estado,fin)
              VALUES ($1,'activa', now() + interval '30 days')`, [plan]));
  await rechaza('fin tiene que ser posterior a inicio', () =>
    db.query(`INSERT INTO suscripciones (usuario_id,plan_id,estado,inicio,fin)
              VALUES ($1,$2,'cancelada', now(), now() - interval '1 day')`, [usr, plan]));
}

console.log('\n  Pagos idempotentes\n');
{
  await db.query(
    `INSERT INTO pagos (usuario_id,concepto,monto,proveedor,proveedor_ref,estado)
     VALUES ($1,'plan',139,'culqi','chr_123','pagado')`, [usr]);
  await rechaza('el mismo cargo de Culqi no se registra dos veces', () =>
    db.query(`INSERT INTO pagos (usuario_id,concepto,monto,proveedor,proveedor_ref,estado)
              VALUES ($1,'plan',139,'culqi','chr_123','pagado')`, [usr]));
}

console.log('\n  Agencias\n');
{
  const { id: ag } = await uno(
    `INSERT INTO agencias (nombre,slug,ruc) VALUES ('Grupo Andino','grupo-andino','20123456789') RETURNING id`);
  await rechaza('RUC debe tener 11 dígitos', () =>
    db.query(`INSERT INTO agencias (nombre,slug,ruc) VALUES ('Otra','otra','123')`));
  await db.query(`INSERT INTO agencia_miembros VALUES ($1,$2,'dueno')`, [ag, usr]);
  const { id: usr2 } = await uno(
    `INSERT INTO usuarios (email,password_hash,rol,nombre)
     VALUES ('b@c.com','x','agente','Beto') RETURNING id`);
  await rechaza('una agencia tiene un solo dueño', () =>
    db.query(`INSERT INTO agencia_miembros VALUES ($1,$2,'dueno')`, [ag, usr2]));
  await db.query(`INSERT INTO agencia_miembros VALUES ($1,$2,'agente')`, [ag, usr2]);
  ok(true, 'sí admite más miembros con otro cargo');
}

console.log('\n  Borrado en cascada\n');
{
  const antes = (await uno(`SELECT count(*)::int n FROM medios WHERE propiedad_id=$1`, [prop])).n;
  await db.query(`DELETE FROM propiedades WHERE id=$1`, [prop]);
  const despues = (await uno(`SELECT count(*)::int n FROM medios WHERE propiedad_id=$1`, [prop])).n;
  ok(antes > 0 && despues === 0, 'al borrar un aviso se van sus fotos', `${antes} → ${despues}`);
  const pagos = (await uno(`SELECT count(*)::int n FROM pagos`)).n;
  ok(pagos === 1, 'los pagos NO se borran nunca (registro contable)', `${pagos} pago(s)`);
}

console.log(fallos === 0 ? '\n  ✓ Todas las garantías se cumplen.\n' : `\n  ✗ ${fallos} fallo(s).\n`);
await db.close();
process.exit(fallos === 0 ? 0 : 1);
