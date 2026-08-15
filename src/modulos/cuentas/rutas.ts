import { Hono } from 'hono';
import { z } from 'zod';
import * as s from './servicio.ts';
import { cabeceraCookie, cabeceraCookieBorrar } from '../../lib/auth.ts';
import { conSesion } from '../../lib/middleware.ts';
import {
  validar,
  email,
  password,
  nombre,
  celularOpcional,
  rolAutoservicio,
  textoOpcional,
  uuid,
} from '../../lib/validar.ts';

export const cuentas = new Hono();

const ipDe = (c: { req: { header: (n: string) => string | undefined } }) =>
  c.req.header('x-nf-client-connection-ip') ??
  c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
  'desconocida';

/* ------------------------------ registro ------------------------------ */

const esquemaRegistro = z.object({
  email,
  password,
  nombre,
  rol: rolAutoservicio.default('comprador'),
  telefono: celularOpcional,
});

cuentas.post('/registro', async (c) => {
  const d = validar(esquemaRegistro, await c.req.json());
  const { usuario, jwt } = await s.registrar(d, ipDe(c));

  c.header('Set-Cookie', cabeceraCookie(jwt));
  return c.json(
    {
      usuario: { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol },
      mensaje: 'Te mandamos un correo para confirmar tu cuenta.',
    },
    201,
  );
});

/* ------------------------------- ingreso ------------------------------ */

const esquemaIngreso = z.object({
  email,
  password: z.string().min(1, 'Escribe tu contraseña.'),
  recordarme: z.boolean().default(true),
});

cuentas.post('/ingresar', async (c) => {
  const d = validar(esquemaIngreso, await c.req.json());
  const { usuario, jwt } = await s.ingresar(d.email, d.password, ipDe(c));

  c.header('Set-Cookie', cabeceraCookie(jwt, d.recordarme));
  return c.json({
    usuario: { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol },
  });
});

/* -------------------------------- salir ------------------------------- */

cuentas.post('/salir', (c) => {
  c.header('Set-Cookie', cabeceraCookieBorrar());
  return c.json({ ok: true, mensaje: 'Cerraste sesión.' });
});

cuentas.post('/salir-todo', conSesion(), async (c) => {
  await s.salirDeTodo(c.get('usuario').id);
  c.header('Set-Cookie', cabeceraCookieBorrar());
  return c.json({ ok: true, mensaje: 'Cerramos la sesión en todos tus dispositivos.' });
});

/* --------------------------------- yo --------------------------------- */

cuentas.get('/yo', conSesion(), async (c) => c.json(await s.yo(c.get('usuario').id)));

/* ---------------------------- verificación ---------------------------- */

cuentas.post('/verificar-email/confirmar', async (c) => {
  const { token } = validar(z.object({ token: z.string().min(10) }), await c.req.json());
  return c.json(await s.confirmarEmail(token));
});

/* ------------------------- recuperar contraseña ----------------------- */

cuentas.post('/recuperar', async (c) => {
  const d = validar(z.object({ email }), await c.req.json());
  await s.pedirRecuperacion(d.email);
  // Respuesta idéntica exista o no la cuenta: si no, el endpoint sirve
  // para averiguar qué correos están registrados.
  return c.json({
    ok: true,
    mensaje: 'Si esa cuenta existe, te llegará un correo con las instrucciones.',
  });
});

cuentas.post('/recuperar/confirmar', async (c) => {
  const d = validar(z.object({ token: z.string().min(10), password }), await c.req.json());
  return c.json(await s.confirmarRecuperacion(d.token, d.password));
});

cuentas.patch('/password', conSesion(), async (c) => {
  const d = validar(
    z.object({ password_actual: z.string().min(1), password_nueva: password }),
    await c.req.json(),
  );
  const r = await s.cambiarPassword(c.get('usuario').id, d.password_actual, d.password_nueva);
  c.header('Set-Cookie', cabeceraCookieBorrar());
  return c.json(r);
});

/* -------------------------------- perfil ------------------------------ */

export const perfil = new Hono();

const esquemaPerfil = z.object({
  nombre: nombre.optional(),
  telefono: celularOpcional,
  whatsapp: celularOpcional,
  foto_url: textoOpcional(500),
  bio: textoOpcional(600),
  sitio_web: textoOpcional(300),
  ubicacion_id: uuid.nullable().optional(),
});

perfil.get('/', conSesion(), async (c) => {
  const r = await s.yo(c.get('usuario').id);
  return c.json({ perfil: r.perfil, usuario: r.usuario });
});

perfil.patch('/', conSesion(), async (c) => {
  // validar() ya descarta lo que no está en el esquema; el servicio
  // aplica además una lista blanca explícita antes del UPDATE.
  const d = validar(esquemaPerfil, await c.req.json());
  return c.json(await s.actualizarPerfil(c.get('usuario').id, d));
});
