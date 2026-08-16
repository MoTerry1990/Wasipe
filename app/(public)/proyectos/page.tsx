import type { Metadata } from 'next';
import {
  PaginaDeBusqueda,
  metadatosDeBusqueda,
  type ParametrosDeBusqueda,
} from '@/features/busqueda/pagina-busqueda';

type Props = { searchParams: Promise<ParametrosDeBusqueda> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return metadatosDeBusqueda('project', await searchParams);
}

export default async function Proyectos({ searchParams }: Props) {
  return <PaginaDeBusqueda operacion="project" params={await searchParams} />;
}
