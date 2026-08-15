import Link from 'next/link';
import { cn } from '@/lib/cn';

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro';
type Tamano = 'sm' | 'md' | 'lg';

const VARIANTES: Record<Variante, string> = {
  primario:
    'bg-fucsia text-white shadow-[0_6px_16px_-6px_rgb(225_29_116_/_0.5)] hover:bg-fucsia-osc',
  secundario: 'bg-white text-tinta border-[1.5px] border-linea hover:border-tinta-40',
  fantasma: 'bg-transparent text-tinta-60 hover:bg-niebla hover:text-tinta',
  peligro: 'bg-fucsia-suave text-fucsia-osc hover:bg-fucsia hover:text-white',
};

const TAMANOS: Record<Tamano, string> = {
  sm: 'px-3.5 py-2 text-sm',
  md: 'px-5 py-2.5 text-[15px]',
  lg: 'px-6 py-3.5 text-base',
};

const BASE = [
  'inline-flex items-center justify-center gap-2 rounded-xl font-bold',
  'transition-[background-color,border-color,transform] duration-150',
  'hover:-translate-y-px active:translate-y-0',
  'disabled:pointer-events-none disabled:opacity-55',
  // El foco tiene que verse: es lo único que guía a quien usa teclado.
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-fucsia',
].join(' ');

type Comunes = {
  children: React.ReactNode;
  variante?: Variante;
  tamano?: Tamano;
  className?: string;
  full?: boolean;
};

/**
 * Botón. Si recibe `href` se renderiza como enlace de Next, si no como
 * `<button>` — así un enlace nunca queda como botón inaccesible.
 */
export function Boton({
  children,
  variante = 'primario',
  tamano = 'md',
  className,
  full,
  ...resto
}: Comunes &
  (
    | ({ href: string } & Omit<React.ComponentProps<typeof Link>, 'href' | 'className'>)
    | ({ href?: undefined } & Omit<React.ComponentProps<'button'>, 'className'>)
  )) {
  const clases = cn(BASE, VARIANTES[variante], TAMANOS[tamano], full && 'w-full', className);

  if (typeof resto.href === 'string') {
    const { href, ...enlace } = resto;
    return (
      <Link href={href} className={clases} {...enlace}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={clases} {...(resto as React.ComponentProps<'button'>)}>
      {children}
    </button>
  );
}
