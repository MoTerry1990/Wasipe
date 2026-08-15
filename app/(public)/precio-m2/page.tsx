import type { Metadata } from 'next';
import { Contenedor } from '@/components/ui/contenedor';
import { EnConstruccion } from '@/components/estados/estado-vacio';

export const metadata: Metadata = {
  title: 'Precio por m²',
  description:
    'Precio por metro cuadrado por distrito en Lima y el Perú. Referencias para comparar antes de comprar o publicar.',
  alternates: { canonical: '/precio-m2' },
};

export default function PrecioM2() {
  return (
    <Contenedor className="py-10 sm:py-16">
      <header className="mb-8 text-center">
        <h1 className="text-[clamp(1.6rem,4vw,2.25rem)]">Precio por m² en el Perú</h1>
        <p className="text-tinta-60 mx-auto mt-3 max-w-[52ch]">
          Cuánto cuesta el metro cuadrado en cada distrito, para que puedas comparar antes de
          decidir. Es lo que nos hace distintos: el precio siempre a la vista.
        </p>
      </header>

      {/*
        Los datos del índice existen en la base anterior, pero son
        provisionales (muestras = 0) y todavía no hay conexión a Supabase.
        Mostrar cifras sin respaldo rompería la confianza, que es
        justamente lo que este producto vende.
      */}
      <EnConstruccion
        titulo="Estamos armando el índice"
        descripcion="Publicaremos el precio por m² distrito por distrito, calculado con avisos activos y operaciones cerradas reportadas en Wasipe. Preferimos esperar a tener datos reales antes que publicar cifras que no podamos sustentar."
        mientrasTanto={{ texto: 'Ver propiedades', href: '/comprar' }}
      />

      <p className="text-tinta-40 mx-auto mt-6 max-w-[52ch] text-center text-xs">
        Los valores del índice son referenciales y no reemplazan una tasación.
      </p>
    </Contenedor>
  );
}
