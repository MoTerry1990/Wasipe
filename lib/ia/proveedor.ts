/**
 * Contrato de los proveedores de IA.
 *
 * Wasipe no se casa con ninguna empresa de IA. Todo lo que el producto
 * necesita del modelo está en esta interfaz: pedir texto y recibir
 * texto, con el nombre del proveedor y del modelo para poder auditarlo.
 * Cambiar de proveedor es escribir un adaptador nuevo y cambiar una
 * variable de entorno; no se toca ni una pantalla ni una acción.
 *
 * Este archivo NO importa ningún SDK. Los adaptadores viven en
 * `lib/ia/proveedores/` y se cargan de a uno, solo en el servidor, para
 * que la clave de ninguno pueda terminar en el navegador.
 */

export type MensajeIA = { rol: 'usuario' | 'asistente'; texto: string };

export type PeticionDeTexto = {
  /** Instrucciones del sistema: quién es y qué no debe hacer. */
  sistema: string;
  mensajes: MensajeIA[];
  /** Tope de la respuesta. Es un límite duro del proveedor. */
  maximoTokens: number;
  /** Se corta el pedido si el proveedor no responde a tiempo. */
  milisegundos?: number;
};

export type RespuestaDeTexto = {
  texto: string;
  proveedor: string;
  modelo: string;
  /** Lo que informa el proveedor. Sirve para medir costo, no para cobrar. */
  tokens?: { entrada: number; salida: number };
};

export type ProveedorDeIA = {
  /** Identificador corto, el que se guarda en `ai_jobs.provider`. */
  nombre: string;
  /** false cuando falta la clave: el asistente se apaga con elegancia. */
  disponible(): boolean;
  generarTexto(peticion: PeticionDeTexto): Promise<RespuestaDeTexto>;
};

/**
 * Falla del proveedor, ya traducida.
 *
 * El mensaje de esta excepción se le muestra a la persona, así que va en
 * castellano y no repite nada de lo que dijo la API en inglés. El detalle
 * técnico va en `detalle` y termina en `ai_jobs.error`.
 */
export class FallaDeProveedor extends Error {
  readonly detalle: string;
  readonly reintentable: boolean;

  constructor(mensaje: string, detalle: string, reintentable = true) {
    super(mensaje);
    this.name = 'FallaDeProveedor';
    this.detalle = detalle;
    this.reintentable = reintentable;
  }
}

/** Mensaje único para cuando no hay proveedor o el que hay no responde. */
export const IA_NO_DISPONIBLE =
  'Wasi AI no está disponible en este momento. Puedes escribir el aviso tú mismo y volver a intentarlo más tarde.';
