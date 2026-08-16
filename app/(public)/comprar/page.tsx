import type { Metadata } from 'next';
import {
  PaginaDeBusqueda,
  metadatosDeBusqueda,
  type ParametrosDeBusqueda,
} from '@/features/busqueda/pagina-busqueda';

type Props = { searchParams: Promise<ParametrosDeBusqueda> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return metadatosDeBusqueda('sale', await searchParams);
}

export default async function Comprar({ searchParams }: Props) {
  return <PaginaDeBusqueda operacion="sale" params={await searchParams} />;
}
