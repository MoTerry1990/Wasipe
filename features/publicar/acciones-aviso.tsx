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

/**
 * Cómo se le cuenta a quien publicó lo que decidió moderación.
 *
 * La base guarda el motivo en `rejection_reason` para las tres decisiones
 * que no son publicar. El encabezado es lo que separa «no va» de «falta
 * algo», que para quien está del otro lado no es lo mismo.
 */
const ENCABEZADO_DE_MODERACION: Partial<Record<EstadoPublicacion, string>> = {
  rejected: 'Por qué se rechazó',
  draft: 'Qué hay que corregir',
  paused: 'Por qué lo pausamos',
};

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
      {/* Lo que decidió moderación, dicho como para leerlo sin diccionario.
          Un aviso devuelto a borrador con motivo no fue rechazado: hay que
          corregir algo. Decirle «rechazado» a las dos cosas hace que la
          persona baje el aviso en vez de arreglarlo. */}
      {motivoRechazo && (estado === 'rejected' || estado === 'draft' || estado === 'paused') && (
        <Aviso tono={estado === 'rejected' ? 'mal' : 'ojo'}>
          <strong className="block">{ENCABEZADO_DE_MODERACION[estado]}</strong>
          {motivoRechazo}
          {estado !== 'rejected' && (
            <span className="mt-1 block text-[13px]">
              Corrige lo que dice acá y vuelve a mandarlo a revisión.
            </span>
          )}
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
