'use client';

import { Boton } from '@/components/ui/boton';

/**
 * Estado de error.
 *
 * El mensaje que llega del backend ya viene redactado en español y listo
 * para mostrarse, así que se usa tal cual. Solo cuando no hay mensaje se
 * cae a un texto genérico.
 */
export function EstadoError({
  titulo = 'Algo salió mal',
  mensaje,
  reintentar,
}: {
  titulo?: string;
  mensaje?: string;
  reintentar?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center rounded-marca border border-linea bg-white px-6 py-14 text-center"
    >
      <div className="mb-4 grid size-12 place-items-center rounded-full bg-fucsia-suave text-fucsia">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 8v5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="12" cy="16.5" r="1.2" fill="currentColor" />
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" />
        </svg>
      </div>
      <h3 className="text-xl">{titulo}</h3>
      <p className="mt-2 max-w-[44ch] text-tinta-60">
        {mensaje ?? 'No pudimos cargar esta parte. Vuelve a intentarlo en un momento.'}
      </p>
      {reintentar && (
        <Boton onClick={reintentar} variante="secundario" className="mt-6">
          Reintentar
        </Boton>
      )}
    </div>
  );
}

/** Aviso en línea, para errores dentro de un formulario. */
export function Aviso({
  tono = 'mal',
  children,
}: {
  tono?: 'mal' | 'bien';
  children: React.ReactNode;
}) {
  return (
    <div
      role={tono === 'mal' ? 'alert' : 'status'}
      className={
        tono === 'mal'
          ? 'rounded-xl bg-fucsia-suave px-3.5 py-3 text-sm text-fucsia-osc'
          : 'rounded-xl bg-turquesa-suave px-3.5 py-3 text-sm text-turquesa-osc'
      }
    >
      {children}
    </div>
  );
}
