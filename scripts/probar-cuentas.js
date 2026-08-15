/**
 * Prueba de punta a punta del módulo de cuentas, contra Postgres real
 * (PGlite en memoria). Registra, ingresa, edita perfil, cambia contraseña
 * y comprueba que las sesiones se invalidan.
 *
 *   node --experimental-strip-types scripts/probar-cuentas.js
 */
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dividirSql } from '../src/db/dividir-sql.js';

process.env.JWT_SECRET ??= 'secreto-solo-para-pruebas-no-usar-en-produccion';

const { usarBackend } = await import('../src/db/cliente.ts');
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

// Conectamos la app a PGlite.
usarBackend(async (texto, params) => (await db.query(texto, params)).rows);

let fallos = 0;
const ok = (cond, nombre, detalle = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}${detalle ? ' — ' + detalle : ''}`);
  if (!cond) fallos++;
};

const JSONH = { 'content-type': 'application/json' };
const post = (ruta, body, cookie) =>
  app.request(`/api/v1${ruta}`, {
    method: 'POST',
    headers: cookie ? { ...JSONH, cookie } : JSONH,
    body: JSON.stringify(body ?? {}),
  });
const patch = (ruta, body, cookie) =>
  app.request(`/api/v1${ruta}`, {
    method: 'PATCH',
    headers: cookie ? { ...JSONH, cookie } : JSONH,
    body: JSON.stringify(body ?? {}),
  });
const get = (ruta, cookie) =>
  app.request(`/api/v1${ruta}`, { headers: cookie ? { cookie } : {} });
const galleta = (r) => (r.headers.get('set-cookie') ?? '').split(';')[0];

console.log('\n  Salud\n');
{
  const r = await get('/salud');
  const b = await r.json();
  ok(r.status === 200 && b.bd === 'conectada', 'ahora sí reporta base conectada', b.bd);
}

console.log('\n  Registro\n');
let cookieAna = '';
{
  const r = await post('/cuentas/registro', {
    email: 'Ana@Correo.com', password: 'una frase larga', nombre: 'Ana Quispe',
    rol: 'agente', telefono: '+51987654321',
  });
  const b = await r.json();
  cookieAna = galleta(r);
  ok(r.status === 201, 'crea la cuenta', `status ${r.status}`);
  ok(b.usuario?.email === 'ana@correo.com', 'guarda el correo en minúsculas', b.usuario?.email);
  ok(cookieAna.startsWith('wasipe_sesion='), 'queda logueada al registrarse');
  const set = r.headers.get('set-cookie') ?? '';
  ok(set.includes('HttpOnly') && set.includes('Secure') && set.includes('SameSite=Lax'),
     'cookie httpOnly + Secure + SameSite=Lax');
}
{
  const r = await post('/cuentas/registro', {
    email: 'ana@correo.com', password: 'otra frase larga', nombre: 'Otra',
  });
  const b = await r.json();
  ok(r.status === 409 && b.codigo === 'EMAIL_DUPLICADO', 'rechaza correo duplicado', b.error);
  ok(b.campo === 'email', 'indica el campo para que el front lo enfoque');
}
{
  const r = await post('/cuentas/registro', {
    email: 'hacker@x.com', password: 'una frase larga', nombre: 'Hacker', rol: 'admin',
  });
  const b = await r.json();
  ok(r.status === 422, 'NO deja registrarse como admin', b.error);
}
{
  const r = await post('/cuentas/registro', {
    email: 'corta@x.com', password: 'abc', nombre: 'Corta',
  });
  ok((await r.json()).codigo === 'VALIDACION', 'rechaza contraseña de menos de 8');
}

console.log('\n  Ingreso\n');
{
  const r = await post('/cuentas/ingresar', { email: 'ANA@CORREO.COM', password: 'una frase larga' });
  ok(r.status === 200, 'ingresa ignorando mayúsculas del correo');
  cookieAna = galleta(r);
}
{
  const r = await post('/cuentas/ingresar', { email: 'ana@correo.com', password: 'equivocada' });
  const b = await r.json();
  ok(r.status === 401 && b.codigo === 'CREDENCIALES_INVALIDAS', 'rechaza contraseña incorrecta');
  const r2 = await post('/cuentas/ingresar', { email: 'noexiste@x.com', password: 'equivocada' });
  const b2 = await r2.json();
  ok(b.error === b2.error, 'mismo mensaje si el correo no existe (no enumera cuentas)', b2.error);
}

console.log('\n  Sesión\n');
{
  const r = await get('/cuentas/yo', cookieAna);
  const b = await r.json();
  ok(r.status === 200, 'devuelve la sesión');
  ok(b.usuario?.nombre === 'Ana Quispe', 'trae el usuario');
  ok(b.plan?.slug === 'gratis' && b.plan?.tope_avisos === 2,
     'sin suscripción cae al plan Gratis con 2 avisos', `${b.plan?.tope_avisos} avisos`);
  ok(b.perfil_completitud?.puede_publicar === false,
     'no puede publicar hasta confirmar el correo');
  ok(b.perfil_completitud?.siguiente_paso?.campo === 'email',
     'el siguiente paso es confirmar el correo');
  ok(typeof b.perfil_completitud?.porcentaje === 'number',
     'calcula el porcentaje de completitud', `${b.perfil_completitud?.porcentaje}%`);
}
{
  const r = await get('/cuentas/yo');
  ok(r.status === 401, 'sin cookie no hay sesión');
}

console.log('\n  Perfil — escalada de privilegios\n');
{
  const r = await patch('/perfil', { bio: 'Trabajo en Miraflores y Barranco.' }, cookieAna);
  const b = await r.json();
  ok(r.status === 200 && b.perfil?.bio?.includes('Miraflores'), 'guarda la bio');
}
{
  // El intento clásico: mandar campos de más en el PATCH.
  await patch('/perfil', {
    bio: 'x', rol: 'admin', verificado: true, estado: 'activo', version_token: 999,
  }, cookieAna);
  const b = await (await get('/cuentas/yo', cookieAna)).json();
  ok(b.usuario.rol === 'agente', 'NO puede ascenderse a admin por el PATCH', `rol: ${b.usuario.rol}`);
  ok(b.usuario.verificado === false, 'NO puede auto-verificarse');
}
{
  const r = await patch('/perfil', { whatsapp: '999' }, cookieAna);
  ok((await r.json()).codigo === 'VALIDACION', 'valida el formato de celular peruano');
}

console.log('\n  Verificación de correo\n');
{
  const t = (await db.query(
    `SELECT token_hash FROM tokens_cuenta WHERE tipo='verificar_email' LIMIT 1`)).rows[0];
  ok(!!t, 'se generó un token de verificación al registrarse');
  ok(t.token_hash.length === 64, 'en la base se guarda el hash SHA-256, no el token');

  const r = await post('/cuentas/verificar-email/confirmar', { token: 'inventado-que-no-existe' });
  ok(r.status === 410, 'un token inválido da 410');
}

console.log('\n  Recuperar contraseña\n');
{
  const r1 = await post('/cuentas/recuperar', { email: 'ana@correo.com' });
  const r2 = await post('/cuentas/recuperar', { email: 'noexiste@x.com' });
  const b1 = await r1.json(); const b2 = await r2.json();
  ok(r1.status === 200 && r2.status === 200 && b1.mensaje === b2.mensaje,
     'responde igual exista o no la cuenta', b1.mensaje);
}

console.log('\n  Cambio de contraseña y revocación\n');
{
  const r = await patch('/cuentas/password',
    { password_actual: 'equivocada', password_nueva: 'otra frase larga' }, cookieAna);
  ok((await r.json()).codigo === 'PASSWORD_INCORRECTA', 'exige la contraseña actual correcta');
}
{
  const r = await patch('/cuentas/password',
    { password_actual: 'una frase larga', password_nueva: 'nueva frase mas larga' }, cookieAna);
  ok(r.status === 200, 'cambia la contraseña');

  const r2 = await get('/cuentas/yo', cookieAna);
  ok(r2.status === 401, 'la sesión vieja queda invalidada (version_token)', `status ${r2.status}`);

  const r3 = await post('/cuentas/ingresar',
    { email: 'ana@correo.com', password: 'nueva frase mas larga' });
  ok(r3.status === 200, 'y se puede entrar con la nueva');
  cookieAna = galleta(r3);
}
{
  const r = await post('/cuentas/salir-todo', {}, cookieAna);
  ok(r.status === 200, 'salir-todo responde ok');
  const r2 = await get('/cuentas/yo', cookieAna);
  ok(r2.status === 401, 'y deja fuera a la sesión actual');
}

console.log('\n  Suspensión\n');
{
  await db.query(`UPDATE usuarios SET estado='suspendido', motivo_suspension='prueba'
                  WHERE lower(email)='ana@correo.com'`);
  const r = await post('/cuentas/ingresar',
    { email: 'ana@correo.com', password: 'nueva frase mas larga' });
  const b = await r.json();
  ok(r.status === 403 && b.codigo === 'CUENTA_SUSPENDIDA', 'una cuenta suspendida no ingresa', b.error);
}

console.log('\n  Límite de intentos\n');
{
  await db.query(`DELETE FROM intentos_auth`);
  let bloqueado = false;
  for (let i = 0; i < 12; i++) {
    const r = await post('/cuentas/ingresar', { email: 'otro@x.com', password: 'mala' });
    if (r.status === 429) { bloqueado = true; break; }
  }
  ok(bloqueado, 'tras varios intentos fallidos devuelve 429');
}

console.log(fallos === 0 ? '\n  ✓ Todo en verde.\n' : `\n  ✗ ${fallos} fallo(s).\n`);
await db.close();
process.exit(fallos === 0 ? 0 : 1);
