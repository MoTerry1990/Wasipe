/**
 * Contrato de los proveedores de IA.
 *
 * Wasipe no se casa con ninguna empresa de IA. Todo lo que el producto
 * necesita del modelo está en estas dos interfaces: pedir texto y pedir
 * una imagen editada, con el nombre del proveedor y del modelo para
 * poder auditarlo. Cambiar de proveedor es escribir un adaptador nuevo y
 * cambiar una variable de entorno; no se toca ni una pantalla ni una
 * acción.
 *
 * Este archivo NO importa ningún SDK. Los adaptadores viven en
 * `lib/ia/proveedores/` y se cargan de a uno, solo en el servidor, para
 * que la clave de ninguno pueda terminar en el navegador.
 */

// ---------------------------------------------------------------------
// Fallas
// ---------------------------------------------------------------------

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

/**
 * El proveedor se negó a editar la imagen por su propia moderación.
 *
 * Se distingue de una caída porque no se reintenta y porque el mensaje
 * es otro: no es «vuelve más tarde», es «esta foto no se puede editar».
 */
export class ImagenRechazada extends FallaDeProveedor {
  constructor(detalle: string) {
    super(
      'El proveedor no aceptó editar esta foto. Prueba con otra imagen o con otra mejora.',
      detalle,
      false,
    );
    this.name = 'ImagenRechazada';
  }
}

/** Mensaje único para cuando no hay proveedor o el que hay no responde. */
export const IA_NO_DISPONIBLE =
  'Wasi AI no está disponible en este momento. Puedes escribir el aviso tú mismo y volver a intentarlo más tarde.';

/** El equivalente para las fotos: publicar sin retoque siempre se puede. */
export const IMAGEN_NO_DISPONIBLE =
  'La mejora de fotos de Wasi AI no está disponible en este momento. Tus fotos se publican tal como las subiste.';

// ---------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------

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

// ---------------------------------------------------------------------
// Imágenes
//
// Va aparte del proveedor de texto porque casi nunca es la misma
// empresa: quien mejor escribe en castellano no es quien mejor amuebla
// una sala. Se eligen por separado y ninguno sabe del otro.
// ---------------------------------------------------------------------

/** Una imagen en memoria. `datos` va en base64, sin el prefijo `data:`. */
export type ImagenEnMemoria = { datos: string; tipo: string };

export type PeticionDeImagen = {
  /** Qué hay que hacerle a la foto. */
  instruccion: string;
  /** Lo que NO se puede hacer. Se manda siempre, en todas las peticiones. */
  reglas: string;
  imagen: ImagenEnMemoria;
  /** La operación del catálogo. El proveedor puede usarla para enrutar. */
  operacion: string;
  milisegundos?: number;
};

export type RespuestaDeImagen = {
  imagen: ImagenEnMemoria;
  proveedor: string;
  modelo: string;
  /** Lo que costó de verdad, en millonésimas de dólar. */
  costoMicros?: number;
};

export type ProveedorDeImagen = {
  nombre: string;
  disponible(): boolean;
  /** Qué operaciones del catálogo sabe hacer. No todos saben amoblar. */
  soporta(operacion: string): boolean;
  editarImagen(peticion: PeticionDeImagen): Promise<RespuestaDeImagen>;
};

// ---------------------------------------------------------------------
// Video
//
// Tercer contrato, y el más distinto de los tres: renderizar tarda
// minutos, así que no es «pide y espera» sino encolar, preguntar cómo va
// y poder cancelar. Esa forma —encolar/consultar/cancelar— es la que
// tienen por igual una API externa, un servidor propio con Remotion y un
// binario de ffmpeg corriendo en una máquina nuestra. Por eso el contrato
// es ese y no una llamada bloqueante: para que los tres entren sin que
// Wasipe se entere de cuál está detrás.
// ---------------------------------------------------------------------

export type PeticionDeVideo = {
  /** El guion completo, ya armado por Wasipe. El proveedor solo lo pinta. */
  guion: unknown;
  formato: string;
  plantilla: string;
  ancho: number;
  alto: number;
  /** Para que el proveedor no rehaga un render que ya hizo. */
  idempotencia: string;
};

export type ArchivoRenderizado = {
  /** Descarga directa. El servidor la baja y la guarda en su cubeta. */
  url: string;
  tipo: string;
  bytes?: number;
};

export type EstadoDeRender =
  | { estado: 'trabajando'; progreso: number }
  | {
      estado: 'listo';
      video: ArchivoRenderizado;
      portada?: ArchivoRenderizado;
      duracionMs?: number;
      costoMicros?: number;
    }
  | { estado: 'falla'; detalle: string; reintentable: boolean };

export type ProveedorDeVideo = {
  nombre: string;
  disponible(): boolean;
  soporta(formato: string, plantilla: string): boolean;
  /** Encola el render y devuelve la referencia con la que se le pregunta. */
  encolar(peticion: PeticionDeVideo): Promise<{ referencia: string }>;
  /** Cómo va. Se llama cada pocos segundos mientras la persona espera. */
  consultar(referencia: string): Promise<EstadoDeRender>;
  /** Cancelar en el proveedor. Opcional: no todos lo permiten. */
  cancelar?(referencia: string): Promise<void>;
};

/** Sin proveedor de video, publicar y compartir el aviso sigue igual. */
export const VIDEO_NO_DISPONIBLE =
  'El video automático de Wasi AI no está disponible en este momento. Puedes compartir el enlace de tu aviso, que muestra todas las fotos.';
