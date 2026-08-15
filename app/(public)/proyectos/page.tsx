import type { Metadata } from 'next';
import { Contenedor } from '@/components/ui/contenedor';
import { EnConstruccion } from '@/components/estados/estado-vacio';

export const metadata: Metadata = {
  title: 'Proyectos',
  description:
    'Proyectos inmobiliarios en planos y en construcción en el Perú, con tipologías, avance de obra y stock.',
  alternates: { canonical: '/proyectos' },
};

export default function Proyectos() {
  return (
    <Contenedor className="py-10 sm:py-16">
      {/*
        Un proyecto NO es una operación de venta: es una entidad con
        tipologías, avance de obra y stock. Las tablas existen pero el
        módulo no (KNOWN_ISSUES P-06). Decirlo es más honesto que enlazar
        a una búsqueda que siempre saldría vacía.
      */}
      <EnConstruccion
        titulo="Proyectos inmobiliarios"
        descripcion="Estamos armando la sección para inmobiliarias: cada proyecto con sus tipologías, avance de obra, stock disponible y planos. Si desarrollas proyectos y quieres publicarlos, escríbenos."
        mientrasTanto={{ texto: 'Ver propiedades en venta', href: '/comprar' }}
      />
    </Contenedor>
  );
}
