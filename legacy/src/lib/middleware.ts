import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { COOKIE, leerSesion, puedeExigirVerificacion } from './auth.ts';
import { una, sql } from '../db/cliente.ts';
import { ErrorHTTP, sinSesion, sinPermiso, emailSinVerificar } from './errores.ts';
import { puede, type Accion, type Recurso, type Rol, type Usuario } from './permisos.ts';

declare module 'hono' {
  interface ContextVariableMap {
    usuario: Usuario;
  }
}

type FilaUsuario = {
  id: string;
  rol: Rol;
  estado: 'activo' | 'suspendido' | 'baja';
  version_token: number;
  email_verificado_en: string | null;
  motivo_suspension: string | null;
};

/**
 * Carga la sesión si la cookie es válida. No exige que exista.
 * Se monta una sola vez y deja el usuario en el contexto.
 */
export async function cargarSesion(c: Context, next: Next) {
  const token = getCookie(c, COOKIE);
  if (!token) return next();

  const sesion = await leerSesion(token);
  if (!sesion) return next();

  const u = await una<FilaUsuario>(
    `SELECT id, rol, estado, version_token, email_verificado_en, motivo_suspension
     FROM usuarios WHERE id = $1 AND eliminado_en IS NULL`,
    [sesion.id],
  );
  if (!u) return next();

  // El JWT lleva la versión con la que fue emitido. Si no coincide,
  // la sesión fue revocada (cambio de contraseña, salir-todo, suspensión).
  if (u.version_token !== sesion.ver) return next();

  const agencias = await sql<{ agencia_id: string; rol: 'dueno' | 'admin' | 'agente' }>(
    `SELECT agencia_id, rol FROM agencia_miembros
     WHERE usuario_id = $1 AND aceptado_en IS NOT NULL`,
    [u.id],
  );

  c.set('usuario', {
    id: u.id,
    rol: u.rol,
    estado: u.estado,
    email_verificado: u.email_verificado_en !== null,
    agencias,
  });
  return next();
}

/** Exige sesión activa. */
export const conSesion = () => async (c: Context, next: Next) => {
  const u = c.get('usuario');
  if (!u) throw sinSesion();
  if (u.estado === 'suspendido') {
    throw new ErrorHTTP(403, 'Tu cuenta está suspendida. Escríbenos para revisarlo.', {
      codigo: 'CUENTA_SUSPENDIDA',
    });
  }
  if (u.estado !== 'activo') throw sinSesion();
  return next();
};

/** Exige correo confirmado. Solo donde el contenido se vuelve público. */
export const conVerificado = () => async (c: Context, next: Next) => {
  const u = c.get('usuario');
  if (!u) throw sinSesion();
  if (!puedeExigirVerificacion()) return next();
  if (!u.email_verificado) throw emailSinVerificar();
  return next();
};

/** Exige uno de los roles indicados. */
export const conRol =
  (...roles: Rol[]) =>
  async (c: Context, next: Next) => {
    const u = c.get('usuario');
    if (!u) throw sinSesion();
    if (!roles.includes(u.rol)) throw sinPermiso();
    return next();
  };

/**
 * Exige un permiso concreto. `cargar` recupera el recurso cuando la
 * decisión depende de a quién pertenece.
 */
export const conPermiso =
  (accion: Accion, cargar?: (c: Context) => Promise<Recurso | null>) =>
  async (c: Context, next: Next) => {
    const u = c.get('usuario');
    if (!u) throw sinSesion();

    let recurso: Recurso | undefined;
    if (cargar) {
      const r = await cargar(c);
      if (!r) throw new ErrorHTTP(404, 'Eso no existe o ya no está disponible.');
      recurso = r;
    }

    if (!puede(u, accion, recurso)) throw sinPermiso();
    return next();
  };
