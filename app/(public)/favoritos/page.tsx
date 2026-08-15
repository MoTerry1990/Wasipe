import type { Metadata } from 'next';
import { Contenedor } from '@/components/ui/contenedor';
import { EstadoVacio } from '@/components/estados/estado-vacio';

export const metadata: Metadata = {
  title: 'Favoritos',
  description: 'Las propiedades que guardaste en Wasipe.',
  robots: { index: false, follow: false },
};

export default function Favoritos() {
  return (
    <Contenedor className="py-10 sm:py-14">
      <header className="mb-7">
        <h1 className="text-[clamp(1.6rem,4vw,2.25rem)]">Tus favoritos</h1>
        <p className="mt-2 text-tinta-60">
          Guarda las propiedades que te interesan para compararlas después.
        </p>
      </header>

      {/* Requiere sesión: llega en el Sprint 4 con Supabase Auth. */}
      <EstadoVacio
        titulo="Todavía no guardaste ninguna propiedad"
        descripcion="Cuando encuentres una que te guste, toca el corazón para tenerla acá y compararla con calma."
        accion={{ texto: 'Buscar propiedades', href: '/comprar' }}
        icono={
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 20s-7-4.6-7-9.4A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7 2.6C19 15.4 12 20 12 20Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
        }
      />
    </Contenedor>
  );
}
