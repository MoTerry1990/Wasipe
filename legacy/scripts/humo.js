/**
 * Prueba de humo: levanta la app de Hono en memoria y le pega,
 * sin necesidad de Netlify ni de base de datos.
 *   node scripts/humo.js
 */
import { app } from '../src/app.ts';
import { hashearPassword, verificarPassword, nuevoToken, hashToken } from '../src/lib/auth.ts';
import { puede } from '../src/lib/permisos.ts';

let fallos = 0;
const ok = (cond, nombre, detalle = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}${detalle ? ' — ' + detalle : ''}`);
  if (!cond) fallos++;
};

console.log('\n  API\n');
{
  const r = await app.request('/api/v1/salud');
  const b = await r.json();
  ok(r.status === 503, 'GET /salud responde 503 sin base', `status ${r.status}`);
  ok(b.bd === 'sin-conexion', 'informa bd sin-conexion', b.bd);
  ok(b.servicios !== undefined, 'lista el estado de los servicios');
}
{
  const r = await app.request('/api/v1/no-existe');
  const b = await r.json();
  ok(r.status === 404 && b.codigo === 'NO_ENCONTRADO', '404 con mensaje en español', b.error);
}
{
  const r = await app.request('/api/v1/cuentas/ingresar', { method: 'POST', body: '{}' });
  const b = await r.json();
  ok(r.status === 400 && b.codigo === 'CONTENT_TYPE', 'rechaza mutación sin content-type JSON');
}

console.log('\n  Contraseñas\n');
{
  const h = await hashearPassword('una frase larga y segura');
  ok(h.startsWith('scrypt$'), 'hashea con scrypt');
  ok(await verificarPassword('una frase larga y segura', h), 'verifica la correcta');
  ok(!(await verificarPassword('otra cosa', h)), 'rechaza la incorrecta');
  const h2 = await hashearPassword('una frase larga y segura');
  ok(h !== h2, 'dos hashes de la misma clave son distintos (salt)');
  try {
    await hashearPassword('corta');
    ok(false, 'rechaza contraseñas de menos de 8');
  } catch (e) {
    ok(e.estado === 422, 'rechaza contraseñas de menos de 8', e.message);
  }
}

console.log('\n  Tokens\n');
{
  const { token, hash } = nuevoToken();
  ok(token.length >= 40, 'token de 32 bytes en base64url');
  ok(hash === hashToken(token), 'el hash es reproducible');
  ok(hash !== token, 'en la base se guarda el hash, no el token');
}

console.log('\n  Permisos\n');
{
  const base = { estado: 'activo', email_verificado: true };
  const comprador = { id: 'u1', rol: 'comprador', ...base };
  const propietario = { id: 'u2', rol: 'propietario', ...base };
  const moderador = { id: 'u3', rol: 'moderador', ...base };
  const admin = { id: 'u4', rol: 'admin', ...base };
  const suspendido = { id: 'u5', rol: 'admin', estado: 'suspendido', email_verificado: true };

  ok(puede(comprador, 'favorito.gestionar'), 'comprador puede guardar favoritos');
  ok(puede(comprador, 'aviso.contactar'), 'comprador puede contactar');
  ok(!puede(comprador, 'aviso.crear'), 'comprador NO puede publicar');
  ok(puede(propietario, 'aviso.crear'), 'propietario puede publicar');
  ok(puede(propietario, 'aviso.editar', { usuario_id: 'u2' }), 'edita su propio aviso');
  ok(!puede(propietario, 'aviso.editar', { usuario_id: 'otro' }), 'NO edita el aviso ajeno');
  ok(!puede(propietario, 'aviso.moderar'), 'propietario NO modera');
  ok(puede(moderador, 'aviso.moderar'), 'moderador modera');
  ok(!puede(moderador, 'usuario.suspender'), 'moderador NO suspende usuarios');
  ok(!puede(moderador, 'pago.reembolsar'), 'moderador NO reembolsa');
  ok(puede(admin, 'pago.reembolsar'), 'admin reembolsa');
  ok(!puede(suspendido, 'favorito.gestionar'), 'cuenta suspendida no puede nada, ni siendo admin');

  const conAgencia = {
    id: 'u6', rol: 'inmobiliaria', ...base,
    agencias: [{ agencia_id: 'a1', rol: 'admin' }],
  };
  ok(puede(conAgencia, 'agencia.invitar', { agencia_id: 'a1' }), 'admin de agencia invita');
  ok(!puede(conAgencia, 'agencia.invitar', { agencia_id: 'a2' }), 'no invita en otra agencia');
  ok(puede(conAgencia, 'aviso.editar', { agencia_id: 'a1' }), 'edita aviso de su agencia');
}

console.log(
  fallos === 0
    ? '\n  ✓ Todo en verde.\n'
    : `\n  ✗ ${fallos} fallo(s).\n`,
);
process.exit(fallos === 0 ? 0 : 1);
