'use client';

import { useId } from 'react';
import { cn } from '@/lib/cn';

const CONTROL = [
  'w-full rounded-xl border-[1.5px] border-linea bg-niebla px-3.5 py-3',
  'text-base text-tinta placeholder:text-tinta-40',
  'transition-colors focus:border-fucsia focus:bg-white focus:outline-none',
  'aria-[invalid=true]:border-fucsia aria-[invalid=true]:bg-fucsia-suave',
  'disabled:opacity-60',
].join(' ');

type Base = {
  etiqueta: string;
  pista?: string;
  error?: string;
  className?: string;
};

/**
 * Campo de texto con etiqueta, pista y error.
 *
 * La etiqueta va siempre unida al control por `htmlFor`/`id`, y el error
 * se anuncia por `aria-describedby` para que un lector de pantalla lo lea
 * al enfocar, no solo al mirarlo.
 */
export function Campo({
  etiqueta,
  pista,
  error,
  className,
  ...input
}: Base & Omit<React.ComponentProps<'input'>, 'className'>) {
  const id = useId();
  const idPista = `${id}-pista`;
  const idError = `${id}-error`;

  return (
    <div className={cn('block', className)}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-tinta">
        {etiqueta}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(pista && idPista, error && idError) || undefined}
        className={CONTROL}
        {...input}
      />
      {pista && !error && (
        <p id={idPista} className="mt-1.5 text-xs text-tinta-40">
          {pista}
        </p>
      )}
      {error && (
        <p id={idError} role="alert" className="mt-1.5 text-xs font-semibold text-fucsia">
          {error}
        </p>
      )}
    </div>
  );
}

/** Selector con las mismas garantías de accesibilidad que `Campo`. */
export function Selector({
  etiqueta,
  pista,
  error,
  className,
  children,
  ...select
}: Base & { children: React.ReactNode } & Omit<React.ComponentProps<'select'>, 'className'>) {
  const id = useId();
  const idError = `${id}-error`;

  return (
    <div className={cn('block', className)}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-tinta">
        {etiqueta}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? idError : undefined}
        className={cn(CONTROL, 'font-semibold')}
        {...select}
      >
        {children}
      </select>
      {pista && !error && <p className="mt-1.5 text-xs text-tinta-40">{pista}</p>}
      {error && (
        <p id={idError} role="alert" className="mt-1.5 text-xs font-semibold text-fucsia">
          {error}
        </p>
      )}
    </div>
  );
}
