/**
 * El contrato para mandar un correo.
 *
 * ---------------------------------------------------------------------
 * LO QUE HAY QUE SABER ANTES DE USAR ESTO
 * ---------------------------------------------------------------------
 *
 * **Supabase no puede mandar este correo.** Su servicio de correo existe,
 * está configurado y funciona, pero solo para los mensajes que dispara el
 * propio Auth: confirmar una cuenta, recuperar una contraseña, invitar a
 * alguien. No hay ninguna API de «mandá este mensaje a esta dirección».
 *
 * Eso no es una limitación de configuración que se destrabe con una
 * variable: no existe el punto de entrada. Y la regla del proyecto es
 * costo cero, sin cuentas nuevas ni tarjetas, así que tampoco se enchufa
 * un servicio dedicado hoy.
 *
 * De ahí que el único proveedor que existe sea el de **bitácora**: deja
 * escrito en la base, con su asunto y su cuerpo, exactamente el correo
 * que se habría mandado. Todo lo demás de la tarea —recorrer las
 * búsquedas, encontrar los avisos nuevos, no repetir, respetar el
 * límite— funciona igual y se puede verificar igual.
 *
 * El día que haya un proveedor real se escribe un archivo hermano que
 * implemente esta misma interfaz y se cambia una línea en `correo()`.
 * Nada más de la tarea se entera.
 */

export type Mensaje = {
  /** A quién. */
  para: string;
  asunto: string;
  /** El cuerpo en texto plano. Sin HTML: acá no hace falta y complica. */
  cuerpo: string;
};

export type Resultado =
  | { ok: true; proveedor: string; estado: 'registrado' | 'enviado' }
  | { ok: false; proveedor: string; motivo: string };

export interface ProveedorDeCorreo {
  /** Cómo se llama, para dejarlo escrito junto a cada envío. */
  readonly nombre: string;

  /**
   * ¿Este proveedor entrega de verdad?
   *
   * Está en la interfaz y no como comentario porque la diferencia importa
   * para quien lee el registro: «registrado» y «enviado» no son lo mismo,
   * y confundirlos haría creer que a alguien le llegó un correo que nunca
   * salió.
   */
  readonly entregaDeVerdad: boolean;

  enviar(mensaje: Mensaje): Promise<Resultado>;
}
