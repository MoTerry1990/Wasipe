import type { Metadata } from 'next';
import {
  PaginaDeBusqueda,
  metadatosDeBusqueda,
  type ParametrosDeBusqueda,
} from '@/features/busqueda/pagina-busqueda';

type Props = { searchParams: Promise<ParametrosDeBusqueda> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return metadatosDeBusqueda('rent', await searchParams);
}

export default async function Alquilar({ searchParams }: Props) {
  return <PaginaDeBusqueda operacion="rent" params={await searchParams} />;
}
