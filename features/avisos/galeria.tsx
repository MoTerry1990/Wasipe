'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/cn';
import type { Foto } from '@/lib/consultas/aviso';

/**
 * Galería de fotos y videos.
 *
 * En escritorio: una foto grande y una tira de miniaturas debajo.
 * En móvil: un carrusel que se desliza con el dedo, usando el
 * desplazamiento nativo con puntos de anclaje. Nada de arrastrar con
 * JavaScript: el desplazamiento del sistema es más suave, respeta el
 * rebote del teléfono y funciona aunque el JavaScript tarde en cargar.
 *
 * El alto está fijado por relación de aspecto, así que la página no salta
 * cuando las imágenes terminan de bajar.
 */
export function Galeria({ fotos, titulo }: { fotos: readonly Foto[]; titulo: string }) {
  const [actual, setActual] = useState(0);
  const [ampliada, setAmpliada] = useState(false);
  const tira = useRef<HTMLDivElement>(null);

  const total = fotos.length;

  // Flechas del teclado y Escape mientras está ampliada.
  useEffect(() => {
    if (!ampliada) return;

    function alTeclear(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAmpliada(false);
      if (evento.key === 'ArrowRight') setActual((i) => (i + 1) % total);
      if (evento.key === 'ArrowLeft') setActual((i) => (i - 1 + total) % total);
    }

    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [ampliada, total]);

  if (total === 0) {
    return (
      <div className="border-linea bg-niebla text-tinta-40 grid aspect-[16/10] w-full place-items-center rounded-2xl border">
        Este aviso todavía no tiene fotos
      </div>
    );
  }

  const foto = fotos[actual]!;

  function mover(paso: number) {
    const siguiente = (actual + paso + total) % total;
    setActual(siguiente);
    // En móvil la tira es la que manda: hay que llevarla a la posición.
    tira.current?.scrollTo({ left: tira.current.clientWidth * siguiente, behavior: 'smooth' });
  }

  return (
    <>
      {/* Móvil: carrusel deslizable */}
      <div className="sm:hidden">
        <div
          ref={tira}
          onScroll={(e) => {
            const ancho = e.currentTarget.clientWidth;
            if (ancho > 0) setActual(Math.round(e.currentTarget.scrollLeft / ancho));
          }}
          className="flex snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto rounded-2xl [&::-webkit-scrollbar]:hidden"
        >
          {fotos.map((f, i) => (
            <div key={f.url} className="relative aspect-[4/3] w-full shrink-0 snap-center">
              <Image
                src={f.url}
                alt={f.alt ?? `${titulo} — foto ${i + 1}`}
                fill
                sizes="100vw"
                priority={i === 0}
                loading={i === 0 ? undefined : 'lazy'}
                className="bg-niebla object-cover"
              />
              {f.ai_label && (
                <span className="absolute right-2.5 bottom-2.5 rounded-full bg-black/60 px-2.5 py-1 text-[11.5px] font-semibold text-white">
                  {f.ai_label}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-center gap-1.5">
          {fotos.map((f, i) => (
            <span
              key={f.url}
              className={cn(
                'size-1.5 rounded-full transition-colors',
                i === actual ? 'bg-fucsia' : 'bg-linea',
              )}
            />
          ))}
        </div>
        <p className="text-tinta-45 mt-1 text-center text-[13px]">
          <span className="cifra">{actual + 1}</span> de <span className="cifra">{total}</span>
        </p>
      </div>

      {/* Escritorio: foto grande y miniaturas */}
      <div className="hidden sm:block">
        <div className="bg-niebla relative aspect-[16/10] w-full overflow-hidden rounded-2xl">
          <Image
            src={foto.url}
            alt={foto.alt ?? `${titulo} — foto ${actual + 1}`}
            fill
            sizes="(max-width: 1024px) 100vw, 60vw"
            priority={actual === 0}
            className="object-cover"
          />

          {foto.ai_label && (
            // Transparencia obligatoria: la etiqueta la genera la base.
            <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1.5 text-[12.5px] font-semibold text-white">
              {foto.ai_label}
            </span>
          )}

          {total > 1 && (
            <>
              <button
                type="button"
                onClick={() => mover(-1)}
                className="text-tinta absolute top-1/2 left-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow-md transition-colors hover:bg-white"
              >
                ‹<span className="solo-lectores">Foto anterior</span>
              </button>
              <button
                type="button"
                onClick={() => mover(1)}
                className="text-tinta absolute top-1/2 right-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow-md transition-colors hover:bg-white"
              >
                ›<span className="solo-lectores">Foto siguiente</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setAmpliada(true)}
            className="text-tinta absolute right-3 bottom-3 rounded-xl bg-white/90 px-3 py-2 text-[13.5px] font-bold shadow-md transition-colors hover:bg-white"
          >
            Ver en grande
          </button>
        </div>

        {total > 1 && (
          <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {fotos.map((f, i) => (
              <li key={f.url}>
                <button
                  type="button"
                  onClick={() => setActual(i)}
                  aria-current={i === actual ? 'true' : undefined}
                  className={cn(
                    'relative block size-20 shrink-0 overflow-hidden rounded-xl transition-[outline]',
                    i === actual ? 'outline-fucsia outline-3' : 'outline-0 outline-transparent',
                  )}
                >
                  <Image
                    src={f.url}
                    alt=""
                    fill
                    sizes="80px"
                    loading="lazy"
                    className="bg-niebla object-cover"
                  />
                  <span className="solo-lectores">Ver la foto {i + 1}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Ampliada */}
      {ampliada && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Fotos de ${titulo}`}
          className="fixed inset-0 z-50 flex flex-col bg-black/92 p-4"
          onClick={() => setAmpliada(false)}
        >
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setAmpliada(false)}
              className="rounded-xl px-4 py-2 font-bold text-white"
            >
              Cerrar
            </button>
          </div>

          <div className="relative flex-1" onClick={(e) => e.stopPropagation()}>
            <Image
              src={foto.url}
              alt={foto.alt ?? `${titulo} — foto ${actual + 1}`}
              fill
              sizes="100vw"
              className="object-contain"
            />
          </div>

          <div
            className="flex items-center justify-center gap-6 pt-3 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={() => mover(-1)} className="px-4 py-2 text-2xl">
              ‹<span className="solo-lectores">Foto anterior</span>
            </button>
            <span className="cifra text-[14px]">
              {actual + 1} / {total}
            </span>
            <button type="button" onClick={() => mover(1)} className="px-4 py-2 text-2xl">
              ›<span className="solo-lectores">Foto siguiente</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
