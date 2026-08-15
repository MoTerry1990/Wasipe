import { cn } from '@/lib/cn';

/** Ancho máximo y márgenes laterales. Un solo lugar decide la medida. */
export function Contenedor({
  children,
  className,
  ancho = 'normal',
  as: Etiqueta = 'div',
  // El id sirve para los enlaces de ancla del pie ("Cómo funciona
  // Wasipe" apunta a /#como-funciona).
  id,
}: {
  children: React.ReactNode;
  className?: string;
  ancho?: 'normal' | 'angosto' | 'ancho';
  as?: 'div' | 'section' | 'header' | 'footer' | 'main' | 'nav';
  id?: string;
}) {
  const anchos = {
    angosto: 'max-w-3xl',
    normal: 'max-w-[1200px]',
    ancho: 'max-w-[1400px]',
  };

  return (
    <Etiqueta
      id={id}
      className={cn('mx-auto w-full px-4 sm:px-6 lg:px-10', anchos[ancho], className)}
    >
      {children}
    </Etiqueta>
  );
}
