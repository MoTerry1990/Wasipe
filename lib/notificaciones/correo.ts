import 'server-only';

import type { Mensaje, ProveedorDeCorreo, Resultado } from '@/lib/notificaciones/proveedor';

/**
 * El proveedor de correo que usa Wasipe.
 *
 * Hoy hay uno solo: la **bitácora**. Deja escrito el correo completo —a
 * quién, con qué asunto y con qué cuerpo— y no lo entrega. El porqué está
 * en `proveedor.ts`: Supabase no expone forma de mandar correo que no sea
 * de autenticación, y no se abren cuentas nuevas.
 *
 * Que no entregue no lo vuelve inútil. Con esto se puede comprobar que la
 * tarea corre, a quién le habría escrito, con qué contenido, cuántas
 * veces y respetando qué límites. Es todo lo que se puede saber sin un
 * buzón, y es bastante más que nada.
 */

class Bitacora implements ProveedorDeCorreo {
  readonly nombre = 'registro';
  readonly entregaDeVerdad = false;

  async enviar(mensaje: Mensaje): Promise<Resultado> {
    // El cuerpo se guarda en la tabla de notificaciones desde quien
    // llama, que es donde está el contexto de la búsqueda. Acá solo se
    // confirma que el proveedor lo aceptó.
    if (!mensaje.para.includes('@')) {
      return { ok: false, proveedor: this.nombre, motivo: 'La dirección no parece un correo.' };
    }

    return { ok: true, proveedor: this.nombre, estado: 'registrado' };
  }
}

let instancia: ProveedorDeCorreo | null = null;

/**
 * El proveedor activo.
 *
 * Cuando haya uno de verdad, se escribe su clase en un archivo hermano y
 * se cambia el `new` de acá. Ni la tarea ni el contenido del correo se
 * enteran: por eso la interfaz existe desde el primer día, aunque hoy
 * tenga una sola implementación.
 */
export function correo(): ProveedorDeCorreo {
  instancia ??= new Bitacora();
  return instancia;
}
