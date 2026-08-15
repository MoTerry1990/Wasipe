import { Encabezado } from '@/components/navegacion/encabezado';
import { Pie } from '@/components/navegacion/pie';

/** Páginas abiertas: encabezado completo y pie con todos los enlaces. */
export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Encabezado />
      <main id="contenido" className="flex-1">
        {children}
      </main>
      <Pie />
    </div>
  );
}
