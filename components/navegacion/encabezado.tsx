'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Contenedor } from '@/components/ui/contenedor';
import { Marca } from '@/components/navegacion/marca';
import { MenuMovil } from '@/components/navegacion/menu-movil';
import { NAVEGACION, ACCIONES } from '@/config/sitio';
import { cn } from '@/lib/cn';

/**
 * Encabezado.
 *
 * `cuenta` llega desde el servidor cuando hay sesión. Las páginas
 * públicas no lo pasan a propósito: pedirlo obligaría a leer las cookies
 * en cada una y dejarían de poder prerenderizarse.
 */
export function Encabezado({ cuenta }: { cuenta?: { nombre: string } }) {
  const ruta = usePathname();

  return (
    <header className="border-linea sticky top-0 z-40 border-b bg-white">
      <Contenedor className="flex h-16 items-center gap-6">
        <Marca />

        <nav
          aria-label="Navegación principal"
          className="ml-2 hidden items-center gap-5 lg:flex"
        >
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
                    : 'text-tinta-60 hover:border-fucsia hover:text-tinta border-transparent',
                )}
              >
                {item.texto}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <div className="hidden items-center gap-2.5 lg:flex">
            {cuenta ? (
              <>
                <span className="text-tinta-60 text-[15px]">{cuenta.nombre}</span>
                <Link
                  href="/panel"
                  className="bg-fucsia hover:bg-fucsia-osc rounded-xl px-4 py-2.5 text-[15px] font-bold text-white shadow-[0_6px_16px_-6px_rgb(225_29_116_/_0.5)] transition-colors"
                >
                  Mi panel
                </Link>
              </>
            ) : (
              ACCIONES.map((accion) => (
                <Link
                  key={accion.href}
                  href={accion.href}
                  className={cn(
                    'rounded-xl px-4 py-2.5 text-[15px] font-bold transition-colors',
                    accion.tipo === 'primario'
                      ? 'bg-fucsia hover:bg-fucsia-osc text-white shadow-[0_6px_16px_-6px_rgb(225_29_116_/_0.5)]'
                      : accion.tipo === 'secundario'
                        ? 'border-linea text-tinta hover:border-tinta-40 border-[1.5px] bg-white'
                        : 'text-tinta-60 hover:text-tinta',
                  )}
                >
                  {accion.texto}
                </Link>
              ))
            )}
          </div>
          <MenuMovil />
        </div>
      </Contenedor>
    </header>
  );
}
