import Link from 'next/link';
import { Marca } from '@/components/navegacion/marca';

/**
 * Ingresar y registrarse: sin menú.
 *
 * Quitar la navegación en estas pantallas reduce el abandono — no hay
 * a dónde irse a mitad del formulario.
 */
export default function LayoutAuth({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-niebla flex min-h-dvh flex-col">
      <header className="border-linea border-b bg-white">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center px-4 sm:px-6 lg:px-10">
          <Marca />
        </div>
      </header>
      <main id="contenido" className="flex flex-1 items-center justify-center px-4 py-10">
        {children}
      </main>
      <footer className="text-tinta-40 py-6 text-center text-[13px]">
        <Link href="/" className="hover:text-fucsia">
          Volver al inicio
        </Link>
      </footer>
    </div>
  );
}
