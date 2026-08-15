'use client';

import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/cn';
import { cambiarMoneda } from '@/features/preferencias/acciones';
import type { Moneda } from '@/types/base-datos';

const OPCIONES: { valor: Moneda; texto: string; descripcion: string }[] = [
  { valor: 'USD', texto: 'US$', descripcion: 'Ver los precios en dólares' },
  { valor: 'PEN', texto: 'S/', descripcion: 'Ver los precios en soles' },
];

function Opcion({ opcion, activa }: { opcion: (typeof OPCIONES)[number]; activa: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name="moneda"
      value={opcion.valor}
      aria-pressed={activa}
      disabled={pending}
      title={opcion.descripcion}
      className={cn(
        'cifra rounded-lg px-3 py-1.5 text-[14px] font-bold transition-colors',
        activa ? 'text-tinta bg-white shadow-sm' : 'text-tinta-60 hover:text-tinta',
        pending && 'opacity-60',
      )}
    >
      {opcion.texto}
      <span className="solo-lectores"> · {opcion.descripcion}</span>
    </button>
  );
}

/**
 * Elegir en qué moneda se ven los precios.
 *
 * Funciona sin JavaScript: es un formulario con dos botones de envío.
 * En el Perú se publica en soles y en dólares mezclados, y hacer la
 * cuenta de cabeza en cada aviso es justo lo que cansa al comparar.
 */
export function SelectorMoneda({ actual, className }: { actual: Moneda; className?: string }) {
  return (
    <form
      action={cambiarMoneda}
      className={cn(
        'bg-niebla ring-linea inline-flex gap-0.5 rounded-xl p-1 ring-1',
        className,
      )}
    >
      <span className="solo-lectores">Moneda en la que se muestran los precios</span>
      {OPCIONES.map((opcion) => (
        <Opcion key={opcion.valor} opcion={opcion} activa={opcion.valor === actual} />
      ))}
    </form>
  );
}
