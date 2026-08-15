import type { Metadata } from 'next';
import { Contenedor } from '@/components/ui/contenedor';
import { EstadoVacio } from '@/components/estados/estado-vacio';

export const metadata: Metadata = {
  title: 'Alquilar',
  description:
    'Busca departamentos y casas en alquiler en el Perú, con precios por m² para comparar.',
  alternates: { canonical: '/alquilar' },
};

export default function Pagina() {
  return (
    <Contenedor className="py-10 sm:py-14">
      <header className="mb-7">
        <h1 className="text-[clamp(1.6rem,4vw,2.25rem)]">Departamentos y casas en alquiler</h1>
        <p className="text-tinta-60 mt-2 max-w-[56ch]">
          Propiedades en alquiler en todo el Perú, con el costo real: alquiler más
          mantenimiento.
        </p>
      </header>

      {/*
        Los filtros y resultados llegan en el Sprint 6, cuando exista la
        conexión a Supabase. Mientras tanto se muestra un vacío honesto
        en vez de una grilla falsa.
      */}
      <EstadoVacio
        titulo="Todavía no hay propiedades en alquiler"
        descripcion="El portal acaba de abrir. Si tienes una propiedad para alquilar, publicarla es gratis."
        accion={{ texto: 'Publicar gratis', href: '/publicar' }}
      />
    </Contenedor>
  );
}
