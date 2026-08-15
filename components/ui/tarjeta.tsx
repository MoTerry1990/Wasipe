import { cn } from '@/lib/cn';

/** Superficie blanca con borde. La caja básica de toda la interfaz. */
export function Tarjeta({
  children,
  className,
  interactiva,
  as: Etiqueta = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  /** Añade elevación al pasar el cursor. Solo si la tarjeta entera es un enlace. */
  interactiva?: boolean;
  as?: 'div' | 'article' | 'li' | 'section';
}) {
  return (
    <Etiqueta
      className={cn(
        'rounded-marca border border-linea bg-white',
        interactiva &&
          'transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-marca',
        className,
      )}
    >
      {children}
    </Etiqueta>
  );
}

/** Insignia pequeña: estado del aviso, quién publica, etiquetas. */
export function Insignia({
  children,
  tono = 'neutro',
  className,
}: {
  children: React.ReactNode;
  tono?: 'neutro' | 'verde' | 'fucsia' | 'maiz';
  className?: string;
}) {
  const tonos = {
    neutro: 'bg-niebla text-tinta-60',
    verde: 'bg-turquesa-suave text-turquesa-osc',
    fucsia: 'bg-fucsia-suave text-fucsia-osc',
    maiz: 'bg-[#FFF4E0] text-[#8A6100]',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-bold',
        tonos[tono],
        className,
      )}
    >
      {children}
    </span>
  );
}
