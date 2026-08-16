'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import {
  AVISO_DE_RECOMENDACION,
  CLAVES_DE_PRIORIDAD,
  NUNCA_EN_UNA_RECOMENDACION,
  PRIORIDADES,
  armarComparacion,
  recomendar,
  type AvisoComparado,
  type ClaveDePrioridad,
} from '@/lib/ia/comparar';
import { enlaceDeAviso } from '@/lib/avisos/enlace';
import { dinero } from '@/lib/formato';
import { cn } from '@/lib/cn';

/**
 * Comparación de hasta cuatro avisos.
 *
 * La tabla no calcula nada: los valores vienen de `comparar_avisos()`.
 * Lo único que se hace en el navegador es marcar cuál gana cada fila y
 * sumar los puntajes de las prioridades que la persona elija.
 *
 * La recomendación se muestra separada en dos: los HECHOS, que se pueden
 * contrastar uno por uno con la tabla de arriba, y lo que la comparación
 * NO puede decir. Mezclarlos sería vender una opinión como si fuera un
 * dato.
 */
export function TablaComparativa({ avisos }: { avisos: readonly AvisoComparado[] }) {
  const [prioridades, setPrioridades] = useState<ClaveDePrioridad[]>([]);

  const filas = armarComparacion(avisos);
  const { ganador, puntajes, hechos, advertencias } = recomendar(avisos, prioridades);

  function alternar(clave: ClaveDePrioridad) {
    setPrioridades((previas) =>
      previas.includes(clave) ? previas.filter((p) => p !== clave) : [...previas, clave],
    );
  }

  return (
    <div className="flex flex-col gap-7">
      {/* La tabla se desplaza sola; la página no. */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[640px] border-collapse text-[14.5px]">
          <caption className="sr-only">Comparación de {avisos.length} propiedades</caption>
          <thead>
            <tr>
              <th scope="col" className="w-40" />
              {avisos.map((aviso, i) => (
                <th key={aviso.code} scope="col" className="p-2 text-left align-top">
                  <Link href={enlaceDeAviso(aviso)} className="block">
                    {aviso.cover_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={aviso.cover_url}
                        alt=""
                        className="bg-niebla mb-2 aspect-[4/3] w-full rounded-xl object-cover"
                      />
                    )}
                    <span className="text-tinta block text-[14.5px] leading-tight font-bold">
                      {aviso.title}
                    </span>
                    <span className="text-tinta-45 block text-[13px]">
                      {aviso.district} · {aviso.code}
                    </span>
                  </Link>
                  {ganador === i && (
                    <span className="mt-2 inline-block">
                      <Insignia tono="verde">Recomendado</Insignia>
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filas.map((fila) => (
              <tr key={fila.clave} className="border-linea border-t">
                <th
                  scope="row"
                  className="text-tinta-60 p-2 text-left align-top text-[13.5px] font-bold"
                >
                  {fila.etiqueta}
                  {fila.nota && (
                    <span className="text-tinta-45 block text-[12px] font-normal">
                      {fila.nota}
                    </span>
                  )}
                </th>
                {fila.valores.map((valor, i) => (
                  <td
                    key={`${fila.clave}-${i}`}
                    className={cn(
                      'p-2 align-top',
                      fila.mejores.includes(i) && 'text-turquesa-osc font-bold',
                    )}
                  >
                    {valor}
                    {fila.mejores.includes(i) && <span className="sr-only"> (el mejor)</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --------------------------------------------------------- */}

      <Tarjeta className="p-5">
        <h2 className="text-xl">¿Qué es lo que más te importa?</h2>
        <p className="text-tinta-60 mt-1.5 text-[14px]">
          Elige una o varias. Sin elegir nada no hay recomendación: cuál es tu prioridad no lo
          decidimos nosotros.
        </p>

        <div className="mt-3.5 flex flex-wrap gap-2">
          {CLAVES_DE_PRIORIDAD.map((clave) => (
            <button
              key={clave}
              type="button"
              aria-pressed={prioridades.includes(clave)}
              onClick={() => alternar(clave)}
              className={cn(
                'rounded-full border-[1.5px] px-3.5 py-1.5 text-[13.5px] font-bold',
                prioridades.includes(clave)
                  ? 'border-turquesa bg-turquesa text-white'
                  : 'border-linea text-tinta-70 bg-white',
              )}
            >
              {PRIORIDADES[clave].etiqueta}
            </button>
          ))}
        </div>

        {prioridades.length > 0 && (
          <div className="mt-5">
            <p className="text-tinta-60 mb-3 text-[13px] italic">{AVISO_DE_RECOMENDACION}</p>

            {ganador === null ? (
              <p className="text-tinta text-[15px]">
                Con esas prioridades quedan empatados. No inventamos un desempate: mira los
                hechos de abajo y decide tú.
              </p>
            ) : (
              <p className="text-tinta text-[15px]">
                Con lo que elegiste, el que mejor calza es{' '}
                <strong>{avisos[ganador]!.title}</strong> ({avisos[ganador]!.code}), a{' '}
                {dinero(avisos[ganador]!.price, avisos[ganador]!.currency)}.
              </p>
            )}

            {hechos.length > 0 && (
              <>
                <h3 className="mt-4 text-[15px] font-bold">Los hechos</h3>
                <p className="text-tinta-45 text-[12.5px]">
                  Cada uno sale de la base y se puede contrastar con la tabla de arriba.
                </p>
                <ul className="text-tinta-70 mt-2 flex flex-col gap-1.5 text-[14px]">
                  {hechos.map((hecho) => (
                    <li key={hecho}>· {hecho}</li>
                  ))}
                </ul>
              </>
            )}

            <h3 className="mt-4 text-[15px] font-bold">Lo que esta comparación no dice</h3>
            <ul className="text-tinta-70 mt-2 flex flex-col gap-1.5 text-[14px]">
              {advertencias.map((a) => (
                <li key={a}>· {a}</li>
              ))}
            </ul>

            <details className="mt-4">
              <summary className="text-tinta-60 cursor-pointer text-[13.5px]">
                Y lo que nunca vas a leer en una recomendación de Wasipe
              </summary>
              <ul className="text-tinta-70 mt-2 flex flex-col gap-1.5 text-[14px]">
                {NUNCA_EN_UNA_RECOMENDACION.map((linea) => (
                  <li key={linea}>· {linea}</li>
                ))}
              </ul>
            </details>

            <div className="border-linea mt-5 border-t pt-3">
              <h3 className="text-[14px] font-bold">Cómo salió la cuenta</h3>
              <ul className="mt-2 flex flex-col gap-1.5">
                {avisos.map((aviso, i) => (
                  <li key={aviso.code} className="flex items-center gap-2.5 text-[13.5px]">
                    <span className="text-tinta-60 w-24 shrink-0 truncate">{aviso.code}</span>
                    <span className="bg-niebla h-2 flex-1 overflow-hidden rounded-full">
                      <span
                        className="bg-turquesa block h-full"
                        style={{ width: `${Math.round(puntajes[i]! * 100)}%` }}
                      />
                    </span>
                    <span className="cifra text-tinta-60 w-10 text-right">
                      {Math.round(puntajes[i]! * 100)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Tarjeta>
    </div>
  );
}
