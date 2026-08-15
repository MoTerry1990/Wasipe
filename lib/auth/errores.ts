import type { AuthError } from '@supabase/supabase-js';

/**
 * Errores de autenticación en castellano y en tono humano.
 *
 * Supabase responde en inglés y con jerga técnica ("Invalid login
 * credentials", "AuthApiError"). Mostrar eso tal cual rompe la regla de
 * idioma y además no ayuda: la persona no sabe si se equivocó de correo,
 * de contraseña, o si el sistema se cayó.
 *
 * Cada mensaje dice qué pasó y qué hacer. Ninguno revela si un correo
 * está registrado o no: eso permitiría averiguar quién tiene cuenta.
 */

const POR_CODIGO: Record<string, string> = {
  invalid_credentials: 'El correo o la contraseña no coinciden. Vuelve a intentarlo.',
  email_not_confirmed:
    'Todavía no confirmaste tu correo. Revisa tu bandeja —y también el correo no deseado— y abre el enlace que te enviamos.',
  user_already_exists:
    'Ese correo ya tiene una cuenta. Puedes ingresar o recuperar tu contraseña.',
  email_exists: 'Ese correo ya tiene una cuenta. Puedes ingresar o recuperar tu contraseña.',
  weak_password:
    'La contraseña es muy corta. Usa al menos 8 caracteres; una frase que recuerdes funciona bien.',
  same_password: 'La contraseña nueva es igual a la anterior. Elige una distinta.',
  over_email_send_rate_limit:
    'Enviamos varios correos seguidos a esa dirección. Espera unos minutos antes de pedir otro.',
  over_request_rate_limit: 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.',
  otp_expired: 'El enlace venció. Pide uno nuevo y ábrelo dentro de la hora.',
  validation_failed: 'Revisa los datos: hay algo que no está completo o bien escrito.',
  user_not_found: 'No encontramos esa cuenta.',
  session_not_found: 'Tu sesión venció. Vuelve a ingresar.',
  signup_disabled: 'El registro está cerrado por el momento.',
  provider_disabled: 'Esa forma de ingresar no está habilitada.',
};

/** Respaldo cuando el error llega sin código, solo con texto en inglés. */
const POR_TEXTO: [RegExp, string][] = [
  [/invalid login credentials/i, POR_CODIGO.invalid_credentials!],
  [/email not confirmed/i, POR_CODIGO.email_not_confirmed!],
  [/already registered|already exists/i, POR_CODIGO.user_already_exists!],
  [/password should be at least/i, POR_CODIGO.weak_password!],
  [/rate limit|too many requests/i, POR_CODIGO.over_request_rate_limit!],
  [/expired|invalid.*token/i, POR_CODIGO.otp_expired!],
  [/fetch failed|network|timeout/i, 'No pudimos conectarnos. Revisa tu internet y reintenta.'],
];

const GENERICO = 'Algo salió mal de nuestro lado. Vuelve a intentarlo en un momento.';

/** Traduce un error de Supabase a un mensaje que se puede mostrar. */
export function mensajeDeError(error: AuthError | Error | null | undefined): string {
  if (!error) return GENERICO;

  const codigo = (error as AuthError).code;
  if (codigo && POR_CODIGO[codigo]) return POR_CODIGO[codigo];

  const texto = error.message ?? '';
  for (const [patron, mensaje] of POR_TEXTO) {
    if (patron.test(texto)) return mensaje;
  }

  return GENERICO;
}

/**
 * Mensaje para el pedido de recuperación de contraseña.
 *
 * Siempre el mismo, exista o no la cuenta. Si dijéramos "ese correo no
 * está registrado", cualquiera podría ir probando direcciones para armar
 * una lista de usuarios de Wasipe.
 */
export const AVISO_RECUPERACION =
  'Si esa dirección tiene una cuenta, te enviamos un enlace para crear una contraseña nueva. Revisa tu bandeja y el correo no deseado.';
