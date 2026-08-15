import Link from 'next/link';
import { Encabezado } from '@/components/navegacion/encabezado';
import { Pie } from '@/components/navegacion/pie';
import { Contenedor } from '@/components/ui/contenedor';
import { EstadoVacio } from '@/components/estados/estado-vacio';

export default function NoEncontrado() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Encabezado />
      <main id="contenido" className="flex-1">
        <Contenedor className="py-16">
          <EstadoVacio
            titulo="Esta página no existe"
            descripcion="Puede que el enlace esté mal escrito o que la propiedad ya no esté publicada."
            accion={{ texto: 'Ir al inicio', href: '/' }}
          />
          <p className="text-tinta-60 mt-6 text-center text-sm">
            También puedes{' '}
            <Link href="/comprar" className="text-fucsia font-bold hover:underline">
              buscar propiedades
            </Link>
            .
          </p>
        </Contenedor>
      </main>
      <Pie />
    </div>
  );
}
