import { cn } from '@/lib/cn';

/** Ancho máximo y márgenes laterales. Un solo lugar decide la medida. */
export function Contenedor({
  children,
  className,
  ancho = 'normal',
  as: Etiqueta = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  ancho?: 'normal' | 'angosto' | 'ancho';
  as?: 'div' | 'section' | 'header' | 'footer' | 'main' | 'nav';
}) {
  const anchos = {
    angosto: 'max-w-3xl',
    normal: 'max-w-[1200px]',
    ancho: 'max-w-[1400px]',
  };

  return (
    <Etiqueta className={cn('mx-auto w-full px-4 sm:px-6 lg:px-10', anchos[ancho], className)}>
      {children}
    </Etiqueta>
  );
}
