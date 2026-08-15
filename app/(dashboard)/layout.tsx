import { Encabezado } from '@/components/navegacion/encabezado';
import { perfilOpcional } from '@/lib/auth/sesion';

/**
 * Panel y publicación: encabezado sí, pie no.
 *
 * En un flujo de trabajo el pie solo estorba y ofrece salidas que
 * distraen de terminar la tarea.
 */
export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const perfil = await perfilOpcional();

  return (
    <div className="flex min-h-dvh flex-col">
      <Encabezado cuenta={perfil ? { nombre: perfil.full_name } : undefined} />
      <main id="contenido" className="flex-1 pb-16">
        {children}
      </main>
    </div>
  );
}
