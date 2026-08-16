'use client';

import { useState, useTransition } from 'react';
import { Aviso } from '@/components/estados/estado-error';
import { recalcularMercado } from '@/features/mercado/acciones';

/**
 * Recalcular el índice a mano.
 *
 * Lo normal es que lo corra una tarea programada. Este botón existe para
 * después de cargar un tipo de cambio nuevo o de una limpieza de avisos,
 * cuando hay que ver el efecto ahora y no mañana.
 */
export function BotonRecalcular() {
  const [resultado, setResultado] = useState<{
    ok: boolean;
    filas?: number;
    mensaje?: string;
  } | null>(null);
  const [corriendo, empezar] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        disabled={corriendo}
        onClick={() =>
          empezar(async () => {
            setResultado(await recalcularMercado());
          })
        }
        className="bg-turquesa hover:bg-turquesa-osc self-start rounded-full px-5 py-2.5 text-[14.5px] font-bold text-white disabled:opacity-45"
      >
        {corriendo ? 'Recalculando…' : 'Recalcular el índice'}
      </button>

      {resultado?.ok && (
        <Aviso tono="bien">
          Listo: quedaron {resultado.filas} filas en el índice. Queda anotado en la bitácora.
        </Aviso>
      )}
      {resultado && !resultado.ok && <Aviso>{resultado.mensaje}</Aviso>}
    </div>
  );
}
