import {
  FallaDeProveedor,
  IA_NO_DISPONIBLE,
  IMAGEN_NO_DISPONIBLE,
  type ProveedorDeIA,
  type ProveedorDeImagen,
} from '@/lib/ia/proveedor';

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

/** Lo mismo para las fotos: sin proveedor, se publican tal como se subieron. */
export function proveedorImagenNinguno(motivo = 'sin proveedor de imagen'): ProveedorDeImagen {
  return {
    nombre: 'ninguno',
    disponible: () => false,
    soporta: () => false,
    async editarImagen() {
      throw new FallaDeProveedor(IMAGEN_NO_DISPONIBLE, motivo, false);
    },
  };
}
