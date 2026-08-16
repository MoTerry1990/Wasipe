import 'server-only';

import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import { convertir } from '@/lib/moneda';
import { POR_PAGINA, type Filtros } from '@/lib/busqueda/filtros';
import type { AvisoDePortada } from '@/lib/consultas/portada';

/**
 * Servicio de búsqueda.
 *
 * Un solo lugar arma la consulta, y recibe los filtros ya tipados y ya
 * saneados. La página no toca PostgREST: si mañana la búsqueda pasa a un
 * índice de texto o a una función SQL, solo cambia este archivo.
 *
 * Dos cosas que nunca hace, y que son deliberadas:
 *
 *  · No pide `property_locations`. La dirección exacta no entra al
 *    listado por ninguna vía, ni siquiera por un `select *` distraído.
 *    Lo único que sale es el punto público, que ya viene desplazado.
 *  · No filtra por estado de publicación. Eso lo hace la RLS. Repetirlo
 *    acá invitaría a que una consulta futura se olvide y nadie lo note.
 */

export type Resultado = AvisoDePortada & {
  lat: number | null;
  lon: number | null;
  address_privacy: 'exact' | 'approximate' | 'district_only';
  price_dropped_at: string | null;
};

export type Busqueda = {
  avisos: Resultado[];
  total: number;
  pagina: number;
  paginas: number;
  /** true cuando la base no respondió y se muestra el estado vacío. */
  sinConexion: boolean;
};

const CAMPOS =
  'id, code, title, district, province, operation, property_type, currency, price, price_usd, ' +
  'price_per_m2, total_area, built_area, bedrooms, bathrooms, parking, verification_status, ' +
  'published_at, lat, lon, address_privacy, price_dropped_at, ' +
  'property_media (url, alt, ai_label, is_cover, sort_order)';

type FotoCruda = {
  url: string;
  alt: string | null;
  ai_label: string | null;
  is_cover: boolean;
  sort_order: number;
};

function elegirPortada(fotos: FotoCruda[] | null | undefined) {
  if (!fotos || fotos.length === 0) return null;
  const elegida =
    fotos.find((f) => f.is_cover) ?? [...fotos].sort((a, b) => a.sort_order - b.sort_order)[0];
  return elegida ? { url: elegida.url, alt: elegida.alt, ai_label: elegida.ai_label } : null;
}

const VACIA: Busqueda = { avisos: [], total: 0, pagina: 1, paginas: 0, sinConexion: true };

/** Hace siete días: el corte de "recién publicados". */
function haceUnaSemana(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

export async function buscar(filtros: Filtros, tipoDeCambio: number): Promise<Busqueda> {
  if (!supabaseConfigurado()) return VACIA;

  try {
    const supabase = await clienteServidor();
    const pagina = filtros.pagina ?? 1;
    const desde = (pagina - 1) * POR_PAGINA;

    let consulta = supabase
      .from('properties')
      .select(CAMPOS, { count: 'exact' })
      .eq('operation', filtros.operacion);

    // --- Ubicación ---
    if (filtros.departamento) consulta = consulta.ilike('department', filtros.departamento);
    if (filtros.provincia) consulta = consulta.ilike('province', filtros.provincia);
    if (filtros.distrito) consulta = consulta.ilike('district', filtros.distrito);

    if (filtros.tipo) consulta = consulta.eq('property_type', filtros.tipo);

    // --- Precio ---
    // Siempre contra price_usd, nunca contra price: la lista mezcla soles
    // y dólares, y comparar el número crudo devuelve disparates.
    const moneda = filtros.moneda ?? 'USD';
    if (filtros.precioMin !== undefined) {
      consulta = consulta.gte(
        'price_usd',
        convertir(filtros.precioMin, moneda, 'USD', tipoDeCambio),
      );
    }
    if (filtros.precioMax !== undefined) {
      consulta = consulta.lte(
        'price_usd',
        convertir(filtros.precioMax, moneda, 'USD', tipoDeCambio),
      );
    }

    // --- Ambientes: el número pedido es un mínimo ---
    if (filtros.dorm !== undefined) consulta = consulta.gte('bedrooms', filtros.dorm);
    if (filtros.banos !== undefined) consulta = consulta.gte('bathrooms', filtros.banos);
    if (filtros.cocheras !== undefined) consulta = consulta.gte('parking', filtros.cocheras);

    // --- Medidas ---
    if (filtros.areaMin !== undefined) consulta = consulta.gte('total_area', filtros.areaMin);
    if (filtros.areaMax !== undefined) consulta = consulta.lte('total_area', filtros.areaMax);
    if (filtros.techadaMin !== undefined)
      consulta = consulta.gte('built_area', filtros.techadaMin);
    if (filtros.techadaMax !== undefined)
      consulta = consulta.lte('built_area', filtros.techadaMax);

    // --- Condiciones ---
    if (filtros.antiguedadMax !== undefined) {
      consulta = consulta.lte('age_years', filtros.antiguedadMax);
    }
    if (filtros.amoblado) consulta = consulta.eq('furnished', filtros.amoblado);
    if (filtros.mascotas) consulta = consulta.in('pet_policy', ['allowed', 'negotiable']);

    // --- Sellos ---
    if (filtros.verificados) consulta = consulta.eq('verification_status', 'verified');
    if (filtros.rebajados) consulta = consulta.not('price_dropped_at', 'is', null);
    if (filtros.nuevos) consulta = consulta.gte('published_at', haceUnaSemana());

    // --- Orden ---
    switch (filtros.orden ?? 'recientes') {
      case 'precio-asc':
        consulta = consulta.order('price_usd', { ascending: true, nullsFirst: false });
        break;
      case 'precio-desc':
        consulta = consulta.order('price_usd', { ascending: false, nullsFirst: false });
        break;
      case 'm2-asc':
        consulta = consulta.order('price_usd_per_m2', { ascending: true, nullsFirst: false });
        break;
      case 'm2-desc':
        consulta = consulta.order('price_usd_per_m2', { ascending: false, nullsFirst: false });
        break;
      default:
        consulta = consulta.order('published_at', { ascending: false, nullsFirst: false });
    }

    // Segundo criterio siempre: sin él, dos avisos con el mismo precio
    // pueden intercambiarse entre página y página y repetirse o perderse.
    consulta = consulta.order('id', { ascending: true });

    const { data, count, error } = await consulta.range(desde, desde + POR_PAGINA - 1);

    if (error) return VACIA;

    const avisos = (data ?? []).map((fila) => {
      const { property_media, ...aviso } = fila as unknown as Omit<Resultado, 'portada'> & {
        property_media: FotoCruda[];
      };
      return { ...aviso, portada: elegirPortada(property_media) } as Resultado;
    });

    const total = count ?? avisos.length;

    return {
      avisos,
      total,
      pagina,
      paginas: Math.max(1, Math.ceil(total / POR_PAGINA)),
      sinConexion: false,
    };
  } catch {
    return VACIA;
  }
}

/**
 * Sugerencias cuando la búsqueda no devuelve nada.
 *
 * En vez de un "sin resultados" seco, se prueban dos aflojadas del mismo
 * filtro —primero sin precio, después solo el distrito— y se ofrece lo
 * que sí existe. Es la diferencia entre una salida y un callejón.
 */
export type Sugerencia = { texto: string; filtros: Partial<Filtros>; total: number };

export async function sugerencias(
  filtros: Filtros,
  tipoDeCambio: number,
): Promise<Sugerencia[]> {
  if (!supabaseConfigurado()) return [];

  const candidatas: { texto: string; cambios: Partial<Filtros> }[] = [];

  if (filtros.precioMin !== undefined || filtros.precioMax !== undefined) {
    candidatas.push({
      texto: 'Quitar el rango de precio',
      cambios: { precioMin: undefined, precioMax: undefined },
    });
  }

  if (filtros.dorm !== undefined && filtros.dorm > 1) {
    candidatas.push({
      texto: `Aceptar desde ${filtros.dorm - 1} dormitorios`,
      cambios: { dorm: filtros.dorm - 1 },
    });
  }

  if (filtros.verificados || filtros.rebajados || filtros.nuevos) {
    candidatas.push({
      texto: 'Quitar los sellos (verificados, rebajados, nuevos)',
      cambios: { verificados: undefined, rebajados: undefined, nuevos: undefined },
    });
  }

  if (filtros.tipo) {
    candidatas.push({
      texto: 'Ver todos los tipos de propiedad',
      cambios: { tipo: undefined },
    });
  }

  if (filtros.distrito) {
    candidatas.push({
      texto: `Buscar en toda la provincia en vez de solo ${filtros.distrito}`,
      cambios: { distrito: undefined },
    });
  }

  // Se consultan solo las tres primeras: cada una es una consulta más, y
  // esta pantalla ya es la de "no encontramos nada".
  const resultados = await Promise.all(
    candidatas.slice(0, 3).map(async (candidata) => {
      const { total } = await buscar(
        { ...filtros, ...candidata.cambios, pagina: 1 },
        tipoDeCambio,
      );
      return { texto: candidata.texto, filtros: candidata.cambios, total };
    }),
  );

  return resultados.filter((sugerencia) => sugerencia.total > 0);
}
