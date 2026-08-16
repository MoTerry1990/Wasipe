import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  PaginaDeBusqueda,
  metadatosDeBusqueda,
  type ParametrosDeBusqueda,
} from '@/features/busqueda/pagina-busqueda';
import { leerSegmentos } from '@/lib/busqueda/rutas';
import { SLUG_DESDE_TIPO } from '@/lib/catalogo';

type Props = {
  params: Promise<{ segmentos: string[] }>;
  searchParams: Promise<ParametrosDeBusqueda>;
};

/**
 * Búsqueda con la dirección bonita: /alquilar/departamento/miraflores.
 *
 * Los segmentos se traducen a filtros y de ahí en adelante es la misma
 * página que la versión con parámetros. Si la URL trae los segmentos en
 * otro orden, se redirige a la canónica: dos direcciones con el mismo
 * contenido se pelean entre sí en los buscadores.
 */
function comoParametros(
  segmentos: string[],
  búsqueda: ParametrosDeBusqueda,
): ParametrosDeBusqueda | null {
  const leidos = leerSegmentos(segmentos);
  if (leidos.desconocido) return null;

  return {
    ...búsqueda,
    ...(leidos.tipo ? { tipo: SLUG_DESDE_TIPO[leidos.tipo] } : {}),
    ...(leidos.distrito ? { distrito: leidos.distrito } : {}),
    ...(leidos.provincia ? { provincia: leidos.provincia } : {}),
  };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { segmentos } = await params;
  const combinados = comoParametros(segmentos, await searchParams);
  if (!combinados) return { title: 'Página no encontrada', robots: { index: false } };
  return metadatosDeBusqueda('rent', combinados);
}

export default async function AlquilarPorSegmentos({ params, searchParams }: Props) {
  const { segmentos } = await params;
  const combinados = comoParametros(segmentos, await searchParams);

  // El middleware ya redirigió las direcciones inválidas y las que no
  // estaban en su forma canónica. Esto es el último cerrojo, por si
  // alguna llega sin pasar por ahí.
  if (!combinados) notFound();

  return <PaginaDeBusqueda operacion="rent" params={combinados} />;
}
