import type { Metadata } from 'next';
import { requiereCuentaLista } from '@/lib/auth/sesion';
import { navegacionPanel } from '@/lib/auth/roles';
import { MenuPanel } from '@/components/navegacion/menu-panel';

export const metadata: Metadata = {
  title: { default: 'Panel', template: '%s · Panel · Wasipe' },
  robots: { index: false, follow: false },
};

/**
 * Guardia de todo el panel.
 *
 * `requiereCuentaLista` exige sesión y bienvenida terminada. El
 * middleware ya redirige a quien no tiene sesión, pero esa es una
 * comodidad, no la defensa: una petición directa se salta el middleware
 * y llega igual acá.
 *
 * Además, el menú se arma con el rol que devuelve la base, no con nada
 * que venga del navegador.
 */
export default async function LayoutDelPanel({ children }: { children: React.ReactNode }) {
  const perfil = await requiereCuentaLista();
  const entradas = navegacionPanel(perfil.role);

  return (
    <div className="flex flex-col lg:flex-row">
      <MenuPanel entradas={entradas} />
      <div className="min-w-0 flex-1 px-4 py-7 sm:px-6 lg:px-10">{children}</div>
    </div>
  );
}
