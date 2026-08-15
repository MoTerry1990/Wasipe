import { sql, una } from '../../db/cliente.ts';
import { variantes } from '../../servicios/almacenamiento.ts';
import type { Propiedad } from './consultas.ts';

/* ------------------------------ vistas ------------------------------- */

/**
 * Suma una vista, deduplicando por IP y día. Reutiliza `intentos_auth`
 * como conjunto de claves vistas: si el contador vuelve 1, es la primera
 * vez que esa IP ve este aviso hoy.
 */
export async function registrarVista(propiedadId: string, ip: string) {
  const hoy = new Date().toISOString().slice(0, 10);
  const clave = `vista:${propiedadId}:${ip}:${hoy}`;

  let primera = true;
  try {
    const r = await sql<{ conteo: number }>(
      `INSERT INTO intentos_auth (clave, conteo, ventana) VALUES ($1, 1, now())
       ON CONFLICT (clave) DO UPDATE SET conteo = intentos_auth.conteo + 1
       RETURNING conteo`,
      [clave],
    );
    primera = (r[0]?.conteo ?? 1) === 1;

    await sql(
      `INSERT INTO vistas_propiedad (propiedad_id, dia, vistas, vistas_unicas)
       VALUES ($1, CURRENT_DATE, 1, $2)
       ON CONFLICT (propiedad_id, dia) DO UPDATE SET
         vistas = vistas_propiedad.vistas + 1,
         vistas_unicas = vistas_propiedad.vistas_unicas + $2`,
      [propiedadId, primera ? 1 : 0],
    );
    await sql(`UPDATE propiedades SET vistas = vistas + 1 WHERE id = $1`, [propiedadId]);
  } catch {
    // Contar visitas nunca debe romper la ficha.
  }
}

/* ---------------------------- vs mercado ----------------------------- */

export type VsMercado = {
  porcentaje: number;
  precio_m2: number;
  indice_m2: number;
  periodo: string;
  muestras: number;
  confianza: string;
};

/**
 * El badge "12% debajo del promedio de Miraflores".
 *
 * Sale de la misma base que los avisos — por eso no cuesta una llamada
 * extra. Es el diferenciador que ningún competidor puede copiar sin
 * tener el dato.
 */
export async function vsMercado(p: Propiedad): Promise<VsMercado | null> {
  if (!p.precio || !p.area_m2 || p.operacion !== 'venta') return null;

  const area = Number(p.area_m2);
  const precioUsd = Number(p.precio_ref_usd ?? p.precio);
  if (!area || !precioUsd) return null;

  const idx = await una<{ precio_m2_usd: string; periodo: string; muestras: number }>(
    `SELECT precio_m2_usd, periodo, muestras FROM indice_precios
     WHERE ubicacion_id = $1 AND publicado
     ORDER BY periodo DESC LIMIT 1`,
    [p.ubicacion_id],
  );
  if (!idx) return null;

  const indiceM2 = Number(idx.precio_m2_usd);
  const precioM2 = precioUsd / area;
  if (!indiceM2) return null;

  return {
    porcentaje: Math.round(((precioM2 - indiceM2) / indiceM2) * 100),
    precio_m2: Math.round(precioM2),
    indice_m2: Math.round(indiceM2),
    periodo: idx.periodo,
    muestras: idx.muestras,
    confianza: idx.muestras >= 100 ? 'alta' : idx.muestras >= 30 ? 'media' : 'baja',
  };
}

/* ------------------------------ armado ------------------------------- */

/**
 * Desplaza las coordenadas ~300 m de forma estable (siempre el mismo
 * desplazamiento para el mismo aviso) cuando el dueño oculta el mapa.
 */
function desplazar(lat: number, lng: number, semilla: string) {
  let h = 0;
  for (let i = 0; i < semilla.length; i++) h = (h * 31 + semilla.charCodeAt(i)) | 0;
  const ang = ((h >>> 0) % 360) * (Math.PI / 180);
  const km = 0.3;
  return {
    lat: +(lat + (km / 111) * Math.cos(ang)).toFixed(5),
    lng: +(lng + (km / (111 * Math.cos((lat * Math.PI) / 180))) * Math.sin(ang)).toFixed(5),
  };
}

export async function fichaPublica(p: Propiedad) {
  const [ubicacion, medios, publica, mercado] = await Promise.all([
    una<{ distrito: string; provincia: string; departamento: string; slug: string }>(
      `SELECT distrito, provincia, departamento, slug FROM ubicaciones WHERE id = $1`,
      [p.ubicacion_id],
    ),
    sql<{ id: string; tipo: string; public_id: string; url: string; ambiente: string | null;
          ancho: number; alto: number; es_portada: boolean }>(
      `SELECT id, tipo, public_id, url, ambiente, ancho, alto, es_portada
       FROM medios WHERE propiedad_id = $1 ORDER BY es_portada DESC, orden`,
      [p.id],
    ),
    quienPublica(p),
    vsMercado(p),
  ]);

  let coords: { lat: number; lng: number } | null = null;
  if (p.lat != null && p.lng != null) {
    coords = p.ocultar_mapa
      ? desplazar(Number(p.lat), Number(p.lng), p.id)
      : { lat: Number(p.lat), lng: Number(p.lng) };
  }

  return {
    id: p.id,
    codigo: p.codigo,
    slug: p.slug,
    titulo: p.titulo,
    descripcion: p.descripcion,
    operacion: p.operacion,
    tipo: p.tipo,
    precio: p.precio ? Number(p.precio) : null,
    moneda: p.moneda,
    precio_ref_usd: p.precio_ref_usd ? Number(p.precio_ref_usd) : null,
    mantenimiento: p.mantenimiento ? Number(p.mantenimiento) : null,
    area_m2: p.area_m2 ? Number(p.area_m2) : null,
    area_techada_m2: p.area_techada_m2 ? Number(p.area_techada_m2) : null,
    dormitorios: p.dormitorios,
    banos: p.banos,
    cocheras: p.cocheras,
    piso: p.piso,
    antiguedad: p.antiguedad,
    estado_inmueble: p.estado_inmueble,
    amoblado: p.amoblado,
    ubicacion,
    // `direccion` NUNCA se expone en público. Solo la referencia.
    referencia: p.referencia,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    mapa_aproximado: p.ocultar_mapa,
    caracteristicas: p.caracteristicas ?? [],
    medios: medios.map((m) => ({
      id: m.id, tipo: m.tipo, url: m.url, ambiente: m.ambiente,
      ancho: m.ancho, alto: m.alto, es_portada: m.es_portada,
      variantes: variantes(m.public_id),
    })),
    vs_mercado: mercado,
    publica,
    destacado: p.destacado_hasta ? new Date(p.destacado_hasta) > new Date() : false,
    publicado_en: p.publicado_en,
    actualizado_en: p.actualizado_en,
    actualizado_hace_dias: Math.floor(
      (Date.now() - new Date(p.actualizado_en).getTime()) / 86400000,
    ),
    vence_en: p.vence_en,
  };
}

/**
 * Quién publica. El teléfono solo se muestra si el plan lo permite:
 * en el gratuito el contacto va por formulario. Ver COMPETENCIA.md §4.
 */
async function quienPublica(p: Propiedad) {
  const u = await una<{
    nombre: string; verificado: boolean; rol: string; foto_url: string | null;
    telefono: string | null; whatsapp: string | null; slug: string | null;
    agencia_nombre: string | null; agencia_slug: string | null;
    telefono_visible: boolean | null; creado_en: string;
  }>(
    `SELECT u.nombre, u.verificado, u.rol, u.telefono, u.creado_en,
            pf.foto_url, pf.whatsapp, pa.slug,
            a.nombre AS agencia_nombre, a.slug AS agencia_slug,
            (SELECT pl.telefono_visible FROM suscripciones s
               JOIN planes pl ON pl.id = s.plan_id
              WHERE s.estado IN ('activa','prueba','morosa')
                AND (s.usuario_id = u.id OR s.agencia_id = $2::uuid)
              LIMIT 1) AS telefono_visible
     FROM usuarios u
     LEFT JOIN perfiles pf ON pf.usuario_id = u.id
     LEFT JOIN perfiles_agente pa ON pa.usuario_id = u.id
     LEFT JOIN agencias a ON a.id = $2::uuid
     WHERE u.id = $1`,
    [p.usuario_id, p.agencia_id],
  );
  if (!u) return null;

  const muestraTelefono = u.telefono_visible === true;

  return {
    tipo: u.rol === 'inmobiliaria' ? 'inmobiliaria' : u.rol === 'agente' ? 'agente' : 'dueno',
    etiqueta:
      u.rol === 'inmobiliaria' ? 'Inmobiliaria' : u.rol === 'agente' ? 'Agente' : 'Dueño directo',
    nombre: u.nombre,
    slug: u.slug,
    foto_url: u.foto_url,
    verificado: u.verificado,
    agencia: u.agencia_nombre ? { nombre: u.agencia_nombre, slug: u.agencia_slug } : null,
    telefono: muestraTelefono ? (u.whatsapp ?? u.telefono) : null,
    whatsapp_url: muestraTelefono && (u.whatsapp ?? u.telefono)
      ? `https://wa.me/${(u.whatsapp ?? u.telefono)!.replace(/\D/g, '')}`
      : null,
    miembro_desde: u.creado_en,
  };
}

/* ----------------------------- similares ----------------------------- */

export function similares(p: Propiedad, limite = 4) {
  return sql(
    `SELECT pr.id, pr.slug, pr.titulo, pr.precio, pr.moneda, pr.area_m2,
            pr.dormitorios, pr.banos, u.distrito,
            (SELECT url FROM medios m WHERE m.propiedad_id = pr.id
              ORDER BY es_portada DESC, orden LIMIT 1) AS portada
     FROM propiedades pr
     JOIN ubicaciones u ON u.id = pr.ubicacion_id
     WHERE pr.estado = 'activo' AND pr.eliminado_en IS NULL
       AND pr.id <> $1
       AND pr.ubicacion_id = $2
       AND pr.operacion = $3
       AND ($4::numeric IS NULL OR pr.precio_ref_usd
              BETWEEN $4::numeric * 0.7 AND $4::numeric * 1.3)
     ORDER BY pr.destacado_hasta DESC NULLS LAST, pr.publicado_en DESC
     LIMIT $5`,
    [p.id, p.ubicacion_id, p.operacion, p.precio_ref_usd, limite],
  );
}

/* ------------------------------ sitemap ------------------------------ */

export const paraSitemap = () =>
  sql<{ slug: string; actualizado_en: string }>(
    `SELECT slug, actualizado_en FROM propiedades
     WHERE estado = 'activo' AND eliminado_en IS NULL
     ORDER BY publicado_en DESC LIMIT 45000`,
  );
