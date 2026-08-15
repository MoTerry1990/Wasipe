'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TIPOS_INMUEBLE, DISTRITOS_POPULARES } from '@/config/sitio';
import { cn } from '@/lib/cn';

const PESTANAS = [
  { texto: 'Comprar', ruta: '/comprar' },
  { texto: 'Alquilar', ruta: '/alquilar' },
  { texto: 'Proyectos', ruta: '/proyectos' },
] as const;

/**
 * Buscador del hero. Funcional: arma la URL y navega.
 *
 * Cada pestaña lleva a su propia ruta (`/comprar`, `/alquilar`) en vez de
 * a `/buscar?operacion=x`. Así las páginas son indexables por separado y
 * se resuelve de paso el enlace roto de "Proyectos" (KNOWN_ISSUES P-06).
 */
export function BuscadorHero() {
  const router = useRouter();
  const [pestana, setPestana] = useState(0);
  const [tipo, setTipo] = useState('departamento');
  const [donde, setDonde] = useState('');

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    const destino = PESTANAS[pestana]?.ruta ?? '/comprar';
    const params = new URLSearchParams();
    if (tipo) params.set('tipo', tipo);
    const texto = donde.trim();
    if (texto) params.set('donde', texto);
    router.push(params.toString() ? `${destino}?${params}` : destino);
  }

  return (
    <div className="mx-auto w-full max-w-[760px]">
      <form
        onSubmit={buscar}
        className="rounded-marca border border-linea bg-white text-left shadow-marca"
      >
        <div role="tablist" aria-label="Tipo de operación" className="flex gap-0.5 px-2 pt-2">
          {PESTANAS.map((p, i) => (
            <button
              key={p.texto}
              type="button"
              role="tab"
              aria-selected={pestana === i}
              onClick={() => setPestana(i)}
              className={cn(
                'shrink-0 rounded-t-[10px] border-b-[3px] px-4 py-2.5 text-[15px] font-bold transition-colors',
                pestana === i
                  ? 'border-fucsia text-fucsia'
                  : 'border-transparent text-tinta-60 hover:text-tinta',
              )}
            >
              {p.texto}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2.5 border-t border-linea p-3.5">
          <label className="sr-only" htmlFor="tipo-inmueble">
            Tipo de propiedad
          </label>
          <select
            id="tipo-inmueble"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="flex-[0_1_190px] rounded-xl border-[1.5px] border-linea bg-niebla px-3 py-3 text-[15.5px] font-semibold text-tinta focus:border-fucsia focus:outline-none"
          >
            {TIPOS_INMUEBLE.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.texto}
              </option>
            ))}
          </select>

          <div className="flex min-w-0 flex-[1_1_260px] items-center gap-2.5 rounded-xl border-[1.5px] border-linea bg-niebla px-3.5 focus-within:border-fucsia focus-within:bg-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-tinta-40" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.2" />
              <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <label className="sr-only" htmlFor="donde">
              Distrito o zona
            </label>
            <input
              id="donde"
              type="search"
              value={donde}
              onChange={(e) => setDonde(e.target.value)}
              placeholder="¿En qué distrito buscas?"
              className="min-w-0 flex-1 border-0 bg-transparent py-3 text-base text-tinta placeholder:text-tinta-40 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="rounded-xl bg-fucsia px-7 py-3 font-bold text-white shadow-[0_6px_16px_-6px_rgb(225_29_116_/_0.5)] transition-colors hover:bg-fucsia-osc"
          >
            Buscar propiedades
          </button>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap justify-center gap-2" translate="no">
        {DISTRITOS_POPULARES.map((d) => (
          <button
            key={d.slug}
            type="button"
            onClick={() => router.push(`/comprar?donde=${d.slug}`)}
            className="rounded-full border border-linea bg-white/80 px-3.5 py-1.5 text-[13.5px] font-semibold text-tinta-60 transition-colors hover:border-fucsia hover:bg-white hover:text-fucsia"
          >
            {d.nombre}
          </button>
        ))}
      </div>
    </div>
  );
}
