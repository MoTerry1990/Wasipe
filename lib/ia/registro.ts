import 'server-only';
import type { ProveedorDeIA, ProveedorDeImagen, ProveedorDeVideo } from '@/lib/ia/proveedor';
import { proveedorAnthropic } from '@/lib/ia/proveedores/anthropic';
import { proveedorImagenHttp } from '@/lib/ia/proveedores/imagen-http';
import { proveedorVideoHttp } from '@/lib/ia/proveedores/video-http';
import {
  proveedorNinguno,
  proveedorImagenNinguno,
  proveedorVideoNinguno,
} from '@/lib/ia/proveedores/ninguno';

/**
 * Qué proveedor de IA usa Wasipe hoy.
 *
 * Se elige con la variable `IA_PROVEEDOR`. Agregar otro es escribir un
 * adaptador en `lib/ia/proveedores/` y sumar una línea a este mapa; nada
 * más del código sabe qué empresa hay detrás.
 *
 * Las claves se leen acá dentro, en el servidor, y ninguna lleva el
 * prefijo NEXT_PUBLIC_: no hay forma de que lleguen al navegador.
 */

const FABRICAS: Record<string, () => ProveedorDeIA> = {
  anthropic: proveedorAnthropic,
  ninguno: () => proveedorNinguno(),
};

/** Los nombres válidos de IA_PROVEEDOR, para documentarlos y probarlos. */
export const PROVEEDORES = Object.keys(FABRICAS);

/** Cuál se usa si no se configuró nada. */
export const PROVEEDOR_POR_DEFECTO = 'anthropic';

let memoria: ProveedorDeIA | null = null;

/**
 * El proveedor activo.
 *
 * Un nombre desconocido no tumba la aplicación: se registra y se
 * devuelve el proveedor apagado, que es lo mismo que pasa cuando falta
 * la clave. Cualquier error de configuración termina en «Wasi AI no está
 * disponible», nunca en una pantalla rota.
 */
export function proveedorDeIA(): ProveedorDeIA {
  if (memoria) return memoria;

  const elegido = process.env.IA_PROVEEDOR?.trim() || PROVEEDOR_POR_DEFECTO;
  const fabrica = FABRICAS[elegido];

  if (!fabrica) {
    console.warn(`[wasi-ai] IA_PROVEEDOR="${elegido}" no existe. Wasi AI queda apagado.`);
    memoria = proveedorNinguno(`proveedor desconocido: ${elegido}`);
    return memoria;
  }

  memoria = fabrica();
  return memoria;
}

/** ¿Se le puede ofrecer el asistente a la persona? */
export function iaDisponible(): boolean {
  return proveedorDeIA().disponible();
}

// ---------------------------------------------------------------------
// Proveedor de imagen
//
// Se elige por separado del de texto: casi nunca es la misma empresa la
// que mejor escribe en castellano y la que mejor amuebla una sala. Que
// uno esté configurado y el otro no es normal y no rompe nada.
// ---------------------------------------------------------------------

const FABRICAS_DE_IMAGEN: Record<string, () => ProveedorDeImagen> = {
  http: proveedorImagenHttp,
  ninguno: () => proveedorImagenNinguno(),
};

export const PROVEEDORES_DE_IMAGEN = Object.keys(FABRICAS_DE_IMAGEN);

/** Sin nada configurado, la mejora de fotos queda apagada. */
export const PROVEEDOR_DE_IMAGEN_POR_DEFECTO = 'ninguno';

let memoriaDeImagen: ProveedorDeImagen | null = null;

export function proveedorDeImagen(): ProveedorDeImagen {
  if (memoriaDeImagen) return memoriaDeImagen;

  const elegido = process.env.IA_PROVEEDOR_IMAGEN?.trim() || PROVEEDOR_DE_IMAGEN_POR_DEFECTO;
  const fabrica = FABRICAS_DE_IMAGEN[elegido];

  if (!fabrica) {
    console.warn(
      `[wasi-ai] IA_PROVEEDOR_IMAGEN="${elegido}" no existe. La mejora de fotos queda apagada.`,
    );
    const apagado = proveedorImagenNinguno(`proveedor desconocido: ${elegido}`);
    memoriaDeImagen = apagado;
    return apagado;
  }

  memoriaDeImagen = fabrica();
  return memoriaDeImagen;
}

/** ¿Se le puede ofrecer la mejora de fotos a la persona? */
export function imagenDisponible(): boolean {
  return proveedorDeImagen().disponible();
}

// ---------------------------------------------------------------------
// Proveedor de video
//
// El tercero, y también independiente. El mismo adaptador `http` sirve
// para una API externa, para un servidor propio con Remotion y para una
// máquina nuestra con ffmpeg: lo único que Wasipe pide es que sepa
// encolar, decir cómo va y —si puede— cancelar.
// ---------------------------------------------------------------------

const FABRICAS_DE_VIDEO: Record<string, () => ProveedorDeVideo> = {
  http: proveedorVideoHttp,
  ninguno: () => proveedorVideoNinguno(),
};

export const PROVEEDORES_DE_VIDEO = Object.keys(FABRICAS_DE_VIDEO);

export const PROVEEDOR_DE_VIDEO_POR_DEFECTO = 'ninguno';

let memoriaDeVideo: ProveedorDeVideo | null = null;

export function proveedorDeVideo(): ProveedorDeVideo {
  if (memoriaDeVideo) return memoriaDeVideo;

  const elegido = process.env.IA_PROVEEDOR_VIDEO?.trim() || PROVEEDOR_DE_VIDEO_POR_DEFECTO;
  const fabrica = FABRICAS_DE_VIDEO[elegido];

  if (!fabrica) {
    console.warn(
      `[wasi-ai] IA_PROVEEDOR_VIDEO="${elegido}" no existe. El video queda apagado.`,
    );
    const apagado = proveedorVideoNinguno(`proveedor desconocido: ${elegido}`);
    memoriaDeVideo = apagado;
    return apagado;
  }

  memoriaDeVideo = fabrica();
  return memoriaDeVideo;
}

/** ¿Se le puede ofrecer el video automático a la persona? */
export function videoDisponible(): boolean {
  return proveedorDeVideo().disponible();
}

/** Solo para las pruebas: olvida los proveedores memorizados. */
export function olvidarProveedor(): void {
  memoria = null;
  memoriaDeImagen = null;
  memoriaDeVideo = null;
}
