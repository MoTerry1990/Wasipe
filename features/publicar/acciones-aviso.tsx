'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Aviso } from '@/components/estados/estado-error';
import {
  pausarAviso,
  reanudarAviso,
  archivarAviso,
  reenviarARevision,
  editarAviso,
} from '@/features/publicar/acciones';
import type { EstadoPublicacion } from '@/types/base-datos';
import type { Estado } from '@/features/cuentas/acciones';

/**
 * Qué puede hacer quien publica con cada aviso, según su estado.
 *
 * La lista de acciones sale del estado y no de un menú fijo: ofrecer
 * "reanudar" sobre un aviso que nunca se aprobó, y que la base va a
 * rechazar, es prometer algo que no va a pasar.
 */

const BOTON =
  'rounded-xl border-[1.5px] border-linea bg-white px-3.5 py-2 text-[13.5px] font-bold text-tinta-60 transition-colors hover:border-tinta-40 hover:text-tinta disabled:opacity-50';

export function AccionesDelAviso({
  avisoId,
  estado,
  motivoRechazo,
}: {
  avisoId: string;
  estado: EstadoPublicacion;
  motivoRechazo: string | null;
}) {
  const [resultado, setResultado] = useState<Estado>({});
  const [enCurso, empezar] = useTransition();

  const correr = (accion: () => Promise<Estado>) => () => {
    empezar(async () => setResultado(await accion()));
  };

  return (
    <div className="mt-3 flex flex-col gap-2">
      {estado === 'rejected' && motivoRechazo && (
        <Aviso tono="mal">
          <strong className="block">Por qué se rechazó</strong>
          {motivoRechazo}
        </Aviso>
      )}

      {estado === 'in_review' && (
        <p className="text-tinta-60 text-[13.5px]">
          En revisión. Lo mira una persona del equipo; suele tomar unas horas.
        </p>
      )}

      {resultado.mensaje && (
        <Aviso tono={resultado.ok ? 'bien' : 'mal'}>{resultado.mensaje}</Aviso>
      )}

      <div className="flex flex-wrap gap-2">
        {/* Editar está siempre: hasta un aviso archivado se puede corregir
            antes de volver a mandarlo. */}
        <button
          type="button"
          disabled={enCurso}
          onClick={() => empezar(() => editarAviso(avisoId))}
          className={BOTON}
        >
          Editar
        </button>

        {estado === 'published' && (
          <>
            <button
              type="button"
              disabled={enCurso}
              onClick={correr(() => pausarAviso(avisoId))}
              className={BOTON}
            >
              Pausar
            </button>
            <Link href={`/panel/mis-propiedades`} className={BOTON}>
              Ver en el portal
            </Link>
          </>
        )}

        {estado === 'paused' && (
          <button
            type="button"
            disabled={enCurso}
            onClick={correr(() => reanudarAviso(avisoId))}
            className={BOTON}
          >
            Reanudar
          </button>
        )}

        {(estado === 'rejected' || estado === 'archived' || estado === 'expired') && (
          <button
            type="button"
            disabled={enCurso}
            onClick={correr(() => reenviarARevision(avisoId))}
            className={BOTON}
          >
            Enviar a revisión
          </button>
        )}

        {estado !== 'archived' && (
          <button
            type="button"
            disabled={enCurso}
            onClick={correr(() => archivarAviso(avisoId))}
            className={`${BOTON} ml-auto`}
          >
            Archivar
          </button>
        )}
      </div>

      {estado !== 'archived' && (
        <p className="text-tinta-45 text-[12.5px]">
          Archivar no borra nada: el aviso deja de aparecer pero conserva su historial y sus
          consultas.
        </p>
      )}
    </div>
  );
}
