import type { Metadata } from 'next';
import Link from 'next/link';
import { Contenedor } from '@/components/ui/contenedor';
import { EstadoVacio } from '@/components/estados/estado-vacio';
import { SkylineLima } from '@/components/marca/skyline-lima';
import { BuscadorHero } from '@/features/busqueda/buscador-hero';
import { DISTRITOS_POPULARES } from '@/config/sitio';

export const metadata: Metadata = {
  title: 'Wasipe · Departamentos, casas y proyectos en venta y alquiler en el Perú',
  description:
    'Busca departamentos, casas, terrenos y proyectos en venta y alquiler en todo el Perú. Publica gratis y consulta el precio por m² de tu distrito.',
  alternates: { canonical: '/' },
};

const GARANTIAS = [
  'Precio siempre visible',
  'Sin propiedades ya vendidas',
  'Publicar es gratis',
];

export default function Inicio() {
  return (
    <>
      {/*
        HERO
        La ilustración se preserva tal cual del sitio anterior. En móvil el
        relleno inferior baja para que el skyline no se coma la pantalla
        (el sitio anterior llegaba a 280px y tapaba el contenido).
      */}
      <header className="relative overflow-hidden bg-[linear-gradient(180deg,#C9E3F9,#E4F1FC_58%,#F4F6F8)]">
        <Contenedor className="relative z-10 pt-9 pb-[clamp(140px,22vw,260px)] text-center sm:pt-14">
          <h1 className="mx-auto max-w-[22ch] text-[clamp(1.75rem,4.6vw,2.875rem)]">
            Encuentra tu próximo hogar sabiendo cuánto vale realmente
          </h1>
          <p className="mx-auto mt-3 mb-6 max-w-[46ch] text-[clamp(0.97rem,1.6vw,1.125rem)] text-tinta-60">
            Casas, departamentos, terrenos y proyectos en todo el Perú, con precios por m² para
            comparar mejor.
          </p>

          <BuscadorHero />

          <ul className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[13.5px] font-semibold text-tinta-60">
            {GARANTIAS.map((g) => (
              <li key={g} className="flex items-center gap-1.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="shrink-0 text-turquesa" aria-hidden="true">
                  <circle cx="12" cy="12" r="11" fill="currentColor" opacity="0.14" />
                  <path d="M7 12.5l3.2 3.2L17 9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {g}
              </li>
            ))}
          </ul>
        </Contenedor>

        <SkylineLima className="pointer-events-none absolute inset-x-0 -bottom-0.5 z-0 [&_svg]:block [&_svg]:h-auto [&_svg]:w-full" />
      </header>

      {/* PROPIEDADES — todavía sin datos: el Sprint 3 conecta Supabase */}
      <Contenedor as="section" className="py-10 sm:py-14">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[clamp(1.5rem,3.4vw,2.125rem)]">Publicadas y confirmadas</h2>
            <p className="mt-2 max-w-[52ch] text-tinta-60">
              Cada aviso se confirma cada 90 días. Acá no vas a encontrar propiedades que se
              vendieron hace meses.
            </p>
          </div>
          <Link href="/comprar" className="font-bold whitespace-nowrap text-fucsia hover:underline">
            Ver todas →
          </Link>
        </div>

        <EstadoVacio
          titulo="Sé el primero en publicar"
          descripcion="El portal acaba de abrir. Tu propiedad puede ser la primera que vean todos, y publicar es gratis."
          accion={{ texto: 'Publicar gratis', href: '/publicar' }}
        />
      </Contenedor>

      {/* DISTRITOS */}
      <Contenedor as="section" className="pb-10 sm:pb-14">
        <h2 className="text-[clamp(1.5rem,3.4vw,2.125rem)]">Busca por distrito</h2>
        <p className="mt-2 mb-5 text-tinta-60">Los distritos más buscados de Lima.</p>

        <ul className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3" translate="no">
          {DISTRITOS_POPULARES.map((d) => (
            <li key={d.slug}>
              <Link
                href={`/comprar?donde=${d.slug}`}
                className="flex h-full flex-col gap-0.5 rounded-2xl border border-linea bg-white p-4 transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-fucsia hover:shadow-marca"
              >
                <span className="font-display text-[15.5px] font-extrabold">{d.nombre}</span>
                <span className="text-[12.5px] text-tinta-60">Ver propiedades</span>
              </Link>
            </li>
          ))}
        </ul>
      </Contenedor>

      {/* CIERRE */}
      <Contenedor as="section" className="pb-16 text-center sm:pb-24">
        <h2 className="text-[clamp(1.6rem,4vw,2.5rem)]">Publica tu propiedad en 3 minutos</h2>
        <p className="mx-auto mt-3 mb-6 max-w-[42ch] text-tinta-60">
          Crea tu cuenta gratis, mira cuánto vale y sube las fotos desde tu celular.
        </p>
        <Link
          href="/publicar"
          className="inline-flex items-center rounded-xl bg-fucsia px-7 py-3.5 font-bold text-white shadow-[0_6px_16px_-6px_rgb(225_29_116_/_0.5)] transition-colors hover:bg-fucsia-osc"
        >
          Publicar gratis
        </Link>
      </Contenedor>
    </>
  );
}
