'use client';

import { useState, useTransition } from 'react';
import { Aviso } from '@/components/estados/estado-error';
import { revisarImagen } from '@/features/wasi-ai/moderacion-acciones';

/**
 * Los tres botones de la revisión de seguridad.
 *
 * Marcar y retirar exigen un motivo escrito. No es burocracia: si una
 * foto se deja de mostrar, quien la subió tiene derecho a saber por qué,
 * y ese texto es lo que va a leer.
 */
export function RevisionDeImagen({ mediaId }: { mediaId: string }) {
  const [motivo, setMotivo] = useState('');
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje?: string } | null>(null);
  const [enviando, empezar] = useTransition();

  function decidir(estado: 'cleared' | 'flagged' | 'blocked') {
    empezar(async () => {
      setResultado(await revisarImagen(mediaId, estado, motivo));
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <label className="sr-only" htmlFor={`motivo-${mediaId}`}>
        Motivo de la observación
      </label>
      <input
        id={`motivo-${mediaId}`}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo (obligatorio para observar o retirar)"
        maxLength={240}
        className="border-linea bg-niebla focus:border-fucsia w-full rounded-xl border-[1.5px] px-3 py-2 text-[14px] focus:bg-white focus:outline-none"
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={enviando}
          onClick={() => decidir('cleared')}
          className="bg-turquesa hover:bg-turquesa-osc rounded-full px-3.5 py-1.5 text-[13.5px] font-bold text-white disabled:opacity-45"
        >
          Está bien
        </button>
        <button
          type="button"
          disabled={enviando}
          onClick={() => decidir('flagged')}
          className="border-linea text-tinta-70 rounded-full border-[1.5px] bg-white px-3.5 py-1.5 text-[13.5px] font-bold disabled:opacity-45"
        >
          Observar
        </button>
        <button
          type="button"
          disabled={enviando}
          onClick={() => decidir('blocked')}
          className="bg-fucsia-suave text-fucsia-osc rounded-full px-3.5 py-1.5 text-[13.5px] font-bold disabled:opacity-45"
        >
          Retirar del aviso
        </button>
      </div>

      {resultado && !resultado.ok && <Aviso>{resultado.mensaje}</Aviso>}
      {resultado?.ok && <Aviso tono="bien">Revisión guardada.</Aviso>}
    </div>
  );
}
