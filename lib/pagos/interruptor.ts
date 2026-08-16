import 'server-only';

/**
 * El interruptor de cobros reales.
 *
 * Hoy Wasipe no tiene pasarela conectada, así que nada cobra. Este
 * archivo existe igual, y a propósito: la diferencia entre «no cobra
 * porque nadie lo programó» y «no cobra porque está apagado» es que lo
 * segundo se puede comprobar, y lo primero se descubre el día que
 * alguien conecta Culqi con las claves de producción sin darse cuenta.
 *
 * La regla del sprint 17 es explícita: **el modo de cobro real queda
 * desactivado hasta que se apruebe expresamente**. Acá está escrita como
 * código, no como una nota en un documento.
 *
 * Cómo se enciende, el día que se decida:
 *
 *  1. `PAGOS_EN_VIVO=si` en las variables de producción.
 *  2. Las tres claves de Culqi cargadas.
 *  3. Un despliegue nuevo.
 *
 * Los tres pasos, y en producción. No hay forma de encenderlo desde una
 * pantalla de administración, y eso también es a propósito: una cuenta
 * comprometida no puede empezar a cobrarle a la gente.
 */

export type EstadoDePagos = {
  /** ¿Se puede cobrar de verdad? */
  enVivo: boolean;
  /** ¿Hay una pasarela configurada, sea de prueba o real? */
  configurada: boolean;
  /** Qué falta, en castellano, para mostrarlo en el panel. */
  porQueNo: string | null;
};

export function estadoDePagos(): EstadoDePagos {
  const claves = [
    process.env.CULQI_PUBLIC_KEY,
    process.env.CULQI_SECRET_KEY,
    process.env.CULQI_WEBHOOK_SECRET,
  ];
  const configurada = claves.every((c) => Boolean(c?.trim()));
  const encendido = process.env.PAGOS_EN_VIVO?.trim().toLowerCase() === 'si';

  if (!configurada) {
    return {
      enVivo: false,
      configurada: false,
      porQueNo: 'Todavía no hay pasarela de pagos conectada. Publicar es gratis igual.',
    };
  }

  if (!encendido) {
    return {
      enVivo: false,
      configurada: true,
      porQueNo:
        'La pasarela está conectada pero los cobros reales siguen apagados. Se encienden con PAGOS_EN_VIVO=si en producción.',
    };
  }

  return { enVivo: true, configurada: true, porQueNo: null };
}

/**
 * Se llama antes de cualquier cobro.
 *
 * Levanta excepción en vez de devolver un valor: un cobro que se ignora
 * en silencio deja a la persona creyendo que pagó. Es preferible que
 * falle ruidosamente y que alguien lo vea.
 */
export function exigirPagosEnVivo(): void {
  const estado = estadoDePagos();
  if (!estado.enVivo) {
    throw new Error(`Los cobros están desactivados. ${estado.porQueNo ?? ''}`.trim());
  }
}

/**
 * Que las claves sean de prueba y no de producción.
 *
 * Culqi distingue por prefijo: `pk_test_` y `sk_test_` contra `pk_live_`
 * y `sk_live_`. Una clave de producción cargada por error mientras el
 * interruptor está apagado no cobra nada —el interruptor manda— pero es
 * una señal de que alguien se equivocó de entorno, y conviene verlo.
 */
export function clavesDePrueba(): boolean {
  const publica = process.env.CULQI_PUBLIC_KEY ?? '';
  const secreta = process.env.CULQI_SECRET_KEY ?? '';
  if (!publica && !secreta) return true;
  return publica.startsWith('pk_test_') && secreta.startsWith('sk_test_');
}
