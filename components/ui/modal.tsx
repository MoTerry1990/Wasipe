'use client';

import { useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/cn';

/**
 * Ventana modal sobre `<dialog>` nativo.
 *
 * Se usa el elemento nativo a propósito: el navegador ya resuelve el foco
 * atrapado dentro del diálogo, el cierre con Escape y la capa superior.
 * Reimplementar eso a mano es donde se rompe la accesibilidad.
 */
export function Modal({
  abierto,
  alCerrar,
  titulo,
  children,
  pie,
}: {
  abierto: boolean;
  alCerrar: () => void;
  titulo: string;
  children: React.ReactNode;
  pie?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  // Identificador único por instancia. Con uno fijo, dos modales montados
  // a la vez dejan dos elementos con el mismo id y el lector de pantalla
  // anuncia el título del otro.
  const idTitulo = useId();

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (abierto && !dialogo.open) dialogo.showModal();
    if (!abierto && dialogo.open) dialogo.close();
  }, [abierto]);

  // Escape dispara `cancel`: hay que avisar al padre para que no se
  // desincronice el estado.
  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    const cancelar = (e: Event) => {
      e.preventDefault();
      alCerrar();
    };
    dialogo.addEventListener('cancel', cancelar);
    return () => dialogo.removeEventListener('cancel', cancelar);
  }, [alCerrar]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={idTitulo}
      className={cn(
        'rounded-marca border-linea w-[min(32rem,calc(100vw-2rem))] border bg-white p-0',
        'text-tinta backdrop:bg-tinta/50 backdrop:backdrop-blur-[2px]',
      )}
      onClick={(e) => {
        // Clic fuera del contenido cierra. El contenido detiene la burbuja.
        if (e.target === ref.current) alCerrar();
      }}
    >
      <div className="border-linea flex items-start justify-between gap-4 border-b p-5">
        <h2 id={idTitulo} className="text-xl">
          {titulo}
        </h2>
        <button
          type="button"
          onClick={alCerrar}
          className="text-tinta-40 hover:bg-niebla hover:text-tinta -m-1 rounded-lg p-1 transition-colors"
        >
          <span className="solo-lectores">Cerrar</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="p-5">{children}</div>

      {pie && <div className="border-linea flex justify-end gap-2.5 border-t p-5">{pie}</div>}
    </dialog>
  );
}
