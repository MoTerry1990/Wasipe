'use client';

import { useId, useRef, useState } from 'react';

/**
 * Antes y después.
 *
 * Dos imágenes superpuestas y una línea que se arrastra: la de la
 * derecha es la original y la de la izquierda, la propuesta. Ver las dos
 * a la vez y en el mismo encuadre es lo único que permite darse cuenta
 * de si la IA cambió algo que no debía.
 *
 * El control es un `input[type=range]` de verdad, invisible encima de la
 * imagen. No es un adorno: así funciona con el dedo, con el mouse, con
 * el teclado y con un lector de pantalla, sin escribir ni un gestor de
 * arrastre. En un teléfono, que es donde se va a usar, arrastrar con
 * JavaScript pelea con el desplazamiento de la página; esto no.
 */
export function Comparador({
  original,
  propuesta,
  etiqueta,
  alt,
}: {
  original: string;
  propuesta: string;
  /** «Imagen modificada con Wasi AI» o la de amoblamiento virtual. */
  etiqueta: string;
  alt: string;
}) {
  const [corte, setCorte] = useState(50);
  const id = useId();
  const marco = useRef<HTMLDivElement>(null);

  return (
    <figure className="m-0">
      <div
        ref={marco}
        className="border-linea relative aspect-[4/3] w-full overflow-hidden rounded-2xl border select-none"
      >
        {/* Debajo: la foto original, completa. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={original}
          alt={`${alt} — original`}
          className="bg-niebla absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />

        {/* Encima: la propuesta, recortada hasta donde está la línea. */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - corte}% 0 0)` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={propuesta}
            alt={`${alt} — ${etiqueta}`}
            className="bg-niebla absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
        </div>

        {/* La línea y su tirador. Solo decoración: el control es el range. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
          style={{ left: `${corte}%` }}
        >
          <span className="absolute top-1/2 left-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[13px] font-bold shadow-md">
            ↔
          </span>
        </div>

        <span className="pointer-events-none absolute top-2.5 left-2.5 rounded-full bg-black/65 px-2.5 py-1 text-[11.5px] font-bold text-white">
          {etiqueta}
        </span>
        <span className="pointer-events-none absolute top-2.5 right-2.5 rounded-full bg-black/65 px-2.5 py-1 text-[11.5px] font-bold text-white">
          Tu foto original
        </span>

        <label htmlFor={id} className="sr-only">
          Deslizar para comparar la foto original con la propuesta
        </label>
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={1}
          value={corte}
          onChange={(e) => setCorte(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-ew-resize appearance-none bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white [&::-moz-range-thumb]:h-full [&::-moz-range-thumb]:w-10 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent [&::-webkit-slider-thumb]:h-full [&::-webkit-slider-thumb]:w-10 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-transparent"
        />
      </div>

      <figcaption className="text-tinta-45 mt-2 text-[12.5px]">
        Arrastra la línea —o usa las flechas del teclado— para ver qué cambió.
      </figcaption>
    </figure>
  );
}
