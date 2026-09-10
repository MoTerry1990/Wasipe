import type { Metadata } from 'next';
import { requiereCuentaLista } from '@/lib/auth/sesion';
import { navegacionPanel } from '@/lib/auth/roles';
import { puestosDeLaSesion } from '@/lib/auth/personal';
import {
  correspondeVerProyectos,
  ENTRADA_DE_PROYECTOS,
  membresiaActual,
} from '@/lib/proyectos/permisos';
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
  const membresia = await membresiaActual('/panel');

  // «Administración» solo aparece para quien tiene un puesto en Wasipe, y
  // ese puesto vive en su propia tabla, no en el rol de la cuenta: quien
  // modera sigue pudiendo publicar su propio departamento.
  //
  // «Proyectos» sigue la misma idea, y por el mismo motivo: pertenecer a
  // una inmobiliaria es un hecho de `agency_members`, no del tipo de
  // cuenta. Alguien con cuenta de `buyer` puede administrar una
  // constructora; un `owner` puede no pertenecer a ninguna. Filtrarla por
  // `profiles.role` le escondía el enlace a quien sí podía usarlo y se lo
  // mostraba a quien terminaba en un callejón.
  //
  // Esto es solo el menú. La autorización de verdad la hacen las acciones
  // de servidor y la RLS, cada una por su cuenta.
  const entradas = [
    ...navegacionPanel(perfil.role),
    ...(correspondeVerProyectos(membresia) ? [ENTRADA_DE_PROYECTOS] : []),
    ...(puestos.length > 0 ? [{ href: '/panel/admin', texto: 'Administración' } as const] : []),
  ];

  return (
    <div className="flex flex-col lg:flex-row">
      <MenuPanel entradas={entradas} />
      <div className="min-w-0 flex-1 px-4 py-7 sm:px-6 lg:px-10">{children}</div>
    </div>
  );
}
