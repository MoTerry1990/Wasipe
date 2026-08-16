import { FallaDeProveedor, IA_NO_DISPONIBLE, type ProveedorDeIA } from '@/lib/ia/proveedor';

/**
 * El proveedor que no hay.
 *
 * Es el que queda cuando no se configuró ninguno o cuando el elegido no
 * existe. Devolverlo en vez de reventar es lo que permite que Wasipe
 * entero siga funcionando sin IA: el asistente se muestra apagado y con
 * su explicación, y publicar a mano sigue igual de bien que siempre.
 */
export function proveedorNinguno(motivo = 'sin proveedor configurado'): ProveedorDeIA {
  return {
    nombre: 'ninguno',
    disponible: () => false,
    async generarTexto() {
      throw new FallaDeProveedor(IA_NO_DISPONIBLE, motivo, false);
    },
  };
}
