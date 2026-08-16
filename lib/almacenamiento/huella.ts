/**
 * La huella de una imagen.
 *
 * Sirve para una sola cosa: darse cuenta de que la misma foto está en dos
 * avisos. Casi siempre es la misma inmobiliaria republicando lo suyo, que
 * es legítimo; a veces es alguien que sacó la foto de internet y publica
 * un departamento que no existe. La bandera solo señala; decide una
 * persona.
 *
 * **No es un hash perceptual.** Es SHA-256 del archivo entero, así que
 * encuentra el archivo idéntico y nada más: recomprimir la foto, recortar
 * un borde o cambiarle un píxel da otra huella. Un hash perceptual
 * encontraría también esas, y algún día habrá que ponerlo.
 *
 * Se eligió el exacto igual, por tres razones que hoy pesan más:
 *
 *  1. Es determinista. Dos ejecuciones dan lo mismo, siempre, y una
 *     bandera que aparece y desaparece no la mira nadie.
 *  2. No tiene falsos positivos. Un hash perceptual mal calibrado marca
 *     dos cocinas blancas distintas como la misma foto, y acusar a
 *     alguien de copiar cuando no copió cuesta caro.
 *  3. `crypto.subtle` viene en el navegador y en Node. Sin dependencias,
 *     sin procesar imágenes, sin nada que instalar.
 *
 * El caso que sí atrapa —el mismo archivo subido dos veces— es además el
 * más común, porque quien copia una foto de otro portal la baja y la sube
 * tal cual.
 */

/** Prefijo con la versión del algoritmo. */
const VERSION = 'sha256';

/**
 * Calcula la huella de un archivo.
 *
 * La versión va adelante para que el día que entre un hash perceptual las
 * huellas viejas se distingan solas y se puedan recalcular sin adivinar
 * cuáles son cuáles.
 */
export async function huellaDe(contenido: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes =
    contenido instanceof Uint8Array
      ? new Uint8Array(contenido).buffer.slice(
          contenido.byteOffset,
          contenido.byteOffset + contenido.byteLength,
        )
      : contenido;

  const resumen = await crypto.subtle.digest('SHA-256', bytes as ArrayBuffer);

  const hexadecimal = [...new Uint8Array(resumen)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `${VERSION}:${hexadecimal}`;
}

/** ¿Esto tiene forma de huella nuestra? */
export function esHuella(valor: string | null | undefined): boolean {
  return typeof valor === 'string' && /^sha256:[0-9a-f]{64}$/.test(valor);
}

/**
 * ¿Con qué algoritmo se calculó?
 *
 * Sirve para el día que haya dos: se puede pedir «recalcular todas las
 * que digan sha256» sin tocar las nuevas.
 */
export function versionDe(huella: string): string | null {
  const corte = huella.indexOf(':');
  return corte > 0 ? huella.slice(0, corte) : null;
}
