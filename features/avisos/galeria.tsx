'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/cn';
import {
  VARIANTES,
  agruparVariantes,
  fotoDeVariante,
  variantesDisponibles,
  type ClaveDeVariante,
} from '@/lib/ia/imagenes';
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
 *
 * Cuando una foto tiene versiones hechas con Wasi AI, no se muestran
 * como fotos aparte: se agrupan con la original y aparece un selector
 * —Original · Mejorada · Amoblada— encima. Ver la misma sala tres veces
 * seguidas no ayuda a nadie; poder alternar entre cómo está y cómo se
 * vería, sí. Y la etiqueta de la versión elegida se pinta siempre.
 */
export function Galeria({ fotos, titulo }: { fotos: readonly Foto[]; titulo: string }) {
  const [actual, setActual] = useState(0);
  const [ampliada, setAmpliada] = useState(false);
  const [elegidas, setElegidas] = useState<Record<string, ClaveDeVariante>>({});
  const tira = useRef<HTMLDivElement>(null);

  const grupos = useMemo(() => agruparVariantes(fotos), [fotos]);

  // Lo que se ve: una entrada por foto, en la versión que la persona
  // eligió. Sin elegir nada, la original.
  const mostradas = grupos.map((grupo) =>
    fotoDeVariante(grupo, elegidas[grupo.original.id] ?? 'original'),
  );

  const total = mostradas.length;

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

  const grupo = grupos[actual];
  const foto = mostradas[actual]!;
  const opciones = grupo ? variantesDisponibles(grupo) : [];

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
          {mostradas.map((f, i) => (
            <div key={f.id} className="relative aspect-[4/3] w-full shrink-0 snap-center">
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
          {mostradas.map((f, i) => (
            <span
              key={f.id}
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

        {grupo && opciones.length > 1 && (
          <div className="mt-2 flex justify-center">
            <SelectorDeVariante
              opciones={opciones}
              elegida={elegidas[grupo.original.id] ?? 'original'}
              alElegir={(v) => setElegidas((p) => ({ ...p, [grupo.original.id]: v }))}
            />
          </div>
        )}
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

        {grupo && opciones.length > 1 && (
          <div className="mt-2.5">
            <SelectorDeVariante
              opciones={opciones}
              elegida={elegidas[grupo.original.id] ?? 'original'}
              alElegir={(v) => setElegidas((p) => ({ ...p, [grupo.original.id]: v }))}
            />
          </div>
        )}

        {total > 1 && (
          <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {mostradas.map((f, i) => (
              <li key={f.id}>
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

/**
 * Original · Mejorada · Amoblada.
 *
 * Un grupo de botones de verdad, no pestañas simuladas: se recorre con
 * el tabulador y el lector de pantalla lee cuál está activa. En móvil el
 * área táctil llega a los 40 px de alto, que es lo mínimo usable con el
 * pulgar.
 */
function SelectorDeVariante({
  opciones,
  elegida,
  alElegir,
}: {
  opciones: readonly ClaveDeVariante[];
  elegida: ClaveDeVariante;
  alElegir: (variante: ClaveDeVariante) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Ver esta foto en otra versión"
      className="border-linea inline-flex gap-1 rounded-full border bg-white p-1"
    >
      {opciones.map((clave) => (
        <button
          key={clave}
          type="button"
          onClick={() => alElegir(clave)}
          aria-pressed={clave === elegida}
          className={cn(
            'rounded-full px-3.5 py-1.5 text-[13.5px] font-bold transition-colors',
            clave === elegida ? 'bg-tinta text-white' : 'text-tinta-60 hover:text-tinta',
          )}
        >
          {VARIANTES[clave]}
        </button>
      ))}
    </div>
  );
}
