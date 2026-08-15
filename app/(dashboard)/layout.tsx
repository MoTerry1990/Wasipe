import { Encabezado } from '@/components/navegacion/encabezado';

/**
 * Panel y publicación: encabezado sí, pie no.
 *
 * En un flujo de trabajo el pie solo estorba y ofrece salidas que
 * distraen de terminar la tarea.
 */
export default function LayoutPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Encabezado />
      <main id="contenido" className="flex-1 pb-16">
        {children}
      </main>
    </div>
  );
}
