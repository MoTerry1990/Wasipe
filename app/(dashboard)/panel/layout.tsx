import type { Metadata } from 'next';
import { requiereCuentaLista } from '@/lib/auth/sesion';
import { navegacionPanel } from '@/lib/auth/roles';
import { puestosDeLaSesion } from '@/lib/auth/personal';
import { MenuPanel } from '@/components/navegacion/menu-panel';

/**
 * La salida depende de la sesión, así que nunca se prerenderiza.
 *
 * Sin esto, cuando no hay Supabase configurado Next ve una redirección
 * fija y la deja estática: al conectar la base seguiría sirviendo esa
 * redirección desde la caché.
 */
export const dynamic = 'force-dynamic';

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
  const puestos = await puestosDeLaSesion();

  // «Administración» solo aparece para quien tiene un puesto en Wasipe, y
  // ese puesto vive en su propia tabla, no en el rol de la cuenta: quien
  // modera sigue pudiendo publicar su propio departamento.
  const entradas = [
    ...navegacionPanel(perfil.role),
    ...(puestos.length > 0 ? [{ href: '/panel/admin', texto: 'Administración' } as const] : []),
  ];

  return (
    <div className="flex flex-col lg:flex-row">
      <MenuPanel entradas={entradas} />
      <div className="min-w-0 flex-1 px-4 py-7 sm:px-6 lg:px-10">{children}</div>
    </div>
  );
}
