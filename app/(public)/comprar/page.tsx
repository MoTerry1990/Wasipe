import type { Metadata } from 'next';
import { Contenedor } from '@/components/ui/contenedor';
import { EstadoVacio } from '@/components/estados/estado-vacio';

export const metadata: Metadata = {
  title: 'Comprar',
  description:
    'Busca departamentos, casas y terrenos en venta en el Perú. Compara por precio por m².',
  alternates: { canonical: '/comprar' },
};

export default function Pagina() {
  return (
    <Contenedor className="py-10 sm:py-14">
      <header className="mb-7">
        <h1 className="text-[clamp(1.6rem,4vw,2.25rem)]">
          Departamentos, casas y terrenos en venta
        </h1>
        <p className="text-tinta-60 mt-2 max-w-[56ch]">
          Propiedades en venta en todo el Perú, con el precio por m² a la vista para que puedas
          comparar.
        </p>
      </header>

      {/*
        Los filtros y resultados llegan en el Sprint 6, cuando exista la
        conexión a Supabase. Mientras tanto se muestra un vacío honesto
        en vez de una grilla falsa.
      */}
      <EstadoVacio
        titulo="Todavía no hay propiedades en venta"
        descripcion="El portal acaba de abrir. Si tienes una propiedad para vender, publicarla es gratis y toma tres minutos."
        accion={{ texto: 'Publicar gratis', href: '/publicar' }}
      />
    </Contenedor>
  );
}
