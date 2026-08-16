import type { ErrorEvent, EventHint } from '@sentry/nextjs';

/**
 * Cómo se configura Sentry, en un solo sitio.
 *
 * Los tres archivos de arranque —navegador, servidor y borde— importan de
 * acá en vez de repetir la configuración. Con tres copias, el día que se
 * agrega un campo a la lista de cosas que hay que borrar, se agrega en
 * dos y la tercera sigue mandando datos personales durante meses.
 *
 * La decisión de fondo: **un registro de errores es un lugar donde los
 * datos personales se quedan para siempre**. Lo ve todo el equipo, se
 * exporta, se indexa, y borrarlo después de que entró es casi imposible.
 * Así que se limpia a la salida, antes de mandar, y se limpia de más.
 */

/** Sin DSN, Sentry no manda nada. Es el interruptor. */
export const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? '';

export const HABILITADO = DSN.length > 0;

/**
 * En qué entorno corre esto.
 *
 * Vercel lo dice: `production` para el dominio principal, `preview` para
 * cada rama. Mezclarlos hace que un error de una vista previa dispare la
 * misma alarma que uno de producción, y a la tercera vez nadie mira.
 */
export const ENTORNO =
  process.env.NEXT_PUBLIC_ENTORNO ?? process.env.VERCEL_ENV ?? 'desarrollo';

/**
 * Qué versión del código falló.
 *
 * Es el commit. Sin esto, una traza apunta a una línea que puede no
 * existir más, y los source maps no se pueden asociar.
 */
export const VERSION =
  process.env.NEXT_PUBLIC_VERSION ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'local';

/**
 * Cuánto se muestrea.
 *
 * Los errores van enteros: si algo falló, hay que verlo. Las trazas de
 * rendimiento van al 10 % en producción, porque son continuas y ahí es
 * donde se va la cuota. En desarrollo, todo, que es cuando se mira.
 */
export const MUESTREO_DE_ERRORES = 1.0;
export const MUESTREO_DE_TRAZAS = ENTORNO === 'production' ? 0.1 : 1.0;

/**
 * Los campos que nunca salen de acá.
 *
 * La lista es larga a propósito y mezcla castellano e inglés: el código
 * está en inglés, los mensajes en castellano, y un dato personal no
 * distingue idiomas.
 */
const PROHIBIDOS = [
  'password',
  'passwd',
  'clave',
  'contrasena',
  'contraseña',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'cookie',
  'set-cookie',
  'apikey',
  'api_key',
  'secret',
  'service_role',
  'email',
  'correo',
  'phone',
  'telefono',
  'teléfono',
  'whatsapp',
  'dni',
  'ruc',
  'address',
  'direccion',
  'dirección',
  'exact_lat',
  'exact_lon',
];

const esProhibido = (clave: string) => PROHIBIDOS.some((p) => clave.toLowerCase().includes(p));

/**
 * Recorre un objeto y tapa lo que no puede salir.
 *
 * Tapa el valor y deja la llave: saber que **había** un correo y no cuál
 * era suele ser suficiente para depurar, y borrar la llave entera hace
 * que el error se lea peor sin ganar nada.
 */
function limpiar(valor: unknown, profundidad = 0): unknown {
  if (profundidad > 6 || valor === null || typeof valor !== 'object') return valor;

  if (Array.isArray(valor)) return valor.slice(0, 50).map((v) => limpiar(v, profundidad + 1));

  const salida: Record<string, unknown> = {};
  for (const [clave, contenido] of Object.entries(valor as Record<string, unknown>)) {
    salida[clave] = esProhibido(clave) ? '[oculto]' : limpiar(contenido, profundidad + 1);
  }
  return salida;
}

/**
 * Quita de una dirección lo que no debería viajar.
 *
 * Una URL con `?correo=alguien@ejemplo.pe` termina en el título del
 * error, en la lista, en el correo de alerta y en la búsqueda.
 */
function limpiarUrl(url: string): string {
  try {
    const direccion = new URL(url);
    for (const clave of [...direccion.searchParams.keys()]) {
      if (esProhibido(clave)) direccion.searchParams.set(clave, '[oculto]');
    }
    return direccion.toString();
  } catch {
    return url;
  }
}

/**
 * Lo último que pasa antes de mandar un evento.
 *
 * Devolver `null` lo descarta. Se usa para dos cosas: apagar Sentry
 * cuando no hay DSN, y no mandar ruido que no es un error nuestro.
 */
export function antesDeEnviar(evento: ErrorEvent, _pista?: EventHint): ErrorEvent | null {
  if (!HABILITADO) return null;
  return limpiarEvento(evento);
}

/**
 * Le quita a un evento todo lo que no puede salir de acá.
 *
 * Va aparte del interruptor a propósito. Son dos decisiones distintas
 * —«¿mandamos algo?» y «¿qué le sacamos?»— y juntarlas hacía que la
 * segunda, que es la que protege a las personas, solo se pudiera probar
 * teniendo Sentry conectado. Ahora se prueba siempre.
 *
 * Devuelve `null` cuando el evento no vale la pena mandarlo.
 */
export function limpiarEvento(evento: ErrorEvent): ErrorEvent | null {
  // Una extensión del navegador que revienta no es un fallo de Wasipe, y
  // llena el registro hasta que los errores de verdad no se ven.
  const valor = evento.exception?.values?.[0]?.value ?? '';
  if (/extension:\/\/|chrome-extension|ResizeObserver loop/i.test(valor)) return null;

  // Nunca la dirección IP ni el correo. Sentry los toma solo si se le
  // pide, pero el valor por defecto cambia entre versiones.
  if (evento.user) {
    evento.user = { id: evento.user.id };
  }

  if (evento.request) {
    if (evento.request.url) evento.request.url = limpiarUrl(evento.request.url);
    delete evento.request.cookies;
    delete evento.request.headers;
    if (evento.request.data) evento.request.data = limpiar(evento.request.data);
    if (evento.request.query_string) evento.request.query_string = '[oculto]';
  }

  if (evento.extra) evento.extra = limpiar(evento.extra) as Record<string, unknown>;
  if (evento.contexts) evento.contexts = limpiar(evento.contexts) as typeof evento.contexts;

  // Las migas de pan guardan cada clic y cada petición. Ahí es donde se
  // cuela un formulario entero sin que nadie lo haya pedido.
  if (evento.breadcrumbs) {
    evento.breadcrumbs = evento.breadcrumbs.slice(-20).map((miga) => ({
      ...miga,
      data: miga.data ? (limpiar(miga.data) as Record<string, unknown>) : undefined,
    }));
  }

  return evento;
}

/** La configuración común a los tres entornos de ejecución. */
export const CONFIGURACION = {
  dsn: DSN,
  environment: ENTORNO,
  release: VERSION,
  enabled: HABILITADO,
  sampleRate: MUESTREO_DE_ERRORES,
  tracesSampleRate: MUESTREO_DE_TRAZAS,
  // Sin datos personales por defecto. Es lo contrario de lo que trae
  // Sentry, y es a propósito.
  sendDefaultPii: false,
  beforeSend: antesDeEnviar,
} as const;
