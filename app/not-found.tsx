import type { Metadata } from 'next';
import Link from 'next/link';
import { Encabezado } from '@/components/navegacion/encabezado';
import { Pie } from '@/components/navegacion/pie';
import { Contenedor } from '@/components/ui/contenedor';
import { EstadoVacio } from '@/components/estados/estado-vacio';
import { BUSQUEDAS_POPULARES } from '@/config/sitio';

export const metadata: Metadata = {
  title: 'Página no encontrada',
  robots: { index: false, follow: true },
};

/**
 * El 404.
 *
 * Next devuelve el estado 404 de verdad, que es la mitad del trabajo: una
 * página de «no existe» que responde 200 le enseña a Google que el sitio
 * tiene miles de páginas idénticas, y es de los errores más caros que
 * puede tener un portal.
 *
 * La otra mitad es no dejar a nadie parado. En un portal inmobiliario el
 * 404 más común es un aviso que se vendió, y quien llega ahí sigue
 * buscando departamento: por eso abajo van búsquedas de verdad y no un
 * botón de «volver al inicio» a secas.
 */
export default function NoEncontrado() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Encabezado />
      <main id="contenido" className="flex-1">
        <Contenedor className="py-16">
          <EstadoVacio
            titulo="Esta página no existe"
            descripcion="Puede que el enlace esté mal escrito, o que la propiedad ya se haya vendido o alquilado."
            accion={{ texto: 'Ir al inicio', href: '/' }}
          />

          <section aria-labelledby="mientras-tanto" className="mx-auto mt-10 max-w-2xl">
            <h2 id="mientras-tanto" className="text-center text-lg">
              Mientras tanto, las búsquedas más usadas
            </h2>
            <ul className="mt-4 flex flex-wrap justify-center gap-2">
              {BUSQUEDAS_POPULARES.map((busqueda) => (
                <li key={busqueda.href}>
                  <Link
                    href={busqueda.href}
                    className="border-linea text-tinta-70 hover:border-fucsia hover:text-fucsia inline-block rounded-xl border bg-white px-3.5 py-2 text-[13.5px] font-semibold transition-colors"
                  >
                    {busqueda.texto}
                  </Link>
                </li>
              ))}
            </ul>

            <p className="text-tinta-60 mt-6 text-center text-sm">
              O mira{' '}
              <Link href="/busquedas" className="text-fucsia font-bold hover:underline">
                todas las búsquedas
              </Link>
              , distrito por distrito.
            </p>
          </section>
        </Contenedor>
      </main>
      <Pie />
    </div>
  );
}
