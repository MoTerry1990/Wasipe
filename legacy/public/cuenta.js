// Cliente mínimo de la API. Las cookies viajan solas (httpOnly).
const BASE = '/api/v1';

export const api = async (ruta, opciones = {}) => {
  const r = await fetch(`${BASE}${ruta}`, {
    credentials: 'same-origin',
    headers: opciones.body ? { 'Content-Type': 'application/json' } : {},
    ...opciones,
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw Object.assign(new Error(datos.error || 'Algo falló.'), {
      estado: r.status,
      datos,
      codigo: datos.codigo,
    });
  }
  return datos;
};

export const sesion = () => api('/cuentas/yo').catch(() => null);

/* ------------------------- formato peruano ------------------------- */

export const LOCAL = 'es-PE';
export const ZONA = 'America/Lima';

/**
 * Precios como se escriben en el Perú:
 *   S/ 450,000        US$ 120,000
 *
 * Intl con es-PE da bien los soles ("S/ 450,000") pero para dólares
 * devuelve "USD 120,000". Acá lo corregimos a "US$", que es como se
 * escribe en el mercado peruano.
 */
export const dinero = (n, moneda = 'USD') => {
  const cifra = new Intl.NumberFormat(LOCAL, { maximumFractionDigits: 0 }).format(n);
  return moneda === 'PEN' ? `S/ ${cifra}` : `US$ ${cifra}`;
};

/** Con decimales, para montos mensuales o mantenimiento. */
export const dineroExacto = (n, moneda = 'PEN') => {
  const cifra = new Intl.NumberFormat(LOCAL, { minimumFractionDigits: 2 }).format(n);
  return moneda === 'PEN' ? `S/ ${cifra}` : `US$ ${cifra}`;
};

/** Precio por metro cuadrado: "US$ 1,750 por m²". */
export const porMetro = (n, moneda = 'USD') => `${dinero(n, moneda)} por m²`;

/** Alquiler: "S/ 2,500 mensuales". */
export const mensual = (n, moneda = 'PEN') => `${dinero(n, moneda)} mensuales`;

export const numero = (n) => new Intl.NumberFormat(LOCAL).format(n);

/** Fechas como en el Perú: "15 de agosto de 2026", hora de Lima. */
export const fecha = (v) =>
  new Intl.DateTimeFormat(LOCAL, {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: ZONA,
  }).format(new Date(v));

/** Versión corta para tablas: "15 ago 2026". */
export const fechaCorta = (v) =>
  new Intl.DateTimeFormat(LOCAL, {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: ZONA,
  }).format(new Date(v));

/** "hace 3 días", "hoy", "ayer". */
export const hace = (dias) =>
  dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`;

/** Maneja los tres errores que importan. Devuelve true si ya lo atendió. */
export const manejar = (err, acciones = {}) => {
  if (err.estado === 402 && acciones.plan) {
    acciones.plan(err.datos?.plan_sugerido, err.message);
    return true;
  }
  if (err.codigo === 'EMAIL_NO_VERIFICADO' && acciones.verificar) {
    acciones.verificar(err.message);
    return true;
  }
  if (err.datos?.faltantes && acciones.faltantes) {
    acciones.faltantes(err.datos.faltantes);
    return true;
  }
  return false;
};

export const NAV_MARCA = `
<a href="/" class="marca" translate="no">
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M2 11.5 12 3l10 8.5" stroke="#E11D74" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M5 12v8h14v-8" stroke="#1B2733" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>Wasipe</a>`;
