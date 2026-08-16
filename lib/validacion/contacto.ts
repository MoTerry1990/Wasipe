import { z } from 'zod';

/**
 * Validación del contacto con quien publica.
 *
 * Los mensajes están escritos para mostrarse tal cual debajo del campo.
 * El mismo esquema corre en el navegador y en el servidor, así que una
 * petición armada a mano encuentra la misma puerta.
 */

const celular = z
  .string()
  .trim()
  .regex(/^9\d{8}$/, 'El celular tiene 9 dígitos y empieza con 9. Ejemplo: 987654321');

const correo = z
  .string()
  .trim()
  .email('Ese correo no parece completo. Revisa que tenga @ y el dominio.')
  .transform((v) => v.toLowerCase());

const base = {
  aviso: z.string().min(1),
  nombre: z
    .string()
    .trim()
    .min(2, 'Escribe tu nombre')
    .max(80, 'Ese nombre es demasiado largo'),
  celular,
  correo: correo.optional().or(z.literal('')),
  mensaje: z
    .string()
    .trim()
    .min(10, 'Cuéntale algo más: con menos de diez caracteres no sabe qué responderte')
    .max(2000, 'El mensaje no puede pasar de 2000 caracteres'),
};

export const esquemaConsulta = z.object(base);

export const esquemaVisita = z.object({
  ...base,
  fecha: z
    .string()
    .min(1, 'Elige un día para la visita')
    .refine((valor) => !Number.isNaN(Date.parse(valor)), 'Esa fecha no es válida')
    .refine((valor) => {
      const cuando = new Date(valor);
      const manana = new Date();
      manana.setHours(0, 0, 0, 0);
      return cuando >= manana;
    }, 'La visita tiene que ser de hoy en adelante'),
});

export const esquemaDenuncia = z.object({
  aviso: z.string().min(1),
  motivo: z.enum(
    [
      'duplicate',
      'wrong_price',
      'already_taken',
      'fake_photos',
      'scam',
      'wrong_location',
      'other',
    ],
    { message: 'Elige un motivo' },
  ),
  detalle: z
    .string()
    .trim()
    .max(1000, 'El detalle no puede pasar de 1000 caracteres')
    .optional(),
});

export type DatosConsulta = z.infer<typeof esquemaConsulta>;
export type DatosVisita = z.infer<typeof esquemaVisita>;

// ---------------------------------------------------------------------
// Protección contra envíos automáticos
// ---------------------------------------------------------------------

/**
 * Campo trampa.
 *
 * Es un campo de verdad, oculto por CSS y fuera del orden de tabulación.
 * Una persona no lo ve y nunca lo llena; un robot que completa todo lo
 * que encuentra, sí.
 *
 * Se eligió esto en vez de un captcha a propósito: un captcha castiga a
 * quien tiene mala vista, mala conexión o simplemente prisa, y en un
 * portal inmobiliario cada formulario abandonado es una consulta que no
 * llega. La trampa no molesta a nadie.
 */
export const CAMPO_TRAMPA = 'apellido_materno';

/**
 * Cuánto tarda una persona, como mínimo, en llenar el formulario.
 *
 * Tres segundos es muy poco para escribir nombre, teléfono y un mensaje;
 * para un robot es una eternidad. Se mide desde que se dibuja el
 * formulario, con una marca de tiempo que viaja en un campo oculto.
 */
export const SEGUNDOS_MINIMOS = 3;

export type Trampa = { paso: true } | { paso: false; motivo: string };

/** Revisa las dos defensas que no molestan a nadie. */
export function revisarTrampa(datos: {
  trampa: unknown;
  abiertoEn: unknown;
  ahora?: number;
}): Trampa {
  if (typeof datos.trampa === 'string' && datos.trampa.trim() !== '') {
    return { paso: false, motivo: 'campo trampa completado' };
  }

  const abierto = Number(datos.abiertoEn);
  if (!Number.isFinite(abierto)) {
    // Sin la marca de tiempo no se puede medir; se deja pasar en vez de
    // rechazar a alguien con JavaScript desactivado.
    return { paso: true };
  }

  const ahora = datos.ahora ?? Date.now();
  const segundos = (ahora - abierto) / 1000;

  if (segundos < SEGUNDOS_MINIMOS) {
    return { paso: false, motivo: 'formulario enviado demasiado rápido' };
  }

  // Un formulario abierto hace ocho horas probablemente es una pestaña
  // olvidada; la marca no sirve para nada, pero tampoco es sospechosa.
  return { paso: true };
}

/**
 * Lo que se le responde a un envío automático.
 *
 * Se responde que salió bien. Decirle "detectamos un robot" a un robot es
 * regalarle la información que necesita para ajustar su script; para una
 * persona que cayó acá por error, un error confuso es peor que nada.
 */
export const RESPUESTA_A_ROBOT =
  'Listo, enviamos tu mensaje. Quien publica el aviso te va a responder al número que dejaste.';
