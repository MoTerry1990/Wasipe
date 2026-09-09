/**
 * El contrato de almacenamiento.
 *
 * Wasipe guarda archivos en Supabase Storage. Esa fue la decisión del
 * sprint 18 y es la correcta para empezar: ya usamos Supabase para la
 * base, la autenticación y las políticas, así que la propiedad de un
 * archivo se resuelve con las mismas reglas que la de una fila, sin un
 * segundo sistema de permisos que mantener de acuerdo con el primero.
 *
 * Pero «la correcta para empezar» no es «la correcta para siempre».
 * Cloudinary transforma imágenes al vuelo y sirve desde una red de
 * distribución, y el día que Wasipe tenga tráfico de verdad eso va a
 * pesar. Por eso el resto de la aplicación no habla con Supabase: habla
 * con esta interfaz.
 *
 * La interfaz está escrita sobre lo que **todo** almacenamiento sabe
 * hacer —guardar, leer, firmar, borrar— y no sobre lo que sabe hacer
 * Supabase. Una interfaz con un método `crearBucket()` o `politicaRLS()`
 * no serviría para Cloudinary y habría que reescribirla igual.
 *
 * Este archivo no importa `server-only` a propósito: son solo tipos, y
 * el navegador necesita conocerlos para la subida directa. Los
 * adaptadores sí son de servidor.
 */

/**
 * Los cinco depósitos, uno por nivel de acceso.
 *
 * El nombre es lógico, no el identificador del bucket: un proveedor
 * distinto puede llamarlos de otra forma o no tener buckets siquiera.
 */
export type Deposito =
  /** El archivo tal como se subió. Privado. No se sobreescribe nunca. */
  | 'originales'
  /** La versión que se muestra en el aviso. Pública. */
  | 'publicas'
  /** Lo que produjo Wasi AI, hasta que alguien lo apruebe. Privado. */
  | 'generadas'
  /** Videos del aviso. Privado, se entregan con enlace firmado. */
  | 'videos'
  /** Foto de perfil de una persona. Pública. */
  | 'avatares'
  /** Logotipo de una inmobiliaria. Público. */
  | 'logos';

export const DEPOSITOS: Record<Deposito, { publico: boolean; porQue: string }> = {
  originales: {
    publico: false,
    porQue:
      'El archivo sin tocar lleva los metadatos EXIF, y ahí van las coordenadas GPS de donde se tomó la foto. Quien publica eligió mostrar el distrito, no la cuadra.',
  },
  publicas: {
    publico: true,
    porQue: 'Es lo que se ve en el aviso. Tiene que servirse rápido y sin firmar nada.',
  },
  generadas: {
    publico: false,
    porQue:
      'Una imagen recién salida de Wasi AI no la aprobó nadie. Un bucket público la haría accesible por dirección aunque la interfaz no la muestre.',
  },
  videos: {
    publico: false,
    porQue: 'Se entregan con enlace firmado de cinco minutos: no hay dirección que reenviar.',
  },
  avatares: {
    publico: true,
    porQue: 'La foto de perfil se muestra en cualquier parte del portal.',
  },
  logos: {
    publico: true,
    porQue: 'El logotipo de una inmobiliaria se muestra en sus avisos y en su perfil público.',
  },
};

export type ArchivoSubido = {
  /** La ruta dentro del depósito. Es la llave para volver a pedirlo. */
  ruta: string;
  /** Dirección pública, si el depósito lo es. `null` si es privado. */
  url: string | null;
  bytes: number;
  tipo: string;
};

export type ResultadoDeSubida =
  { ok: true; archivo: ArchivoSubido } | { ok: false; motivo: string };

/**
 * Lo que sabe hacer un almacenamiento.
 *
 * Cinco operaciones. Cada una está acá porque la aplicación la necesita,
 * no porque el proveedor la ofrezca.
 */
export interface ProveedorDeAlmacenamiento {
  readonly nombre: string;

  /**
   * Guarda un archivo.
   *
   * `sobreescribir` es explícito y por defecto va en false: sobre
   * `originales` tiene que fallar siempre, y un valor por defecto
   * permisivo convierte esa garantía en algo que hay que recordar.
   */
  guardar(
    deposito: Deposito,
    ruta: string,
    contenido: ArrayBuffer | Uint8Array | Blob,
    opciones?: { tipo?: string; sobreescribir?: boolean },
  ): Promise<ResultadoDeSubida>;

  /** La dirección pública. `null` si el depósito es privado. */
  urlPublica(deposito: Deposito, ruta: string): string | null;

  /**
   * Una dirección temporal para algo privado.
   *
   * Los segundos son parte de la llamada y no una configuración global:
   * un video de aviso y una foto original tienen ventanas distintas, y
   * un valor único obligaría a elegir la más larga de las dos.
   */
  urlFirmada(deposito: Deposito, ruta: string, segundos: number): Promise<string | null>;

  /** Trae el contenido. Lo usa el cálculo de huellas y el reprocesado. */
  leer(deposito: Deposito, ruta: string): Promise<ArrayBuffer | null>;

  /**
   * Borra.
   *
   * Sobre `originales` no debería llamarse nunca desde la aplicación; la
   * política de la base tampoco lo permite desde el navegador. Está en
   * la interfaz porque el barrido de un aviso borrado sí tiene que poder
   * hacerlo, con la llave de servicio y dejando rastro.
   */
  borrar(deposito: Deposito, rutas: readonly string[]): Promise<{ borrados: number }>;
}

/**
 * El nombre lógico al bucket de verdad.
 *
 * Vive acá, y no en el adaptador de Supabase, porque **el navegador
 * también lo necesita**: las fotos se suben directo a Storage y quien
 * las sube tiene que saber a qué depósito van.
 *
 * Que estuviera solo del lado del servidor es lo que dejó abierto P-13
 * durante cuatro sprints. El sprint 18 creó el depósito privado
 * `originales` y escribió esta capa; `features/publicar/fotos.tsx`, que
 * es un componente de cliente y no podía importarla, siguió escribiendo
 * `'avisos'` a mano —el bucket público— para el original y para la
 * versión mostrada. El arreglo existía y no estaba conectado.
 *
 * Un solo mapa, importable desde los dos lados, es lo que impide que
 * vuelva a pasar.
 *
 * `avatares` y `logos` van separados aunque los dos sean públicos, y esa
 * separación es la corrección de P-28. Antes había un único depósito
 * `perfiles` apuntando a `avatares`, así que el contrato **no sabía
 * nombrar** el bucket de los logos: subir un logo por esta vía lo habría
 * puesto en el bucket equivocado, bajo las políticas equivocadas. Por eso
 * el código de cuentas escribía `'avatares'` y `'logos'` a mano —no por
 * descuido, sino porque el contrato no le servía—. Son dos buckets
 * distintos en Storage, con políticas distintas; el contrato ahora lo
 * dice.
 */
export const BUCKET_DE: Record<Deposito, string> = {
  originales: 'originales',
  publicas: 'avisos',
  generadas: 'generados',
  videos: 'videos',
  avatares: 'avatares',
  logos: 'logos',
};
