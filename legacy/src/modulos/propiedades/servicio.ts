import * as q from './consultas.ts';
import { exigirTransicion, esCambioSustancial, type Estado } from './estados.ts';
import { ErrorHTTP, noEncontrado } from '../../lib/errores.ts';
import { verificarPuedePublicar, limitesDe } from '../../servicios/limites.ts';
import { sql, una } from '../../db/cliente.ts';
import { puedeExigirVerificacion } from '../../lib/auth.ts';

/* ------------------------------- slug --------------------------------- */

const SIN_TILDES: Record<string, string> = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n',
  Á: 'a', É: 'e', Í: 'i', Ó: 'o', Ú: 'u', Ü: 'u', Ñ: 'n',
};

export function slugificar(texto: string): string {
  return texto
    .replace(/[áéíóúüñÁÉÍÓÚÜÑ]/g, (c) => SIN_TILDES[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** El código va al final para garantizar unicidad sin bucles de reintento. */
const armarSlug = (titulo: string, codigo: string) =>
  `${slugificar(titulo) || 'aviso'}-${codigo.toLowerCase()}`;

/* ------------------------------- crear -------------------------------- */

export async function crearBorrador(
  usuarioId: string,
  agenciaId: string | null,
  datos: { operacion: string; tipo: string; ubicacion_id: string; origen?: string },
) {
  const ubi = await una(`SELECT 1 FROM ubicaciones WHERE id = $1 AND activo`, [datos.ubicacion_id]);
  if (!ubi) {
    throw new ErrorHTTP(422, 'Ese distrito no existe.', {
      codigo: 'UBICACION_INVALIDA',
      campo: 'ubicacion_id',
    });
  }

  const codigo = await q.siguienteCodigo();
  const titulo = `${TIPO_NOMBRE[datos.tipo] ?? 'Inmueble'} en ${datos.operacion}`;

  const p = await q.crear({
    codigo,
    slug: armarSlug(titulo, codigo),
    usuario_id: usuarioId,
    agencia_id: agenciaId,
    operacion: datos.operacion,
    tipo: datos.tipo,
    titulo,
    ubicacion_id: datos.ubicacion_id,
    origen: datos.origen ?? 'wizard',
  });
  if (!p) throw new Error('No se pudo crear el aviso');
  return p;
}

const TIPO_NOMBRE: Record<string, string> = {
  departamento: 'Departamento', casa: 'Casa', terreno: 'Terreno',
  oficina: 'Oficina', local: 'Local', almacen: 'Almacén', cochera: 'Cochera',
};

/* ------------------------------ editar -------------------------------- */

/** Lista blanca. `estado`, `usuario_id`, `codigo` y `vistas` no se tocan desde acá. */
const EDITABLES = [
  'titulo', 'descripcion', 'ubicacion_id', 'direccion', 'referencia',
  'lat', 'lng', 'ocultar_mapa', 'area_m2', 'area_techada_m2',
  'dormitorios', 'banos', 'medio_bano', 'cocheras', 'piso', 'pisos_edificio',
  'antiguedad', 'estado_inmueble', 'amoblado', 'precio', 'moneda',
  'mantenimiento', 'moneda_mant', 'precio_negociable', 'operacion', 'tipo',
] as const;

export async function editar(
  p: q.Propiedad,
  body: Record<string, unknown>,
  caracteristicas?: string[],
) {
  const campos: Record<string, unknown> = {};
  for (const k of EDITABLES) if (k in body) campos[k] = body[k];

  if (campos.ubicacion_id) {
    const ok = await una(`SELECT 1 FROM ubicaciones WHERE id = $1 AND activo`, [campos.ubicacion_id]);
    if (!ok) {
      throw new ErrorHTTP(422, 'Ese distrito no existe.', { campo: 'ubicacion_id' });
    }
  }

  if (typeof campos.descripcion === 'string') {
    await revisarContacto(p, campos.descripcion);
  }
  if (typeof campos.titulo === 'string') {
    exigirSinContacto(campos.titulo, 'titulo');
    // El título cambia el slug; el viejo se guarda para redirigir con 301.
    const nuevoSlug = armarSlug(campos.titulo, p.codigo);
    if (nuevoSlug !== p.slug) {
      await q.guardarSlugHistorico(p.slug, p.id);
      campos.slug = nuevoSlug;
    }
  }

  if (caracteristicas) {
    const validas = await q.caracteristicasValidas(caracteristicas);
    const conocidas = new Set(validas.map((v) => v.slug));
    const invalidas = caracteristicas.filter((s) => !conocidas.has(s));
    if (invalidas.length) {
      throw new ErrorHTTP(422, `Estas características no existen: ${invalidas.join(', ')}`, {
        codigo: 'CARACTERISTICA_INVALIDA',
        campo: 'caracteristicas',
      });
    }
    await q.ponerCaracteristicas(p.id, caracteristicas);
  }

  // Editar un aviso vivo con cambios grandes lo marca para revisión
  // posterior, pero NO lo baja. Ver FLUJO-AVISOS.md §3.3.
  if (p.estado === 'activo' && esCambioSustancial(p as never, campos)) {
    await marcar(p.id, 'edicion-sustancial', 2, { antes: { precio: p.precio, area: p.area_m2 } });
  }

  const actualizado = await q.actualizar(p.id, campos);
  if (actualizado) await recalcularCompletitud(actualizado);
  return actualizado;
}

/* --------------------- contacto en el texto --------------------------- */

const RE_TELEFONO = /(?:\+?51[\s-]?)?9\d{2}[\s.-]?\d{3}[\s.-]?\d{3}/;
const RE_EMAIL = /[\w.+-]+@[\w-]+\.[\w.]{2,}/;
const RE_URL = /\b(?:https?:\/\/|www\.)\S+/i;

function tieneContacto(texto: string) {
  return RE_TELEFONO.test(texto) || RE_EMAIL.test(texto) || RE_URL.test(texto);
}

function exigirSinContacto(texto: string, campo: string) {
  if (tieneContacto(texto)) {
    throw new ErrorHTTP(422, 'No pongas teléfonos ni correos en el título.', {
      codigo: 'CONTACTO_EN_TITULO',
      campo,
    });
  }
}

/**
 * El teléfono en la descripción NO se bloquea siempre.
 *
 * Urbania lo prohíbe para capturar el lead y es una de las cosas que más
 * resienten los corredores (COMPETENCIA.md §4). Acá es al revés: en los
 * planes pagos se permite y se muestra; en el gratuito se pide quitarlo.
 * Así el teléfono visible es un beneficio de pago, no un castigo.
 */
async function revisarContacto(p: q.Propiedad, descripcion: string) {
  if (!tieneContacto(descripcion)) return;
  const limites = await limitesDe(p.usuario_id, p.agencia_id);
  if (limites.telefono_visible) return;

  throw new ErrorHTTP(
    422,
    'Con el plan gratis los interesados te contactan por el formulario. ' +
      'Quita el teléfono de la descripción, o pasa a un plan para mostrarlo.',
    { codigo: 'CONTACTO_EN_DESCRIPCION', campo: 'descripcion', extra: { plan_sugerido: 'dueno-plus' } },
  );
}

async function marcar(propiedadId: string, regla: string, severidad: number, detalle: unknown) {
  await sql(
    `INSERT INTO marcas_moderacion (propiedad_id, regla, severidad, detalle)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (propiedad_id, regla) DO UPDATE SET resuelta = false, creado_en = now()`,
    [propiedadId, regla, severidad, JSON.stringify(detalle)],
  );
}

/* ----------------------------- completitud ---------------------------- */

export async function recalcularCompletitud(p: q.Propiedad) {
  const fotos = await q.contarFotos(p.id);
  let puntos = 0;
  if (p.titulo && p.titulo.length >= 10) puntos += 15;
  if (p.descripcion && p.descripcion.length >= 80) puntos += 15;
  if (p.precio) puntos += 20;
  if (p.area_m2) puntos += 10;
  if (p.dormitorios != null || p.tipo === 'terreno' || p.tipo === 'cochera') puntos += 10;
  if (fotos >= 3) puntos += 15;
  if (fotos >= 6) puntos += 10;
  if (p.caracteristicas?.length >= 3) puntos += 5;
  await q.actualizar(p.id, { completitud: Math.min(100, puntos) });
  return Math.min(100, puntos);
}

/* ------------------------------ publicar ------------------------------ */

export type Faltante = { paso: number; campo: string; mensaje: string };

/** Devuelve TODOS los faltantes, no el primero. El asistente los marca juntos. */
export async function faltantesPara(p: q.Propiedad): Promise<Faltante[]> {
  const f: Faltante[] = [];
  const fotos = await q.contarFotos(p.id);

  if (!p.precio) {
    f.push({ paso: 4, campo: 'precio', mensaje: 'Ponle precio. En Wasipe el precio siempre se ve.' });
  }
  if (!p.titulo || p.titulo.length < 10) {
    f.push({ paso: 5, campo: 'titulo', mensaje: 'El título necesita al menos 10 caracteres.' });
  }
  if (fotos < 3) {
    f.push({
      paso: 2, campo: 'medios',
      mensaje: `Sube al menos 3 fotos. Llevas ${fotos}.`,
    });
  } else if (!(await q.tienePortada(p.id))) {
    f.push({ paso: 2, campo: 'portada', mensaje: 'Elige cuál foto va de portada.' });
  }
  if (!p.area_m2) {
    f.push({ paso: 3, campo: 'area_m2', mensaje: 'Falta el área en m².' });
  }
  if (p.dormitorios == null && p.tipo !== 'terreno' && p.tipo !== 'cochera') {
    f.push({ paso: 3, campo: 'dormitorios', mensaje: 'Falta cuántos dormitorios tiene.' });
  }
  return f;
}

export async function publicar(p: q.Propiedad, emailVerificado: boolean) {
  if (puedeExigirVerificacion() && !emailVerificado) {
    throw new ErrorHTTP(403, 'Confirma tu correo para poder publicar.', {
      codigo: 'EMAIL_NO_VERIFICADO',
    });
  }
  exigirTransicion(p.estado, p.estado === 'rechazado' ? 'revision' : 'revision');

  const faltantes = await faltantesPara(p);
  if (faltantes.length) {
    throw new ErrorHTTP(422, 'A tu aviso le falta información.', {
      codigo: 'AVISO_INCOMPLETO',
      extra: { faltantes },
    });
  }

  const limites = await verificarPuedePublicar(p.usuario_id, p.agencia_id);

  // M6 sale con auto-aprobación para todos. La cola de moderación llega
  // en M8; al revés, los avisos quedarían atascados sin nadie que apruebe.
  const vence = new Date();
  vence.setDate(vence.getDate() + limites.dias_vigencia_aviso);

  const actualizado = await q.cambiarEstado(p.id, 'activo', {
    publicado_en: new Date().toISOString(),
    vence_en: vence.toISOString().slice(0, 10),
    auto_aprobado: true,
  });

  return {
    propiedad: actualizado,
    estado: 'activo',
    mensaje: '¡Listo! Tu aviso ya está publicado.',
  };
}

/* -------------------- pausar · reactivar · renovar -------------------- */

export async function pausar(p: q.Propiedad) {
  exigirTransicion(p.estado, 'pausado');
  return q.cambiarEstado(p.id, 'pausado');
}

export async function reactivar(p: q.Propiedad) {
  exigirTransicion(p.estado, 'activo');
  await verificarPuedePublicar(p.usuario_id, p.agencia_id); // el cupo se revalida
  return q.cambiarEstado(p.id, 'activo');
}

export async function renovar(p: q.Propiedad) {
  if (p.estado !== 'activo' && p.estado !== 'vencido') {
    throw new ErrorHTTP(409, 'Solo se renuevan avisos publicados o vencidos.', {
      codigo: 'TRANSICION_INVALIDA',
    });
  }
  if (p.estado === 'vencido') {
    await verificarPuedePublicar(p.usuario_id, p.agencia_id);
  }
  const limites = await limitesDe(p.usuario_id, p.agencia_id);
  const vence = new Date();
  vence.setDate(vence.getDate() + limites.dias_vigencia_aviso);

  const actualizado = await q.actualizar(p.id, {
    estado: 'activo',
    vence_en: vence.toISOString().slice(0, 10),
    renovado_en: new Date().toISOString(),
    aviso_vencimiento_en: null,
  });
  return {
    propiedad: actualizado,
    vence_en: vence.toISOString().slice(0, 10),
    mensaje: `Renovado por ${limites.dias_vigencia_aviso} días más.`,
  };
}

/* ------------------------------- cerrar ------------------------------- */

export async function cerrar(
  p: q.Propiedad,
  datos: { motivo: string; precio_final?: number | null; moneda?: string | null },
) {
  exigirTransicion(p.estado, 'cerrado');
  const actualizado = await q.cambiarEstado(p.id, 'cerrado', {
    cerrado_motivo: datos.motivo,
    precio_final: datos.precio_final ?? null,
    moneda_final: datos.precio_final ? (datos.moneda ?? p.moneda) : null,
    cerrado_en: new Date().toISOString(),
  });

  // El precio de cierre es lo que convierte el Índice de un promedio de
  // precios pedidos en un registro de operaciones reales.
  return {
    propiedad: actualizado,
    mensaje: datos.precio_final
      ? '¡Gracias! Ese dato mejora el índice de tu distrito.'
      : 'Aviso cerrado.',
    regalo_indice: datos.precio_final ? 3 : 0,
  };
}

/* ------------------------------ duplicar ------------------------------ */

/** Sin esto ningún agente publica 15 unidades del mismo edificio. */
export async function duplicar(
  p: q.Propiedad,
  cambios: { piso?: number | null; precio?: number | null; titulo?: string | null },
) {
  await verificarPuedePublicar(p.usuario_id, p.agencia_id).catch(() => {
    // El duplicado nace en borrador, así que no consume cupo todavía.
  });

  const codigo = await q.siguienteCodigo();
  const titulo = cambios.titulo ?? p.titulo;

  const nuevo = await q.crear({
    codigo,
    slug: armarSlug(titulo, codigo),
    usuario_id: p.usuario_id,
    agencia_id: p.agencia_id,
    operacion: p.operacion,
    tipo: p.tipo,
    titulo,
    ubicacion_id: p.ubicacion_id,
    origen: 'duplicado',
    duplicado_de: p.id,
  });
  if (!nuevo) throw new Error('No se pudo duplicar');

  // Se copia todo menos fotos, código, slug, métricas y estado.
  await q.actualizar(nuevo.id, {
    descripcion: p.descripcion,
    direccion: p.direccion,
    referencia: p.referencia,
    lat: p.lat, lng: p.lng, ocultar_mapa: p.ocultar_mapa,
    area_m2: p.area_m2, area_techada_m2: p.area_techada_m2,
    dormitorios: p.dormitorios, banos: p.banos, cocheras: p.cocheras,
    antiguedad: p.antiguedad, estado_inmueble: p.estado_inmueble,
    amoblado: p.amoblado, mantenimiento: p.mantenimiento,
    moneda: p.moneda,
    piso: cambios.piso ?? p.piso,
    precio: cambios.precio ?? p.precio,
  });

  if (p.caracteristicas?.length) {
    await q.ponerCaracteristicas(nuevo.id, p.caracteristicas);
  }

  const final = await q.porId(nuevo.id);
  return {
    propiedad: final,
    mensaje: 'Copiamos el aviso. Revisa el piso y el precio, y sube las fotos.',
  };
}

/* ------------------------------- borrar ------------------------------- */

export async function eliminar(p: q.Propiedad) {
  if (p.estado === 'archivado') throw noEncontrado('Ese aviso');
  await q.borrarLogico(p.id);
  return { ok: true, mensaje: 'Aviso eliminado.' };
}

export type { Estado };
