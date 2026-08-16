'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import { Aviso } from '@/components/estados/estado-error';
import { interpretarBusqueda } from '@/features/busqueda/conversacion-acciones';
import type { Interpretacion } from '@/features/busqueda/conversacion-tipos';
import type { Operacion } from '@/types/base-datos';

/**
 * Buscar escribiendo, como se le cuenta a un corredor.
 *
 * Lo que sale de acá NO son avisos: son filtros. La búsqueda se ejecuta
 * yendo a la URL de siempre, con las mismas consultas y la misma
 * seguridad a nivel de fila. Un modelo que redacta resultados inventa
 * direcciones y precios; uno que solo arma un WHERE no puede.
 *
 * Lo entendido se muestra SIEMPRE antes de ir a los resultados, y cada
 * filtro se puede quitar de a uno. Si entendimos mal, se ve de inmediato.
 */

const EJEMPLO =
  'Busco un departamento en Jesús María, máximo US$150,000, con dos dormitorios, estacionamiento y que acepte mascotas.';

export function BuscadorConversacional({ operacion }: { operacion: Operacion }) {
  const [texto, setTexto] = useState('');
  const [interpretacion, setInterpretacion] = useState<Interpretacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quitados, setQuitados] = useState<string[]>([]);
  const [pensando, empezar] = useTransition();
  const router = useRouter();

  function interpretar(consulta: string) {
    setError(null);
    setQuitados([]);
    empezar(async () => {
      const respuesta = await interpretarBusqueda(consulta, operacion);
      if (respuesta.ok) setInterpretacion(respuesta.interpretacion);
      else {
        setInterpretacion(null);
        setError(respuesta.mensaje);
      }
    });
  }

  /** La URL final, quitando los filtros que la persona descartó. */
  function urlFinal(): string {
    if (!interpretacion) return '';
    if (quitados.length === 0) return interpretacion.url;

    const [ruta, consulta] = interpretacion.url.split('?');
    const params = new URLSearchParams(consulta ?? '');
    for (const clave of quitados) params.delete(clave);
    const cola = params.toString();
    return cola ? `${ruta}?${cola}` : (ruta ?? '');
  }

  const chips = (interpretacion?.chips ?? []).filter((c) => !quitados.includes(c.clave));

  return (
    <Tarjeta className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Insignia tono="verde">Wasi AI</Insignia>
        <p className="text-tinta-60 text-[13.5px]">
          Cuéntanos qué buscas como se lo contarías a un corredor.
        </p>
      </div>

      <form
        className="mt-3.5 flex flex-col gap-2.5 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          interpretar(texto);
        }}
      >
        <label className="sr-only" htmlFor="consulta">
          Qué estás buscando
        </label>
        <input
          id="consulta"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={EJEMPLO}
          maxLength={500}
          className="border-linea bg-niebla text-tinta focus:border-fucsia w-full rounded-xl border-[1.5px] px-3.5 py-3 text-[15px] focus:bg-white focus:outline-none"
        />
        <button
          type="submit"
          disabled={pensando || texto.trim().length < 3}
          className="bg-fucsia hover:bg-fucsia-osc rounded-xl px-5 py-3 text-[15px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          {pensando ? 'Leyendo…' : 'Buscar'}
        </button>
      </form>

      {!interpretacion && !error && (
        <button
          type="button"
          onClick={() => {
            setTexto(EJEMPLO);
            interpretar(EJEMPLO);
          }}
          className="text-tinta-45 hover:text-tinta-60 mt-2 text-left text-[12.5px] underline"
        >
          Probar con un ejemplo
        </button>
      )}

      {error && (
        <div className="mt-3">
          <Aviso>{error}</Aviso>
        </div>
      )}

      {interpretacion && (
        <div className="mt-4">
          {interpretacion.aviso && (
            <div className="mb-3">
              <Aviso>{interpretacion.aviso}</Aviso>
            </div>
          )}

          <p className="text-tinta-60 text-[13.5px] font-bold">Entendimos esto:</p>

          {chips.length === 0 ? (
            <p className="text-tinta-60 mt-2 text-[14px]">
              No pudimos sacar ningún filtro de esa frase. Prueba nombrando el distrito, el
              precio máximo o los dormitorios.
            </p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <li key={chip.clave}>
                  <button
                    type="button"
                    onClick={() => setQuitados((q) => [...q, chip.clave])}
                    className="border-linea text-tinta-70 hover:border-fucsia inline-flex items-center gap-1.5 rounded-full border-[1.5px] bg-white px-3 py-1.5 text-[13.5px]"
                  >
                    <span className="font-bold">{chip.etiqueta}:</span> {chip.valor}
                    <span aria-hidden className="text-tinta-40">
                      ×
                    </span>
                    <span className="sr-only">Quitar este filtro</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="text-tinta-45 mt-2 text-[12.5px]">
            Toca un filtro para quitarlo. Los resultados salen de la base de Wasipe: Wasi AI
            solo traduce tu frase a filtros, no escribe avisos.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push(urlFinal())}
              className="bg-turquesa hover:bg-turquesa-osc rounded-full px-4 py-2 text-[14.5px] font-bold text-white"
            >
              Ver los resultados
            </button>
            <button
              type="button"
              onClick={() => {
                setInterpretacion(null);
                setQuitados([]);
              }}
              className="text-tinta-60 hover:text-tinta rounded-full px-4 py-2 text-[14.5px] font-bold"
            >
              Escribir otra cosa
            </button>
          </div>
        </div>
      )}
    </Tarjeta>
  );
}
