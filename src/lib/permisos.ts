/**
 * Único punto de decisión de permisos.
 *
 * Regla: nunca chequear permisos dentro de un handler. Siempre `puede()`.
 * Regla: denegar por defecto — una acción nueva sin caso escrito queda cerrada.
 *
 * Ver AUTENTICACION.md §3 para la matriz completa.
 */

export type Rol =
  | 'comprador'
  | 'propietario'
  | 'agente'
  | 'inmobiliaria'
  | 'moderador'
  | 'admin';

export type Usuario = {
  id: string;
  rol: Rol;
  estado: 'activo' | 'suspendido' | 'baja';
  email_verificado: boolean;
  /** Agencias a las que pertenece, con su cargo. */
  agencias?: { agencia_id: string; rol: 'dueno' | 'admin' | 'agente' }[];
};

export type Recurso = {
  usuario_id?: string | null;
  agencia_id?: string | null;
  destinatario_id?: string | null;
};

export type Accion =
  // comprador — cualquier sesión activa
  | 'favorito.gestionar'
  | 'busqueda.guardar'
  | 'aviso.contactar'
  | 'reporte.crear'
  | 'indice.consultar'
  // publicar
  | 'aviso.crear'
  | 'aviso.editar'
  | 'aviso.publicar'
  | 'aviso.eliminar'
  | 'medio.subir'
  | 'lead.ver'
  | 'metricas.propias'
  // profesional
  | 'perfil.publico'
  | 'agencia.crear'
  | 'agencia.editar'
  | 'agencia.invitar'
  | 'proyecto.gestionar'
  // dinero
  | 'plan.contratar'
  | 'destaque.comprar'
  // moderación
  | 'aviso.moderar'
  | 'reporte.resolver'
  | 'usuario.ver'
  | 'metricas.plataforma'
  // solo admin
  | 'aviso.archivar'
  | 'usuario.verificar'
  | 'usuario.suspender'
  | 'usuario.cambiar_rol'
  | 'pago.reembolsar'
  | 'plan.editar'
  | 'indice.cargar'
  | 'auditoria.ver';

const PUEDEN_PUBLICAR: Rol[] = ['propietario', 'agente', 'inmobiliaria'];

export function puede(u: Usuario, accion: Accion, recurso?: Recurso): boolean {
  // Una cuenta suspendida no hace nada, sin importar el rol.
  if (u.estado !== 'activo') return false;

  if (u.rol === 'admin') return true;

  switch (accion) {
    // --- cualquier sesión activa ---
    case 'favorito.gestionar':
    case 'busqueda.guardar':
    case 'aviso.contactar':
    case 'reporte.crear':
    case 'indice.consultar':
      return true;

    // --- publicar ---
    case 'aviso.crear':
    case 'plan.contratar':
      return PUEDEN_PUBLICAR.includes(u.rol);

    case 'aviso.editar':
    case 'aviso.publicar':
    case 'aviso.eliminar':
    case 'medio.subir':
    case 'metricas.propias':
    case 'destaque.comprar':
      return esSuyo(u, recurso) || esDeSuAgencia(u, recurso);

    case 'lead.ver':
      if (!recurso) return false;
      return (
        recurso.destinatario_id === u.id ||
        cargoEnAgencia(u, recurso.agencia_id, ['dueno', 'admin'])
      );

    // --- profesional ---
    case 'perfil.publico':
      return u.rol === 'agente' || u.rol === 'inmobiliaria';

    case 'agencia.crear':
      return u.rol === 'inmobiliaria';

    case 'agencia.editar':
    case 'agencia.invitar':
    case 'proyecto.gestionar':
      return cargoEnAgencia(u, recurso?.agencia_id, ['dueno', 'admin']);

    // --- moderación ---
    case 'aviso.moderar':
    case 'reporte.resolver':
    case 'usuario.ver':
    case 'metricas.plataforma':
      return u.rol === 'moderador';

    // --- solo admin (ya cubierto arriba) ---
    default:
      return false;
  }
}

function esSuyo(u: Usuario, r?: Recurso): boolean {
  return !!r?.usuario_id && r.usuario_id === u.id;
}

function esDeSuAgencia(u: Usuario, r?: Recurso): boolean {
  if (!r?.agencia_id) return false;
  return (u.agencias ?? []).some((a) => a.agencia_id === r.agencia_id);
}

function cargoEnAgencia(
  u: Usuario,
  agenciaId: string | null | undefined,
  cargos: ('dueno' | 'admin' | 'agente')[],
): boolean {
  if (!agenciaId) return false;
  return (u.agencias ?? []).some(
    (a) => a.agencia_id === agenciaId && cargos.includes(a.rol),
  );
}
