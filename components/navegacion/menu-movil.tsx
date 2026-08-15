'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAVEGACION, ACCIONES } from '@/config/sitio';
import { cn } from '@/lib/cn';

/**
 * Menú de navegación en móvil.
 *
 * Se cierra solo al cambiar de ruta — si no, queda abierto sobre la
 * página nueva. También bloquea el desplazamiento del fondo mientras
 * está abierto y devuelve el foco al botón al cerrarse.
 */
export function MenuMovil() {
  const [abierto, setAbierto] = useState(false);
  const ruta = usePathname();

  // El cierre al navegar se hace en el onClick de los enlaces, no en un
  // efecto sobre `ruta`: reaccionar al cambio de ruta provoca un render
  // en cascada, y además el usuario ya expresó la intención al tocar.

  // Bloquear el fondo y permitir Escape.
  useEffect(() => {
    if (!abierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const salir = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('keydown', salir);
    return () => {
      document.body.style.overflow = previo;
      document.removeEventListener('keydown', salir);
    };
  }, [abierto]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls="menu-movil"
        className="-mr-1 rounded-lg p-2 text-tinta lg:hidden"
      >
        <span className="solo-lectores">{abierto ? 'Cerrar menú' : 'Abrir menú'}</span>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          {abierto ? (
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M4 7h16M4 12h16M4 17h16"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          )}
        </svg>
      </button>

      <div
        id="menu-movil"
        hidden={!abierto}
        className="fixed inset-x-0 top-16 bottom-0 z-50 overflow-y-auto border-t border-linea bg-white lg:hidden"
      >
        <nav
          aria-label="Navegación principal"
          className="flex flex-col gap-1 p-4"
          onClick={() => setAbierto(false)}
        >
          {NAVEGACION.map((item) => {
            const activo = ruta === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={activo ? 'page' : undefined}
                className={cn(
                  'rounded-xl px-4 py-3.5 text-[17px] font-semibold transition-colors',
                  activo ? 'bg-fucsia-suave text-fucsia-osc' : 'text-tinta hover:bg-niebla',
                )}
              >
                {item.texto}
              </Link>
            );
          })}

          <hr className="my-3 border-linea" />

          {ACCIONES.map((accion) => (
            <Link
              key={accion.href}
              href={accion.href}
              className={cn(
                'rounded-xl px-4 py-3.5 text-center text-[17px] font-bold transition-colors',
                accion.tipo === 'primario'
                  ? 'bg-fucsia text-white hover:bg-fucsia-osc'
                  : accion.tipo === 'secundario'
                    ? 'border-[1.5px] border-linea bg-white text-tinta'
                    : 'text-left font-semibold text-tinta hover:bg-niebla',
              )}
            >
              {accion.texto}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
