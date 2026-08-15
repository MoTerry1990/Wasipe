import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';
import { SignJWT, jwtVerify } from 'jose';
import { sql, una } from '../db/cliente.ts';
import { ErrorHTTP } from './errores.ts';

// promisify() pierde la sobrecarga con opciones, así que la tipamos a mano.
const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options?: ScryptOptions,
) => Promise<Buffer>;

/* ------------------------------------------------------------------ */
/* Contraseñas                                                         */
/* ------------------------------------------------------------------ */

/**
 * scrypt en vez de bcrypt.
 *
 * AUTENTICACION.md decía bcrypt coste 12. Cambiado a propósito: bcrypt
 * nativo necesita binarios compilados que se rompen en Lambda, y bcryptjs
 * (JS puro) es demasiado lento. scrypt viene en node:crypto, es nativo,
 * y además es memory-hard — mejor que bcrypt frente a ataques con GPU.
 */
const SCRYPT = { N: 16384, r: 8, p: 1, largo: 64 } as const;

export async function hashearPassword(password: string): Promise<string> {
  validarLargoPassword(password);
  const salt = randomBytes(16);
  const clave = (await scryptAsync(password, salt, SCRYPT.largo, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  })) as Buffer;
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${clave.toString('base64')}`;
}

export async function verificarPassword(password: string, guardado: string): Promise<boolean> {
  const partes = guardado.split('$');
  if (partes[0] !== 'scrypt' || partes.length !== 6) return false;

  const N = Number(partes[1]);
  const r = Number(partes[2]);
  const p = Number(partes[3]);
  const salt = Buffer.from(partes[4]!, 'base64');
  const esperado = Buffer.from(partes[5]!, 'base64');

  const clave = (await scryptAsync(password, salt, esperado.length, { N, r, p })) as Buffer;
  return clave.length === esperado.length && timingSafeEqual(clave, esperado);
}

/**
 * Compara contra un hash falso. Se usa cuando el correo no existe, para que
 * el tiempo de respuesta no delate qué cuentas están registradas.
 */
const HASH_SEÑUELO =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

export async function quemarTiempo(password: string): Promise<void> {
  await verificarPassword(password, HASH_SEÑUELO).catch(() => false);
}

function validarLargoPassword(password: string) {
  // bcrypt truncaba a 72 BYTES; con scrypt no aplica, pero seguimos
  // validando un máximo razonable y el mínimo de 8.
  if (password.length < 8) {
    throw new ErrorHTTP(422, 'La contraseña necesita al menos 8 caracteres.', {
      codigo: 'PASSWORD_CORTA',
      campo: 'password',
    });
  }
  if (Buffer.byteLength(password, 'utf8') > 256) {
    throw new ErrorHTTP(422, 'Esa contraseña es demasiado larga.', {
      codigo: 'PASSWORD_LARGA',
      campo: 'password',
    });
  }
}

/* ------------------------------------------------------------------ */
/* Secreto de firma                                                    */
/* ------------------------------------------------------------------ */

let secretoCache: Uint8Array | null = null;

async function secreto(): Promise<Uint8Array> {
  if (secretoCache) return secretoCache;

  if (process.env.JWT_SECRET) {
    secretoCache = new TextEncoder().encode(process.env.JWT_SECRET);
    return secretoCache;
  }

  // Respaldo solo para el primer arranque sin configurar.
  const fila = await una<{ valor: string }>(
    `SELECT valor FROM config WHERE clave = 'jwt_secret'`,
  );
  if (fila) {
    secretoCache = new TextEncoder().encode(fila.valor);
    return secretoCache;
  }

  const nuevo = randomBytes(48).toString('base64');
  await sql(
    `INSERT INTO config (clave, valor) VALUES ('jwt_secret', $1)
     ON CONFLICT (clave) DO NOTHING`,
    [nuevo],
  );
  const definitivo =
    (await una<{ valor: string }>(`SELECT valor FROM config WHERE clave = 'jwt_secret'`))?.valor ??
    nuevo;
  secretoCache = new TextEncoder().encode(definitivo);
  return secretoCache;
}

/* ------------------------------------------------------------------ */
/* Sesión                                                              */
/* ------------------------------------------------------------------ */

/**
 * ¿Podemos exigir correo verificado?
 *
 * Solo si somos capaces de MANDAR el correo. Sin RESEND_API_KEY el token se
 * genera pero nunca llega, así que exigirlo deja a todo el mundo encerrado:
 * no puede publicar y no tiene forma de desbloquearse. Una barrera que no
 * se puede superar no protege nada, solo rompe el producto.
 *
 * En cuanto se configure el correo, la exigencia se activa sola.
 */
export const puedeExigirVerificacion = () => Boolean(process.env.RESEND_API_KEY);

export const COOKIE = 'wasipe_sesion';
const DIAS = 30;

export type Sesion = {
  id: string;
  rol: string;
  ver: number;
};

export async function firmarSesion(u: { id: string; rol: string; version_token: number }) {
  return new SignJWT({ rol: u.rol, ver: u.version_token })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(u.id)
    .setIssuedAt()
    .setExpirationTime(`${DIAS}d`)
    .sign(await secreto());
}

/** Verifica la firma. NO comprueba version_token — eso lo hace el middleware. */
export async function leerSesion(token: string): Promise<Sesion | null> {
  try {
    const { payload } = await jwtVerify(token, await secreto());
    if (!payload.sub) return null;
    return { id: payload.sub, rol: String(payload.rol), ver: Number(payload.ver ?? 0) };
  } catch {
    return null;
  }
}

export function cabeceraCookie(token: string, recordarme = true): string {
  const base = `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/`;
  return recordarme ? `${base}; Max-Age=${DIAS * 24 * 60 * 60}` : base;
}

export function cabeceraCookieBorrar(): string {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

/* ------------------------------------------------------------------ */
/* Tokens de un solo uso                                               */
/* ------------------------------------------------------------------ */

/** Devuelve { token, hash }. Se envía `token`; en la base se guarda `hash`. */
export function nuevoToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
