/**
 * Errores de la API.
 *
 * Regla: `mensaje` es texto que se le muestra al usuario tal cual, en español.
 * `codigo` es lo que consume el frontend. `campo` permite enfocar un input.
 */
export class ErrorHTTP extends Error {
  readonly estado: number;
  readonly codigo: string;
  readonly campo?: string;
  readonly extra?: Record<string, unknown>;

  constructor(
    estado: number,
    mensaje: string,
    opciones: { codigo?: string; campo?: string; extra?: Record<string, unknown> } = {},
  ) {
    super(mensaje);
    this.name = 'ErrorHTTP';
    this.estado = estado;
    this.codigo = opciones.codigo ?? CODIGO_POR_DEFECTO[estado] ?? 'ERROR';
    this.campo = opciones.campo;
    this.extra = opciones.extra;
  }

  aRespuesta() {
    return {
      error: this.message,
      codigo: this.codigo,
      ...(this.campo ? { campo: this.campo } : {}),
      ...(this.extra ?? {}),
    };
  }
}

const CODIGO_POR_DEFECTO: Record<number, string> = {
  400: 'PETICION_INVALIDA',
  401: 'SIN_SESION',
  402: 'REQUIERE_PLAN',
  403: 'SIN_PERMISO',
  404: 'NO_ENCONTRADO',
  409: 'CONFLICTO',
  410: 'VENCIDO',
  422: 'VALIDACION',
  429: 'DEMASIADAS_PETICIONES',
  503: 'NO_DISPONIBLE',
};

// Atajos para los casos más repetidos.
export const sinSesion = () =>
  new ErrorHTTP(401, 'Necesitas ingresar a tu cuenta para ver esto.', { codigo: 'SIN_SESION' });

export const sinPermiso = () =>
  new ErrorHTTP(403, 'No tienes permiso para hacer esto.', { codigo: 'SIN_PERMISO' });

export const noEncontrado = (que = 'Eso') =>
  new ErrorHTTP(404, `${que} no existe o ya no está disponible.`, { codigo: 'NO_ENCONTRADO' });

export const emailSinVerificar = () =>
  new ErrorHTTP(403, 'Confirma tu correo para poder publicar.', {
    codigo: 'EMAIL_NO_VERIFICADO',
  });

export const topeDePlan = (mensaje: string, planSugerido: string) =>
  new ErrorHTTP(402, mensaje, { codigo: 'TOPE_PLAN', extra: { plan_sugerido: planSugerido } });
