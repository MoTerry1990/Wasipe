'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { TIPOS_INMUEBLE, DISTRITOS_POPULARES } from '@/config/sitio';
import { urlDeBusqueda } from '@/lib/catalogo';
import { AutocompletadoUbicacion } from '@/features/busqueda/autocompletado-ubicacion';
import { cn } from '@/lib/cn';
import type { Operacion } from '@/types/base-datos';

const PESTANAS = [
  { texto: 'Comprar', operacion: 'sale' },
  { texto: 'Alquilar', operacion: 'rent' },
  { texto: 'Proyectos', operacion: 'project' },
] as const satisfies readonly { texto: string; operacion: Operacion }[];

/**
 * Buscador del hero.
 *
 * Cada pestaña lleva a su propia ruta (`/comprar`, `/alquilar`,
 * `/proyectos`) en vez de a `/buscar?operacion=x`: así cada operación es
 * una página indexable por separado, que es como se busca en Google en
 * el Perú ("departamentos en alquiler en Miraflores").
 *
 * Es un formulario de verdad, con `action` calculada al enviar. Funciona
 * con Enter, con el botón, y con el teclado del celular.
 */
export function BuscadorHero({
  operacionInicial = 'sale',
  donde = '',
}: {
  operacionInicial?: Operacion;
  donde?: string;
}) {
  const router = useRouter();
  const [operacion, setOperacion] = useState<Operacion>(operacionInicial);
  const [tipo, setTipo] = useState('departamento');

  function buscar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    router.push(
      urlDeBusqueda(operacion, {
        tipo,
        donde: String(datos.get('donde') ?? ''),
      }),
    );
  }

  return (
    <div className="mx-auto w-full max-w-[760px]">
      <form
        onSubmit={buscar}
        role="search"
        aria-label="Buscar propiedades"
        className="border-linea shadow-marca rounded-marca border bg-white text-left"
      >
        <div role="tablist" aria-label="Tipo de operación" className="flex gap-0.5 px-2 pt-2">
          {PESTANAS.map((pestana) => {
            const activa = pestana.operacion === operacion;
            return (
              <button
                key={pestana.operacion}
                type="button"
                role="tab"
                aria-selected={activa}
                onClick={() => setOperacion(pestana.operacion)}
                className={cn(
                  'shrink-0 rounded-t-[10px] border-b-[3px] px-4 py-2.5 text-[15px] font-bold transition-colors',
                  activa
                    ? 'border-fucsia text-fucsia'
                    : 'text-tinta-60 hover:text-tinta border-transparent',
                )}
              >
                {pestana.texto}
              </button>
            );
          })}
        </div>

        <div className="border-linea flex flex-wrap gap-2.5 border-t p-3.5">
          <label className="solo-lectores" htmlFor="tipo-inmueble">
            Tipo de propiedad
          </label>
          <select
            id="tipo-inmueble"
            name="tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="border-linea bg-niebla text-tinta focus:border-fucsia flex-[0_1_190px] rounded-xl border-[1.5px] px-3 py-3 text-[15.5px] font-semibold focus:outline-none"
          >
            {TIPOS_INMUEBLE.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.texto}
              </option>
            ))}
          </select>

          <div className="border-linea bg-niebla focus-within:border-fucsia flex min-w-0 flex-[1_1_260px] items-center gap-2.5 rounded-xl border-[1.5px] px-3.5 focus-within:bg-white">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              className="text-tinta-40 shrink-0"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.2" />
              <path
                d="M16.5 16.5L21 21"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
            <AutocompletadoUbicacion valorInicial={donde} className="min-w-0 flex-1" />
          </div>

          <button
            type="submit"
            className="bg-fucsia hover:bg-fucsia-osc flex-[1_1_130px] rounded-xl px-6 py-3 text-[15.5px] font-bold text-white shadow-[0_6px_16px_-6px_rgb(225_29_116_/_0.5)] transition-colors sm:flex-[0_0_auto]"
          >
            Buscar
          </button>
        </div>
      </form>

      {/* Atajos: casi todo el mundo empieza por un distrito conocido. */}
      <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
        <span className="text-tinta-60 text-[13.5px] font-semibold">Buscados ahora:</span>
        {DISTRITOS_POPULARES.slice(0, 5).map((distrito) => (
          <Link
            key={distrito.slug}
            href={urlDeBusqueda(operacion, { donde: distrito.slug })}
            className="border-linea text-tinta-60 hover:border-fucsia hover:text-fucsia rounded-full border bg-white/80 px-3 py-1.5 text-[13.5px] font-semibold transition-colors"
          >
            {distrito.nombre}
          </Link>
        ))}
      </div>
    </div>
  );
}
