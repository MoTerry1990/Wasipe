import { Hono } from 'hono';
import { z } from 'zod';
import { sql, una } from '../../db/cliente.ts';
import { conSesion } from '../../lib/middleware.ts';
import { noEncontrado, ErrorHTTP } from '../../lib/errores.ts';
import { validar } from '../../lib/validar.ts';
import { consumirCuotaIndice } from '../../servicios/limites.ts';

export const indice = new Hono();

const AVISO =
  'Referenciales y redondeados, calculados con avisos activos y cierres reportados ' +
  'en Wasipe. No reemplazan una tasación.';

type Fila = {
  distrito: string;
  slug: string;
  precio_m2_usd: string;
  alquiler_2d_pen: string | null;
  var_12m: string | null;
  muestras: number;
  periodo: string;
};

const armar = (f: Fila) => ({
  distrito: f.distrito,
  slug: f.slug,
  precio_m2_usd: Number(f.precio_m2_usd),
  alquiler_2d_pen: f.alquiler_2d_pen ? Number(f.alquiler_2d_pen) : null,
  var_12m: f.var_12m ? Number(f.var_12m) : null,
  muestras: f.muestras,
  // muestras = 0 significa dato provisional de arranque, todavía sin
  // operaciones reales detrás. Se marca para no aparentar precisión.
  confianza: f.muestras === 0 ? 'provisional'
    : f.muestras >= 100 ? 'alta'
    : f.muestras >= 30 ? 'media' : 'baja',
});

/* --------------------------- tabla completa --------------------------- */

indice.get('/', conSesion(), async (c) => {
  const u = c.get('usuario');

  const periodo = await una<{ periodo: string }>(
    `SELECT periodo FROM indice_precios WHERE publicado ORDER BY periodo DESC LIMIT 1`,
  );

  // No se descuenta cuota si no hay nada que entregar: cobrar una consulta
  // por una tabla vacía es quedarse con algo a cambio de nada.
  if (!periodo) {
    return c.json({
      periodo: null,
      distritos: [],
      cuota: { tope: null, usadas: null, restantes: null },
      aviso: AVISO,
      mensaje: 'Todavía estamos armando el índice. Vuelve en unos días.',
    });
  }

  const cuota = await consumirCuotaIndice(u.id, u.agencias?.[0]?.agencia_id ?? null);

  const filas = await sql<Fila>(
    `SELECT u.distrito, u.slug, i.precio_m2_usd, i.alquiler_2d_pen,
            i.var_12m, i.muestras, i.periodo
     FROM indice_precios i
     JOIN ubicaciones u ON u.id = i.ubicacion_id
     WHERE i.periodo = $1 AND i.publicado
     ORDER BY i.precio_m2_usd DESC`,
    [periodo.periodo],
  );

  return c.json({
    periodo: periodo.periodo,
    distritos: filas.map(armar),
    cuota,
    aviso: AVISO,
    provisional: filas.every((f) => f.muestras === 0),
  });
});

/* --------------------------- un distrito ------------------------------ */

indice.get('/distrito/:slug', conSesion(), async (c) => {
  const u = c.get('usuario');
  const cuota = await consumirCuotaIndice(u.id, u.agencias?.[0]?.agencia_id ?? null);

  const serie = await sql<Fila>(
    `SELECT u.distrito, u.slug, i.precio_m2_usd, i.alquiler_2d_pen,
            i.var_12m, i.muestras, i.periodo
     FROM indice_precios i
     JOIN ubicaciones u ON u.id = i.ubicacion_id
     WHERE u.slug = $1 AND i.publicado
     ORDER BY i.periodo DESC LIMIT 24`,
    [c.req.param('slug')],
  );
  if (!serie.length) throw noEncontrado('El índice de ese distrito');

  return c.json({
    distrito: serie[0]!.distrito,
    serie: serie.map(armar),
    cuota,
    aviso: AVISO,
  });
});

/* --------------------------- referencia ------------------------------- */

/**
 * Para el asistente de publicación. NO consume cuota a propósito: mostrar
 * cuánto vale el m² mientras alguien escribe su precio evita precios
 * irreales y le enseña para qué sirve el Índice justo cuando le importa.
 */
indice.get('/referencia/:slug', conSesion(), async (c) => {
  const f = await una<Fila>(
    `SELECT u.distrito, u.slug, i.precio_m2_usd, i.alquiler_2d_pen,
            i.var_12m, i.muestras, i.periodo
     FROM indice_precios i
     JOIN ubicaciones u ON u.id = i.ubicacion_id
     WHERE u.slug = $1 AND i.publicado
     ORDER BY i.periodo DESC LIMIT 1`,
    [c.req.param('slug')],
  );
  if (!f) throw noEncontrado('El índice de ese distrito');
  return c.json({ ...armar(f), periodo: f.periodo });
});

/* ---------------------------- estimador ------------------------------- */

const esquemaEstimar = z.object({
  distrito: z.string().trim().min(2).max(80),
  operacion: z.enum(['venta', 'alquiler']).default('venta'),
  area_m2: z.number().positive().min(10).max(2000),
  antiguedad: z.number().int().min(0).max(120).optional(),
  piso: z.number().int().min(0).max(60).optional(),
});

indice.post('/estimar', conSesion(), async (c) => {
  const d = validar(esquemaEstimar, await c.req.json());
  const u = c.get('usuario');
  await consumirCuotaIndice(u.id, u.agencias?.[0]?.agencia_id ?? null);

  // Acepta el nombre del distrito o su slug, sin tildes.
  const f = await una<Fila>(
    `SELECT u.distrito, u.slug, i.precio_m2_usd, i.alquiler_2d_pen,
            i.var_12m, i.muestras, i.periodo
     FROM indice_precios i
     JOIN ubicaciones u ON u.id = i.ubicacion_id
     WHERE i.publicado
       AND (u.slug = $1 OR sin_tildes(lower(u.distrito)) = sin_tildes(lower($2)))
     ORDER BY i.periodo DESC LIMIT 1`,
    [d.distrito.toLowerCase().replace(/\s+/g, '-'), d.distrito],
  );
  if (!f) {
    throw new ErrorHTTP(404, `Todavía no tenemos índice para "${d.distrito}".`, {
      codigo: 'SIN_INDICE',
      campo: 'distrito',
    });
  }

  const base = Number(f.precio_m2_usd);
  const factores: { nota: string; valor: number }[] = [];

  if (d.piso !== undefined) {
    // Los pisos altos valen algo más, hasta cierto punto.
    const v = d.piso === 0 ? -0.04 : Math.min(d.piso * 0.006, 0.07);
    factores.push({ nota: d.piso === 0 ? 'Primer piso' : `Piso ${d.piso}`, valor: v });
  }
  if (d.antiguedad !== undefined) {
    const v = d.antiguedad === 0 ? 0.06 : -Math.min(d.antiguedad * 0.005, 0.22);
    factores.push({
      nota: d.antiguedad === 0 ? 'De estreno' : `${d.antiguedad} años de antigüedad`,
      valor: v,
    });
  }
  if (d.area_m2 > 200) factores.push({ nota: 'Área grande', valor: -0.05 });

  const ajuste = factores.reduce((s, x) => s + x.valor, 0);

  if (d.operacion === 'alquiler') {
    const alquiler2d = f.alquiler_2d_pen ? Number(f.alquiler_2d_pen) : null;
    if (!alquiler2d) {
      throw new ErrorHTTP(404, `Todavía no tenemos referencia de alquiler para ${f.distrito}.`, {
        codigo: 'SIN_INDICE',
      });
    }
    // El de 2 dormitorios se toma como ~80 m² de referencia.
    const mensual = Math.round((alquiler2d / 80) * d.area_m2 * (1 + ajuste));
    return c.json({
      distrito: f.distrito, moneda: 'PEN', periodo: f.periodo,
      rango: {
        min: Math.round(mensual * 0.9), sugerido: mensual, max: Math.round(mensual * 1.1),
      },
      base_m2_usd: base, factores,
      confianza: armar(f).confianza, muestras: f.muestras, aviso: AVISO,
    });
  }

  const sugerido = Math.round((base * d.area_m2 * (1 + ajuste)) / 500) * 500;
  return c.json({
    distrito: f.distrito, moneda: 'USD', periodo: f.periodo,
    rango: {
      min: Math.round((sugerido * 0.93) / 500) * 500,
      sugerido,
      max: Math.round((sugerido * 1.08) / 500) * 500,
    },
    base_m2_usd: base, factores,
    confianza: armar(f).confianza, muestras: f.muestras, aviso: AVISO,
  });
});
