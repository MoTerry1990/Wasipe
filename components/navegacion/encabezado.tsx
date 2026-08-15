'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Contenedor } from '@/components/ui/contenedor';
import { Marca } from '@/components/navegacion/marca';
import { MenuMovil } from '@/components/navegacion/menu-movil';
import { NAVEGACION, ACCIONES } from '@/config/sitio';
import { cn } from '@/lib/cn';

export function Encabezado() {
  const ruta = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-linea bg-white">
      <Contenedor className="flex h-16 items-center gap-6">
        <Marca />

        <nav aria-label="Navegación principal" className="ml-2 hidden items-center gap-5 lg:flex">
          {NAVEGACION.map((item) => {
            const activo = ruta === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={activo ? 'page' : undefined}
                className={cn(
                  'border-b-2 py-1.5 text-[15px] font-semibold transition-colors',
                  activo
                    ? 'border-fucsia text-tinta'
                    : 'border-transparent text-tinta-60 hover:border-fucsia hover:text-tinta',
                )}
              >
                {item.texto}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <div className="hidden items-center gap-2.5 lg:flex">
            {ACCIONES.map((accion) => (
              <Link
                key={accion.href}
                href={accion.href}
                className={cn(
                  'rounded-xl px-4 py-2.5 text-[15px] font-bold transition-colors',
                  accion.tipo === 'primario'
                    ? 'bg-fucsia text-white shadow-[0_6px_16px_-6px_rgb(225_29_116_/_0.5)] hover:bg-fucsia-osc'
                    : accion.tipo === 'secundario'
                      ? 'border-[1.5px] border-linea bg-white text-tinta hover:border-tinta-40'
                      : 'text-tinta-60 hover:text-tinta',
                )}
              >
                {accion.texto}
              </Link>
            ))}
          </div>
          <MenuMovil />
        </div>
      </Contenedor>
    </header>
  );
}
