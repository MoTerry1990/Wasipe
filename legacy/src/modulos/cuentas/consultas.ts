import { sql, una } from '../../db/cliente.ts';
import type { Rol } from '../../lib/permisos.ts';

export type UsuarioFila = {
  id: string;
  email: string;
  password_hash: string;
  rol: Rol;
  nombre: string;
  telefono: string | null;
  estado: 'activo' | 'suspendido' | 'baja';
  verificado: boolean;
  email_verificado_en: string | null;
  version_token: number;
  motivo_suspension: string | null;
  creado_en: string;
};

export const porEmail = (email: string) =>
  una<UsuarioFila>(
    `SELECT * FROM usuarios WHERE lower(email) = lower($1) AND eliminado_en IS NULL`,
    [email],
  );

export const porId = (id: string) =>
  una<UsuarioFila>(`SELECT * FROM usuarios WHERE id = $1 AND eliminado_en IS NULL`, [id]);

export async function crear(datos: {
  email: string;
  password_hash: string;
  rol: Rol;
  nombre: string;
  telefono: string | null;
}): Promise<UsuarioFila> {
  const u = await una<UsuarioFila>(
    `INSERT INTO usuarios (email, password_hash, rol, nombre, telefono)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [datos.email, datos.password_hash, datos.rol, datos.nombre, datos.telefono],
  );
  if (!u) throw new Error('No se pudo crear el usuario');
  // Fila de perfil vacía, para que el PATCH posterior sea siempre un UPDATE.
  await sql(`INSERT INTO perfiles (usuario_id) VALUES ($1) ON CONFLICT DO NOTHING`, [u.id]);
  return u;
}

export const marcarAcceso = (id: string) =>
  sql(`UPDATE usuarios SET ultimo_acceso = now() WHERE id = $1`, [id]);

/** Invalida todas las sesiones del usuario. */
export const subirVersionToken = (id: string) =>
  sql(`UPDATE usuarios SET version_token = version_token + 1 WHERE id = $1`, [id]);

export const guardarPassword = async (id: string, hash: string) => {
  await sql(
    `UPDATE usuarios SET password_hash = $2, version_token = version_token + 1 WHERE id = $1`,
    [id, hash],
  );
};

export const marcarEmailVerificado = (id: string) =>
  sql(`UPDATE usuarios SET email_verificado_en = now() WHERE id = $1`, [id]);

/* ------------------------------- perfil ------------------------------- */

export type PerfilFila = {
  usuario_id: string;
  foto_url: string | null;
  bio: string | null;
  ubicacion_id: string | null;
  whatsapp: string | null;
  sitio_web: string | null;
};

export const perfilDe = (usuarioId: string) =>
  una<PerfilFila>(`SELECT * FROM perfiles WHERE usuario_id = $1`, [usuarioId]);

/** Actualiza solo los campos de la lista blanca. Nunca expande el body. */
export async function actualizarPerfil(
  usuarioId: string,
  campos: Record<string, unknown>,
): Promise<PerfilFila | null> {
  const claves = Object.keys(campos);
  if (claves.length === 0) return perfilDe(usuarioId);

  const set = claves.map((k, i) => `${k} = $${i + 2}`).join(', ');
  return una<PerfilFila>(
    `UPDATE perfiles SET ${set}, actualizado_en = now() WHERE usuario_id = $1 RETURNING *`,
    [usuarioId, ...claves.map((k) => campos[k])],
  );
}

export async function actualizarUsuario(
  id: string,
  campos: Record<string, unknown>,
): Promise<void> {
  const claves = Object.keys(campos);
  if (claves.length === 0) return;
  const set = claves.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await sql(`UPDATE usuarios SET ${set} WHERE id = $1`, [id, ...claves.map((k) => campos[k])]);
}

/* ------------------------------- tokens ------------------------------- */

export const guardarToken = (
  usuarioId: string,
  tipo: string,
  hash: string,
  horas: number,
) =>
  sql(
    `INSERT INTO tokens_cuenta (usuario_id, tipo, token_hash, expira_en)
     VALUES ($1,$2,$3, now() + ($4 || ' hours')::interval)`,
    [usuarioId, tipo, hash, String(horas)],
  );

export const buscarToken = (hash: string, tipo: string) =>
  una<{ id: string; usuario_id: string }>(
    `SELECT id, usuario_id FROM tokens_cuenta
     WHERE token_hash = $1 AND tipo = $2 AND usado_en IS NULL AND expira_en > now()`,
    [hash, tipo],
  );

export const usarToken = (id: string) =>
  sql(`UPDATE tokens_cuenta SET usado_en = now() WHERE id = $1`, [id]);

/** Al usar un reset, los demás resets pendientes del usuario mueren. */
export const anularTokens = (usuarioId: string, tipo: string) =>
  sql(
    `UPDATE tokens_cuenta SET usado_en = now()
     WHERE usuario_id = $1 AND tipo = $2 AND usado_en IS NULL`,
    [usuarioId, tipo],
  );

/* -------------------------- agencia y plan --------------------------- */

export const agenciaDe = (usuarioId: string) =>
  una<{ id: string; nombre: string; slug: string; verificada: boolean; rol_en_agencia: string }>(
    `SELECT a.id, a.nombre, a.slug, a.verificada, m.rol AS rol_en_agencia
     FROM agencia_miembros m JOIN agencias a ON a.id = m.agencia_id
     WHERE m.usuario_id = $1 AND m.aceptado_en IS NOT NULL
     LIMIT 1`,
    [usuarioId],
  );

export const planDe = (usuarioId: string) =>
  una<{
    slug: string;
    nombre: string;
    tope_avisos: number | null;
    tope_fotos: number;
    cuota_indice_mes: number | null;
    fin: string;
  }>(
    `SELECT p.slug, p.nombre, p.tope_avisos, p.tope_fotos, p.cuota_indice_mes, s.fin
     FROM suscripciones s JOIN planes p ON p.id = s.plan_id
     WHERE s.usuario_id = $1 AND s.estado IN ('activa','prueba','morosa')
     LIMIT 1`,
    [usuarioId],
  );

export const contarAvisosActivos = async (usuarioId: string): Promise<number> => {
  const r = await una<{ n: number }>(
    `SELECT count(*)::int AS n FROM propiedades
     WHERE usuario_id = $1 AND estado = 'activo' AND eliminado_en IS NULL`,
    [usuarioId],
  );
  return r?.n ?? 0;
};

export const consultasIndiceDelMes = async (usuarioId: string): Promise<number> => {
  const r = await una<{ conteo: number }>(
    `SELECT conteo FROM consultas_indice
     WHERE usuario_id = $1 AND periodo = to_char(now(), 'YYYY-MM')`,
    [usuarioId],
  );
  return r?.conteo ?? 0;
};
