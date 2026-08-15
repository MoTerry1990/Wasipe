import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Contenedor } from '@/components/ui/contenedor';
import { SkylineLima } from '@/components/marca/skyline-lima';
import { SeccionCargando } from '@/components/propiedades/seccion-avisos';
import { BuscadorHero } from '@/features/busqueda/buscador-hero';
import { SelectorMoneda } from '@/features/preferencias/selector-moneda';
import {
  Destacadas,
  RecienPublicadas,
  BajaronDePrecio,
  ProyectosNuevos,
  DistritosPopulares,
  PrecioPromedioPorMetro,
} from '@/features/portada/secciones-con-datos';
import {
  ComoFunciona,
  IntroWasiAi,
  Confianza,
  PublicaGratis,
} from '@/features/portada/secciones-fijas';
import { monedaPreferida } from '@/lib/preferencias';
import { tipoDeCambio } from '@/lib/consultas/portada';

export const metadata: Metadata = {
  title: 'Wasipe · Departamentos, casas y proyectos en venta y alquiler en el Perú',
  description:
    'Busca departamentos, casas, terrenos y proyectos en venta y alquiler en todo el Perú, con el precio por m² siempre visible. Publicar es gratis.',
  alternates: { canonical: '/' },
};

const GARANTIAS = [
  'Precio siempre visible',
  'Sin propiedades ya vendidas',
  'Publicar es gratis',
];

/**
 * Portada.
 *
 * El hero se dibuja de inmediato: no espera a ninguna consulta. Las seis
 * secciones que leen la base van cada una en su propio Suspense, así que
 * aparecen a medida que responden y una lenta no frena a las otras.
 *
 * Cada esqueleto ocupa el mismo alto que su sección real. Ese detalle es
 * lo que evita que la página salte mientras carga.
 */
export default async function Inicio() {
  const [moneda, cambio] = await Promise.all([monedaPreferida(), tipoDeCambio()]);
  const datos = { moneda, tipoDeCambio: cambio };

  return (
    <>
      {/*
        HERO
        La ilustración es la misma del sitio anterior, sin tocar. En móvil
        el relleno inferior se achica para que el skyline no se coma la
        pantalla y el buscador quede visible sin desplazar.
      */}
      <header
        id="hero"
        className="relative overflow-hidden bg-[linear-gradient(180deg,#C9E3F9,#E4F1FC_58%,#F4F6F8)]"
      >
        <Contenedor className="relative z-10 pt-7 pb-[clamp(120px,20vw,240px)] text-center sm:pt-12">
          <h1 className="mx-auto max-w-[22ch] text-[clamp(1.7rem,4.6vw,2.875rem)]">
            Encuentra tu próximo hogar sabiendo cuánto vale realmente
          </h1>
          <p className="text-tinta-60 mx-auto mt-3 mb-5 max-w-[48ch] text-[clamp(0.95rem,1.6vw,1.125rem)]">
            Casas, departamentos, terrenos y proyectos en todo el Perú, con precios por m² para
            comparar mejor.
          </p>

          <BuscadorHero />

          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
            <ul className="text-tinta-60 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[13.5px] font-semibold">
              {GARANTIAS.map((garantia) => (
                <li key={garantia} className="flex items-center gap-1.5">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="text-turquesa shrink-0"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="11" fill="currentColor" opacity="0.14" />
                    <path
                      d="M7 12.5l3.2 3.2L17 9"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {garantia}
                </li>
              ))}
            </ul>

            <SelectorMoneda actual={moneda} />
          </div>
        </Contenedor>

        <SkylineLima className="pointer-events-none absolute inset-x-0 -bottom-0.5 z-0 [&_svg]:block [&_svg]:h-auto [&_svg]:w-full" />
      </header>

      <Suspense fallback={<SeccionCargando />}>
        <Destacadas {...datos} />
      </Suspense>

      <Suspense fallback={<SeccionCargando />}>
        <RecienPublicadas {...datos} />
      </Suspense>

      <Suspense fallback={<SeccionCargando columnas={4} />}>
        <BajaronDePrecio {...datos} />
      </Suspense>

      <Suspense fallback={<SeccionCargando columnas={4} />}>
        <ProyectosNuevos {...datos} />
      </Suspense>

      <Suspense fallback={<SeccionCargando columnas={4} />}>
        <DistritosPopulares />
      </Suspense>

      <Suspense fallback={<SeccionCargando />}>
        <PrecioPromedioPorMetro {...datos} />
      </Suspense>

      <ComoFunciona />
      <IntroWasiAi />
      <Confianza />
      <PublicaGratis />
    </>
  );
}
