import { Hono } from 'hono';
import { ErrorHTTP } from './lib/errores.ts';
import { hayBase, pingBase } from './db/cliente.ts';
import { asegurarEsquema } from './db/asegurar-esquema.ts';
import { cargarSesion } from './lib/middleware.ts';
import { cuentas, perfil } from './modulos/cuentas/rutas.ts';
import { ubicaciones } from './modulos/ubicaciones/rutas.ts';
import { medios } from './modulos/medios/rutas.ts';
import { propiedades } from './modulos/propiedades/rutas.ts';
import { indice } from './modulos/indice/rutas.ts';
import { busqueda } from './modulos/busqueda/rutas.ts';

export const app = new Hono().basePath('/api/v1');

/* --------------------------------------------------------------- */
/* Cabeceras de seguridad                                           */
/* --------------------------------------------------------------- */
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-Frame-Options', 'DENY');
});

/* --------------------------------------------------------------- */
/* CSRF: toda mutación debe declarar JSON.                          */
/* Un form cross-site no puede mandar este content-type sin         */
/* disparar preflight CORS, y CORS está cerrado a nuestro origen.   */
/* --------------------------------------------------------------- */
app.use('*', async (c, next) => {
  const muta = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method);
  if (muta) {
    const tipo = c.req.header('content-type') ?? '';
    if (!tipo.includes('application/json')) {
      throw new ErrorHTTP(400, 'Petición mal formada.', { codigo: 'CONTENT_TYPE' });
    }
  }
  await next();
});

/* --------------------------------------------------------------- */
/* Esquema                                                          */
/*                                                                  */
/* En deploy manual Netlify no corre el build, así que las tablas se */
/* crean acá en el primer request. Es una promesa por proceso: solo  */
/* el primer request de un arranque en frío paga el costo.           */
/*                                                                  */
/* Va ANTES de /salud a propósito: en Hono, el middleware declarado  */
/* después de una ruta no se aplica a esa ruta.                      */
/* --------------------------------------------------------------- */
app.use('*', async (c, next) => {
  try {
    await asegurarEsquema();
  } catch (e) {
    console.error('[esquema]', e);
  }
  return next();
});

/* --------------------------------------------------------------- */
/* Salud                                                            */
/* --------------------------------------------------------------- */
app.get('/salud', async (c) => {
  const conectada = await pingBase();
  return c.json(
    {
      ok: conectada,
      bd: conectada ? 'conectada' : hayBase() ? 'error' : 'sin-conexion',
      hora: new Date().toISOString(),
      version: 'v1',
      servicios: {
        cloudinary: Boolean(process.env.CLOUDINARY_API_SECRET),
        correo: Boolean(process.env.RESEND_API_KEY),
        pagos: Boolean(process.env.CULQI_SECRET_KEY),
        jwt: Boolean(process.env.JWT_SECRET),
      },
      // Sin correo configurado no se puede exigir verificación: el token
      // se genera pero no llega a nadie.
      exige_verificacion: Boolean(process.env.RESEND_API_KEY),
    },
    conectada ? 200 : 503,
  );
});

/* --------------------------------------------------------------- */
/* Módulos                                                          */
/* --------------------------------------------------------------- */
app.use('*', cargarSesion);
app.route('/cuentas', cuentas);
app.route('/perfil', perfil);
app.route('/ubicaciones', ubicaciones);
app.route('/medios', medios);
app.route('/propiedades', propiedades);
app.route('/indice', indice);
app.route('/buscar', busqueda);
// Siguiente: leads (M9).
// Ver PLAN-IMPLEMENTACION.md

/* --------------------------------------------------------------- */
/* 404 y errores                                                    */
/* --------------------------------------------------------------- */
app.notFound((c) =>
  c.json({ error: 'Esa dirección no existe.', codigo: 'NO_ENCONTRADO' }, 404),
);

app.onError((err, c) => {
  if (err instanceof ErrorHTTP) {
    return c.json(err.aRespuesta(), err.estado as 400);
  }

  // Errores que traen .http (por ejemplo, base sin conectar)
  const http = (err as Error & { http?: number }).http;
  if (http) {
    return c.json({ error: err.message, codigo: 'NO_DISPONIBLE' }, http as 503);
  }

  console.error('[error]', err);
  return c.json(
    { error: 'Algo falló de nuestro lado. Ya lo estamos viendo.', codigo: 'ERROR_INTERNO' },
    500,
  );
});
