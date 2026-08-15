import * as q from './consultas.ts';
import {
  hashearPassword,
  verificarPassword,
  quemarTiempo,
  firmarSesion,
  nuevoToken,
  hashToken,
} from '../../lib/auth.ts';
import { ErrorHTTP } from '../../lib/errores.ts';
import { limitar, limpiarLimite, LIMITES } from '../../lib/limitar.ts';
import type { Rol } from '../../lib/permisos.ts';

/* ------------------------------ registro ------------------------------ */

export async function registrar(
  datos: { email: string; password: string; nombre: string; rol: Rol; telefono?: string | null },
  ip: string,
) {
  await limitar('registro', ip, LIMITES.registro.tope, LIMITES.registro.minutos);

  if (await q.porEmail(datos.email)) {
    throw new ErrorHTTP(409, 'Ese correo ya tiene una cuenta. ¿Quieres ingresar?', {
      codigo: 'EMAIL_DUPLICADO',
      campo: 'email',
    });
  }

  // La contraseña no puede ser el propio correo.
  if (datos.password.toLowerCase().trim() === datos.email.toLowerCase().trim()) {
    throw new ErrorHTTP(422, 'La contraseña no puede ser igual a tu correo.', {
      codigo: 'PASSWORD_DEBIL',
      campo: 'password',
    });
  }

  const usuario = await q.crear({
    email: datos.email,
    password_hash: await hashearPassword(datos.password),
    rol: datos.rol,
    nombre: datos.nombre,
    telefono: datos.telefono ?? null,
  });

  const { token, hash } = nuevoToken();
  await q.guardarToken(usuario.id, 'verificar_email', hash, 24);

  return { usuario, jwt: await firmarSesion(usuario), tokenVerificacion: token };
}

/* ------------------------------- ingreso ------------------------------ */

export async function ingresar(email: string, password: string, ip: string) {
  await limitar('login', `${email}:${ip}`, LIMITES.login.tope, LIMITES.login.minutos);

  const usuario = await q.porEmail(email);

  // Mismo mensaje y tiempo parecido tanto si el correo no existe como si
  // la contraseña está mal: no queremos que sirva para enumerar cuentas.
  if (!usuario) {
    await quemarTiempo(password);
    throw credencialesInvalidas();
  }
  if (!(await verificarPassword(password, usuario.password_hash))) {
    throw credencialesInvalidas();
  }
  if (usuario.estado === 'suspendido') {
    throw new ErrorHTTP(
      403,
      usuario.motivo_suspension
        ? `Tu cuenta está suspendida: ${usuario.motivo_suspension}`
        : 'Tu cuenta está suspendida. Escríbenos para revisarlo.',
      { codigo: 'CUENTA_SUSPENDIDA' },
    );
  }
  if (usuario.estado !== 'activo') throw credencialesInvalidas();

  await limpiarLimite('login', `${email}:${ip}`);
  await q.marcarAcceso(usuario.id);

  return { usuario, jwt: await firmarSesion(usuario) };
}

const credencialesInvalidas = () =>
  new ErrorHTTP(401, 'Correo o contraseña incorrectos.', { codigo: 'CREDENCIALES_INVALIDAS' });

/* -------------------------------- yo ---------------------------------- */

export async function yo(usuarioId: string) {
  const u = await q.porId(usuarioId);
  if (!u) throw new ErrorHTTP(401, 'Necesitas ingresar a tu cuenta para ver esto.');

  const [perfil, agencia, plan] = await Promise.all([
    q.perfilDe(u.id),
    q.agenciaDe(u.id),
    q.planDe(u.id),
  ]);

  const [avisosUsados, indiceUsadas] = await Promise.all([
    q.contarAvisosActivos(u.id),
    q.consultasIndiceDelMes(u.id),
  ]);

  // Sin suscripción = plan gratuito. Ver COMPETENCIA.md §5.1: son 2 avisos.
  const GRATIS = { slug: 'gratis', nombre: 'Gratis', tope_avisos: 2, tope_fotos: 8, cuota_indice_mes: 5 };
  const efectivo = plan ?? GRATIS;

  return {
    usuario: {
      id: u.id,
      email: u.email,
      nombre: u.nombre,
      telefono: u.telefono,
      rol: u.rol,
      verificado: u.verificado,
      email_verificado: u.email_verificado_en !== null,
      creado_en: u.creado_en,
    },
    perfil: perfil ?? null,
    agencia: agencia ?? null,
    plan: {
      slug: efectivo.slug,
      nombre: efectivo.nombre,
      tope_avisos: efectivo.tope_avisos,
      avisos_usados: avisosUsados,
      tope_fotos: efectivo.tope_fotos,
      cuota_indice_mes: efectivo.cuota_indice_mes,
      indice_usadas: indiceUsadas,
      vence_en: plan?.fin ?? null,
    },
    perfil_completitud: completitud(u, perfil),
  };
}

/**
 * No hay un booleano "perfil completo": lo que importa es qué necesitas
 * según lo que quieras hacer. Ver AUTENTICACION.md §8.
 */
function completitud(u: q.UsuarioFila, p: q.PerfilFila | null) {
  const pendientes: { campo: string; mensaje: string; peso: number }[] = [];

  if (!u.email_verificado_en)
    pendientes.push({
      campo: 'email',
      mensaje: 'Confirma tu correo para poder publicar.',
      peso: 30,
    });
  if (!u.telefono)
    pendientes.push({
      campo: 'telefono',
      mensaje: 'Agrega tu celular: los interesados te escriben por WhatsApp.',
      peso: 25,
    });
  if (!p?.whatsapp)
    pendientes.push({ campo: 'whatsapp', mensaje: 'Agrega tu WhatsApp.', peso: 15 });
  if (!p?.foto_url)
    pendientes.push({
      campo: 'foto_url',
      mensaje: 'Sube una foto: los avisos con foto de perfil reciben más contactos.',
      peso: 10,
    });
  if (!p?.bio)
    pendientes.push({ campo: 'bio', mensaje: 'Cuenta en qué zonas trabajas.', peso: 10 });

  const perdido = pendientes.reduce((s, x) => s + x.peso, 0);
  const puedePublicar = u.email_verificado_en !== null;

  return {
    porcentaje: Math.max(0, 100 - perdido),
    puede_publicar: puedePublicar,
    puede_recibir_leads: Boolean(u.telefono || p?.whatsapp),
    siguiente_paso: pendientes[0]
      ? { ...pendientes[0], bloquea: pendientes[0].campo === 'email' ? ['aviso.publicar'] : [] }
      : null,
    pendientes,
  };
}

/* ------------------------------- perfil ------------------------------- */

/**
 * Lista blanca explícita. `rol`, `verificado`, `estado`, `version_token`
 * y `password_hash` NUNCA se escriben desde acá.
 */
const CAMPOS_PERFIL = ['foto_url', 'bio', 'ubicacion_id', 'whatsapp', 'sitio_web'] as const;
const CAMPOS_USUARIO = ['nombre', 'telefono'] as const;

export async function actualizarPerfil(usuarioId: string, body: Record<string, unknown>) {
  const dePerfil: Record<string, unknown> = {};
  const deUsuario: Record<string, unknown> = {};

  for (const k of CAMPOS_PERFIL) if (k in body) dePerfil[k] = body[k];
  for (const k of CAMPOS_USUARIO) if (k in body) deUsuario[k] = body[k];

  await q.actualizarUsuario(usuarioId, deUsuario);
  const perfil = await q.actualizarPerfil(usuarioId, dePerfil);
  return { perfil, mensaje: 'Guardamos tus cambios.' };
}

/* --------------------------- verificación ----------------------------- */

export async function confirmarEmail(token: string) {
  const fila = await q.buscarToken(hashToken(token), 'verificar_email');
  if (!fila) {
    throw new ErrorHTTP(410, 'Ese enlace ya venció o no es válido. Pide uno nuevo.', {
      codigo: 'TOKEN_VENCIDO',
    });
  }
  await q.usarToken(fila.id);
  await q.marcarEmailVerificado(fila.usuario_id);
  return { ok: true, mensaje: '¡Listo! Tu correo quedó confirmado.' };
}

/* ------------------------- recuperar contraseña ------------------------ */

/** Devuelve el token solo si la cuenta existe. La ruta responde igual siempre. */
export async function pedirRecuperacion(email: string): Promise<string | null> {
  await limitar('recuperar', email, LIMITES.recuperar.tope, LIMITES.recuperar.minutos);
  const u = await q.porEmail(email);
  if (!u) return null;

  const { token, hash } = nuevoToken();
  await q.guardarToken(u.id, 'recuperar_password', hash, 1);
  return token;
}

export async function confirmarRecuperacion(token: string, password: string) {
  const fila = await q.buscarToken(hashToken(token), 'recuperar_password');
  if (!fila) {
    throw new ErrorHTTP(410, 'Ese enlace ya venció o no es válido. Pide uno nuevo.', {
      codigo: 'TOKEN_VENCIDO',
    });
  }
  await q.usarToken(fila.id);
  await q.anularTokens(fila.usuario_id, 'recuperar_password');
  await q.guardarPassword(fila.usuario_id, await hashearPassword(password));
  return { ok: true, mensaje: 'Tu contraseña quedó cambiada. Ya puedes ingresar.' };
}

export async function cambiarPassword(usuarioId: string, actual: string, nueva: string) {
  const u = await q.porId(usuarioId);
  if (!u) throw new ErrorHTTP(401, 'Necesitas ingresar a tu cuenta.');

  if (!(await verificarPassword(actual, u.password_hash))) {
    throw new ErrorHTTP(422, 'La contraseña actual no es correcta.', {
      codigo: 'PASSWORD_INCORRECTA',
      campo: 'password_actual',
    });
  }
  await q.guardarPassword(usuarioId, await hashearPassword(nueva));
  return { ok: true, mensaje: 'Contraseña cambiada. Cerramos las demás sesiones.' };
}

export const salirDeTodo = (usuarioId: string) => q.subirVersionToken(usuarioId);
