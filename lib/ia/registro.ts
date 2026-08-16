import 'server-only';
import type { ProveedorDeIA } from '@/lib/ia/proveedor';
import { proveedorAnthropic } from '@/lib/ia/proveedores/anthropic';
import { proveedorNinguno } from '@/lib/ia/proveedores/ninguno';

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

/** Solo para las pruebas: olvida el proveedor memorizado. */
export function olvidarProveedor(): void {
  memoria = null;
}
