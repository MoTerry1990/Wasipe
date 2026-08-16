'use client';

import { useState, useTransition } from 'react';
import { Aviso } from '@/components/estados/estado-error';
import { revisarAviso } from '@/features/admin/acciones';
import {
  DECISIONES,
  DECISIONES_VALIDAS,
  MOTIVO_MINIMO,
  motivoValido,
  type Decision,
} from '@/lib/admin/permisos';
import { cn } from '@/lib/cn';

/**
 * Decidir sobre un aviso.
 *
 * El motivo se escribe ANTES de elegir qué hacer, y el botón de cada
 * decisión queda deshabilitado hasta que alcanza. No es burocracia: ese
 * texto es lo único que la persona que publicó va a leer para saber qué
 * corregir, y es lo que Wasipe va a tener para defender la decisión si
 * reclama.
 */
export function DecisionDeModeracion({
  propiedadId,
  onListo,
}: {
  propiedadId: string;
  onListo?: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje?: string } | null>(null);
  const [enviando, empezar] = useTransition();

  function decidir(decision: Decision) {
    empezar(async () => {
      const salida = await revisarAviso(propiedadId, decision, motivo);
      setResultado(salida);
      if (salida.ok) {
        setMotivo('');
        onListo?.();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label
          htmlFor={`motivo-${propiedadId}`}
          className="text-tinta mb-1.5 block text-[13.5px] font-bold"
        >
          Qué le vas a decir a quien publicó
        </label>
        <textarea
          id={`motivo-${propiedadId}`}
          rows={2}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={600}
          placeholder="Las fotos 2 y 3 son de otro departamento. Cámbialas y vuelve a enviarlo."
          className="border-linea bg-niebla text-tinta focus:border-fucsia w-full rounded-xl border-[1.5px] px-3 py-2 text-[14px] focus:bg-white focus:outline-none"
        />
        <p className="text-tinta-45 mt-1 text-[12px]">
          Publicar no necesita motivo. Rechazar, pedir cambios o pausar sí: al menos{' '}
          {MOTIVO_MINIMO} caracteres.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {DECISIONES_VALIDAS.map((decision) => {
          const config = DECISIONES[decision];
          const habilitada = !enviando && motivoValido(decision, motivo);

          return (
            <button
              key={decision}
              type="button"
              disabled={!habilitada}
              onClick={() => decidir(decision)}
              title={config.explicacion}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-[13.5px] font-bold',
                decision === 'approve'
                  ? 'bg-turquesa text-white'
                  : decision === 'reject'
                    ? 'bg-fucsia-suave text-fucsia-osc'
                    : 'border-linea text-tinta-70 border-[1.5px] bg-white',
                'disabled:cursor-not-allowed disabled:opacity-40',
              )}
            >
              {config.etiqueta}
            </button>
          );
        })}
      </div>

      {resultado && !resultado.ok && <Aviso>{resultado.mensaje}</Aviso>}
      {resultado?.ok && <Aviso tono="bien">Listo. Queda registrado con tu nombre.</Aviso>}
    </div>
  );
}
