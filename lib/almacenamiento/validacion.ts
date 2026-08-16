import type { Deposito } from '@/lib/almacenamiento/proveedor';

/**
 * Qué archivo se acepta y con qué nombre se guarda.
 *
 * La regla que gobierna este archivo: **no se le cree nada a quien
 * sube**. Ni el tipo, ni la extensión, ni el nombre. Las tres cosas las
 * escribe el navegador de la persona, y las tres se pueden poner a mano.
 *
 * `file.type` es el ejemplo claro. Es lo que el navegador *dice* que es
 * el archivo, deducido casi siempre de la extensión. Un `.exe` renombrado
 * a `.jpg` llega declarando `image/jpeg`, y una validación que mira ese
 * campo lo deja pasar. Por eso acá se leen los primeros bytes: eso sí es
 * el archivo.
 */

// ---------------------------------------------------------------------
// Firmas
// ---------------------------------------------------------------------

/**
 * Los primeros bytes de cada formato que aceptamos.
 *
 * `null` en una posición significa «cualquier byte»: WebP y AVIF llevan
 * el tamaño del archivo en los bytes 4 a 7, que obviamente cambia.
 */
type Firma = { tipo: string; extension: string; bytes: (number | null)[] };

const FIRMAS: Firma[] = [
  { tipo: 'image/jpeg', extension: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  {
    tipo: 'image/png',
    extension: 'png',
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  {
    // RIFF????WEBP
    tipo: 'image/webp',
    extension: 'webp',
    bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50],
  },
  {
    // ????ftypavif
    tipo: 'image/avif',
    extension: 'avif',
    bytes: [null, null, null, null, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66],
  },
  {
    // ????ftypheic — las fotos de iPhone llegan así
    tipo: 'image/heic',
    extension: 'heic',
    bytes: [null, null, null, null, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63],
  },
];

/**
 * Qué es este archivo de verdad, mirando su contenido.
 *
 * Devuelve `null` cuando no reconoce nada, y eso es lo correcto: si no
 * sabemos qué es, no entra. Una lista de cosas prohibidas siempre se
 * queda corta; una lista de cosas permitidas, no.
 */
export function tipoRealDe(bytes: Uint8Array): { tipo: string; extension: string } | null {
  for (const firma of FIRMAS) {
    if (bytes.length < firma.bytes.length) continue;

    let coincide = true;
    for (let i = 0; i < firma.bytes.length; i++) {
      const esperado = firma.bytes[i];
      if (esperado !== null && bytes[i] !== esperado) {
        coincide = false;
        break;
      }
    }

    if (coincide) return { tipo: firma.tipo, extension: firma.extension };
  }

  return null;
}

// ---------------------------------------------------------------------
// Los límites de cada depósito
// ---------------------------------------------------------------------

export const LIMITES: Record<
  Deposito,
  { bytes: number; tipos: readonly string[]; comoSeDice: string }
> = {
  originales: {
    // 25 MB. Una foto de celular moderno sin comprimir pasa los 15, y el
    // original se guarda entero o no sirve de nada.
    bytes: 26_214_400,
    tipos: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic'],
    comoSeDice: '25 MB',
  },
  publicas: {
    bytes: 15_728_640,
    tipos: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
    comoSeDice: '15 MB',
  },
  generadas: {
    bytes: 15_728_640,
    tipos: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
    comoSeDice: '15 MB',
  },
  videos: {
    bytes: 209_715_200,
    tipos: ['video/mp4', 'video/webm'],
    comoSeDice: '200 MB',
  },
  perfiles: {
    bytes: 2_097_152,
    tipos: ['image/jpeg', 'image/png', 'image/webp'],
    comoSeDice: '2 MB',
  },
};

export type Rechazo = { ok: false; motivo: string };
export type Aceptacion = { ok: true; tipo: string; extension: string };

/**
 * ¿Este archivo entra?
 *
 * Se le pasan los primeros bytes, no el archivo completo: con 16 alcanza
 * para reconocer el formato, y traerse 25 MB al servidor solo para
 * mirarle la cabecera es tirar ancho de banda.
 *
 * Los mensajes van en castellano y dicen el límite, porque quien sube una
 * foto de 30 MB necesita saber cuánto tiene que bajarla, no que «el
 * archivo no es válido».
 */
export function validarArchivo(
  deposito: Deposito,
  primerosBytes: Uint8Array,
  bytesTotales: number,
): Aceptacion | Rechazo {
  const limite = LIMITES[deposito];

  if (bytesTotales <= 0) {
    return { ok: false, motivo: 'El archivo está vacío.' };
  }

  if (bytesTotales > limite.bytes) {
    const mb = (bytesTotales / 1_048_576).toFixed(1);
    return {
      ok: false,
      motivo: `Pesa ${mb} MB y el máximo es ${limite.comoSeDice}. Si es una foto, bájale la resolución antes de subirla.`,
    };
  }

  // Los videos no se comprueban por firma: los contenedores MP4 y WebM
  // tienen demasiadas variantes para una tabla corta, y equivocarse acá
  // sería rechazar un video legítimo. El bucket ya limita los tipos, y
  // un video no se ejecuta en el navegador de nadie.
  if (deposito === 'videos') {
    return { ok: true, tipo: 'video/mp4', extension: 'mp4' };
  }

  const real = tipoRealDe(primerosBytes);

  if (!real) {
    return {
      ok: false,
      motivo: 'Ese archivo no parece una imagen. Aceptamos JPG, PNG, WebP y AVIF.',
    };
  }

  if (!limite.tipos.includes(real.tipo)) {
    return {
      ok: false,
      motivo: `No aceptamos archivos ${real.tipo} acá. Prueba con JPG, PNG o WebP.`,
    };
  }

  return { ok: true, tipo: real.tipo, extension: real.extension };
}

// ---------------------------------------------------------------------
// Nombres y rutas
// ---------------------------------------------------------------------

/**
 * Un nombre de archivo que no puede hacer daño.
 *
 * Lo que se quita y por qué:
 *
 *  · `..` y `/` — con eso se sale de la carpeta. `../../otro-aviso/foto.jpg`
 *    escribiría en el aviso de otra persona si la política mirara solo el
 *    prefijo.
 *  · Todo lo que no sea letra, número, punto o guion — un nombre con
 *    comillas o con `<` termina en algún atributo HTML tarde o temprano.
 *  · Las tildes y la eñe — no rompen nada, pero viajan mal entre sistemas
 *    y un archivo que no se puede volver a pedir es un archivo perdido.
 *
 * Se corta a 80 caracteres: el nombre original no es información
 * importante —la ruta lleva el aviso y la marca de tiempo— y un nombre de
 * 300 caracteres complica todo lo que venga después.
 */
export function nombreSeguro(original: string): string {
  const sinRuta = original.split(/[/\\]/).pop() ?? 'archivo';

  const limpio = sinRuta
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/\.+/g, '.')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80);

  return limpio || 'archivo';
}

/**
 * Dónde va un archivo.
 *
 * Forma: `<uuid del aviso>/<marca>-<nombre>.<extensión>`
 *
 * El primer tramo es el aviso porque las políticas de storage lo leen
 * con `storage.foldername(name)[1]` para decidir quién puede tocarlo. Si
 * la ruta empezara por el usuario, un aviso que cambia de dueño —de una
 * persona a su inmobiliaria— dejaría sus fotos del otro lado.
 */
export function rutaDeArchivo(
  avisoId: string,
  nombreOriginal: string,
  extension: string,
  marca: number,
): string {
  const base = nombreSeguro(nombreOriginal).replace(/\.[a-z0-9]+$/, '');
  return `${avisoId}/${marca}-${base}.${extension}`;
}

/**
 * La ruta del original que corresponde a una pública.
 *
 * Se deriva, no se guarda aparte: dos campos que tienen que decir lo
 * mismo terminan diciendo cosas distintas.
 */
export function rutaDelOriginal(rutaPublica: string): string {
  return rutaPublica;
}
