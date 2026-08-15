'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import type { EntradaPanel } from '@/lib/auth/roles';

/**
 * Menú lateral del panel.
 *
 * En escritorio es una columna fija. En móvil se convierte en una tira
 * horizontal desplazable pegada arriba: ocupa poco y evita el patrón de
 * "hamburguesa dentro de hamburguesa", que en un panel se vuelve un
 * laberinto.
 *
 * Las entradas ya vienen filtradas por rol desde el servidor. Esto solo
 * las pinta: cada página vuelve a comprobar el permiso por su cuenta.
 */
export function MenuPanel({ entradas }: { entradas: readonly EntradaPanel[] }) {
  const ruta = usePathname();

  return (
    <nav
      aria-label="Secciones del panel"
      className={cn(
        'border-linea border-b bg-white',
        'lg:sticky lg:top-16 lg:h-[calc(100dvh-4rem)] lg:w-60 lg:shrink-0 lg:border-r lg:border-b-0',
      )}
    >
      <ul
        className={cn(
          'flex gap-1 overflow-x-auto px-3 py-2.5',
          '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          'lg:flex-col lg:gap-0.5 lg:overflow-visible lg:p-3',
        )}
      >
        {entradas.map((entrada) => {
          const activo =
            ruta === entrada.href ||
            (entrada.href !== '/panel' && ruta.startsWith(`${entrada.href}/`));

          return (
            <li key={entrada.href} className="shrink-0">
              <Link
                href={entrada.href}
                aria-current={activo ? 'page' : undefined}
                className={cn(
                  'block rounded-xl px-3.5 py-2.5 text-[15px] font-semibold whitespace-nowrap transition-colors',
                  activo
                    ? 'bg-fucsia-suave text-fucsia-osc'
                    : 'text-tinta-60 hover:bg-niebla hover:text-tinta',
                )}
              >
                {entrada.texto}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
