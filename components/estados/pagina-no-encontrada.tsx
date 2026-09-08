import Link from 'next/link';
import { Contenedor } from '@/components/ui/contenedor';
import { Boton } from '@/components/ui/boton';
import { BUSQUEDAS_POPULARES } from '@/config/sitio';

/**
 * El contenido del 404, sin encabezado ni pie.
 *
 * Va aparte justamente porque el cromo NO le pertenece. Cuando el 404 se
 * dibuja dentro de un grupo de rutas, la plantilla del grupo ya puso el
 * encabezado, el `<main>` y el pie; si esta pantalla los trajera también,
 * saldrían dos de cada uno. Eso pasaba: ver P-34.
 *
 * Quien lo use decide el envoltorio. `app/not-found.tsx` —el de raíz, que
 * cuelga de una plantilla sin cromo— pone el suyo; los de cada grupo no
 * ponen ninguno.
 */
export function ContenidoNoEncontrado() {
  return (
    <Contenedor className="py-16">
      {/* El encabezado va acá y no dentro de `EstadoVacio`, que usa `h3`
          porque casi siempre vive debajo del título de una página. Acá el
          título de la página ES este, y una pantalla sin `h1` deja a quien
          navega por encabezados sin saber dónde cayó. */}
      <h1 className="text-center text-[clamp(1.6rem,4vw,2.25rem)]">Esta página no existe</h1>
      <p className="text-tinta-60 mx-auto mt-3 max-w-[46ch] text-center">
        Puede que el enlace esté mal escrito, o que la propiedad ya se haya vendido o alquilado.
      </p>

      <div className="mt-7 flex justify-center">
        <Boton href="/">Ir al inicio</Boton>
      </div>

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
  );
}

/** Lo mismo que arriba, para las plantillas que ya traen cromo propio. */
export const METADATA_NO_ENCONTRADA = {
  title: 'Página no encontrada',
  robots: { index: false, follow: true },
} as const;
