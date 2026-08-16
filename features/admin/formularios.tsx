'use client';

import { useState, useTransition } from 'react';
import { Aviso } from '@/components/estados/estado-error';
import {
  resolverBandera,
  verificarInmobiliaria,
  nombrarPersonal,
  quitarPuesto,
  marcarAviso,
} from '@/features/admin/acciones';
import { PUESTOS, PUESTOS_VALIDOS, type PuestoDeWasipe } from '@/lib/admin/permisos';

/**
 * Los formularios chicos de administración.
 *
 * Todos comparten la misma forma: una nota obligatoria y dos botones. La
 * nota no es burocracia — es lo que queda en la bitácora, que es
 * inmutable, y lo único que va a existir cuando dentro de seis meses
 * alguien pregunte por qué se tomó esta decisión.
 */

const CAJA =
  'border-linea bg-niebla text-tinta focus:border-fucsia w-full rounded-xl border-[1.5px] px-3 py-2 text-[14px] focus:bg-white focus:outline-none';

// ---------------------------------------------------------------------

export function ResolverBandera({ banderaId }: { banderaId: number }) {
  const [nota, setNota] = useState('');
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje?: string } | null>(null);
  const [enviando, empezar] = useTransition();

  function cerrar(estado: 'confirmed' | 'dismissed') {
    empezar(async () => setResultado(await resolverBandera(banderaId, estado, nota)));
  }

  const listo = !enviando && nota.trim().length >= 5;

  return (
    <div className="flex flex-col gap-2.5">
      <label className="sr-only" htmlFor={`nota-${banderaId}`}>
        Qué encontraste
      </label>
      <input
        id={`nota-${banderaId}`}
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Qué encontraste al mirarlo"
        maxLength={300}
        className={CAJA}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!listo}
          onClick={() => cerrar('dismissed')}
          className="border-linea text-tinta-70 rounded-full border-[1.5px] bg-white px-3.5 py-1.5 text-[13.5px] font-bold disabled:opacity-40"
        >
          Falsa alarma
        </button>
        <button
          type="button"
          disabled={!listo}
          onClick={() => cerrar('confirmed')}
          className="bg-fucsia-suave text-fucsia-osc rounded-full px-3.5 py-1.5 text-[13.5px] font-bold disabled:opacity-40"
        >
          Confirmar el problema
        </button>
      </div>
      {resultado && !resultado.ok && <Aviso>{resultado.mensaje}</Aviso>}
      {resultado?.ok && <Aviso tono="bien">Cerrada.</Aviso>}
    </div>
  );
}

// ---------------------------------------------------------------------

export function VolverAMarcar({ propiedadId }: { propiedadId: string }) {
  const [resultado, setResultado] = useState<{ puestas?: number; mensaje?: string } | null>(
    null,
  );
  const [corriendo, empezar] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={corriendo}
        onClick={() => empezar(async () => setResultado(await marcarAviso(propiedadId)))}
        className="text-turquesa-osc self-start text-[13.5px] font-bold underline disabled:opacity-45"
      >
        {corriendo ? 'Revisando…' : 'Volver a pasar las comprobaciones'}
      </button>
      {resultado?.puestas !== undefined && (
        <Aviso tono="bien">
          {resultado.puestas === 0
            ? 'No encontró nada nuevo.'
            : `Marcó ${resultado.puestas} cosa${resultado.puestas === 1 ? '' : 's'}.`}
        </Aviso>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------

export function VerificarInmobiliaria({ agenciaId }: { agenciaId: string }) {
  const [motivo, setMotivo] = useState('');
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje?: string } | null>(null);
  const [enviando, empezar] = useTransition();

  function decidir(estado: 'verified' | 'rejected' | 'in_progress') {
    empezar(async () => setResultado(await verificarInmobiliaria(agenciaId, estado, motivo)));
  }

  return (
    <div className="flex flex-col gap-2.5">
      <label className="sr-only" htmlFor={`motivo-${agenciaId}`}>
        Motivo
      </label>
      <input
        id={`motivo-${agenciaId}`}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Qué documentación revisaste (obligatorio para rechazar)"
        maxLength={300}
        className={CAJA}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={enviando}
          onClick={() => decidir('verified')}
          className="bg-turquesa rounded-full px-3.5 py-1.5 text-[13.5px] font-bold text-white disabled:opacity-40"
        >
          Verificar
        </button>
        <button
          type="button"
          disabled={enviando}
          onClick={() => decidir('in_progress')}
          className="border-linea text-tinta-70 rounded-full border-[1.5px] bg-white px-3.5 py-1.5 text-[13.5px] font-bold disabled:opacity-40"
        >
          En proceso
        </button>
        <button
          type="button"
          disabled={enviando || motivo.trim().length < 10}
          onClick={() => decidir('rejected')}
          className="bg-fucsia-suave text-fucsia-osc rounded-full px-3.5 py-1.5 text-[13.5px] font-bold disabled:opacity-40"
        >
          Rechazar
        </button>
      </div>
      {resultado && !resultado.ok && <Aviso>{resultado.mensaje}</Aviso>}
      {resultado?.ok && <Aviso tono="bien">Guardado.</Aviso>}
    </div>
  );
}

// ---------------------------------------------------------------------

export function PuestosDePersona({
  usuarioId,
  actuales,
}: {
  usuarioId: string;
  actuales: readonly PuestoDeWasipe[];
}) {
  const [nota, setNota] = useState('');
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje?: string } | null>(null);
  const [enviando, empezar] = useTransition();

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-2">
        {PUESTOS_VALIDOS.map((puesto) => {
          const tiene = actuales.includes(puesto);
          return (
            <button
              key={puesto}
              type="button"
              disabled={enviando}
              title={PUESTOS[puesto].resumen}
              onClick={() =>
                empezar(async () =>
                  setResultado(
                    tiene
                      ? await quitarPuesto(usuarioId, puesto)
                      : await nombrarPersonal(usuarioId, puesto, nota),
                  ),
                )
              }
              className={
                tiene
                  ? 'bg-tinta rounded-full px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-40'
                  : 'border-linea text-tinta-60 rounded-full border-[1.5px] bg-white px-3 py-1.5 text-[13px] font-bold disabled:opacity-40'
              }
            >
              {PUESTOS[puesto].etiqueta}
              {tiene && <span className="ml-1.5 opacity-70">×</span>}
            </button>
          );
        })}
      </div>

      <label className="sr-only" htmlFor={`nota-personal-${usuarioId}`}>
        Por qué
      </label>
      <input
        id={`nota-personal-${usuarioId}`}
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Por qué (queda guardado junto al nombramiento)"
        maxLength={200}
        className={CAJA}
      />

      {resultado && !resultado.ok && <Aviso>{resultado.mensaje}</Aviso>}
      {resultado?.ok && <Aviso tono="bien">Guardado.</Aviso>}
    </div>
  );
}
