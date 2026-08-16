import type { Metadata } from 'next';
import Link from 'next/link';
import { Contenedor } from '@/components/ui/contenedor';
import { Migas } from '@/components/ui/migas';
import { landingsPorDistrito, landingsDeBusqueda, landingsDePrecio } from '@/lib/seo/landings';

export const metadata: Metadata = {
  title: 'Todas las búsquedas',
  description:
    'El mapa completo de Wasipe: departamentos, casas, terrenos y oficinas en venta y en alquiler, distrito por distrito, más el precio por m² de cada uno.',
  alternates: { canonical: '/busquedas' },
};

/**
 * El índice de búsquedas.
 *
 * Existe por dos razones y las dos importan igual.
 *
 * Para quien entra: es el mapa del portal. Alguien que no sabe qué
 * filtrar ve de un golpe qué hay y en qué distritos, que es más útil que
 * una caja de búsqueda vacía.
 *
 * Para los buscadores: una dirección que solo aparece en el sitemap y en
 * ningún enlace interno vale poco. El sitemap dice «esta página existe»;
 * un enlace desde una página real dice «esta página importa». Sin esta
 * hoja, las trescientas landings serían huérfanas.
 *
 * Ninguno de los enlaces precarga (`prefetch={false}`). Son varios
 * cientos, y Next pide por adelantado el contenido de cada uno que entra
 * en pantalla: en la medición eran 102 peticiones para ver una lista de
 * enlaces. Precargar tiene sentido cuando hay tres destinos probables,
 * no trescientos.
 *
 * Es una página estática: no consulta la base. El corte por cantidad de
 * avisos lo aplica cada landing cuando se sirve, y el sitemap por su
 * cuenta. Acá se enlazan todas —una landing sin avisos hoy los tiene
 * mañana, y un enlace interno hacia ella no le hace daño a nadie.
 */
export default function Busquedas() {
  const porDistrito = landingsPorDistrito();
  const generales = landingsDeBusqueda().filter((l) => !l.distrito);
  const precios = landingsDePrecio();

  return (
    <Contenedor className="py-8">
      <Migas pasos={[{ texto: 'Inicio', href: '/' }, { texto: 'Todas las búsquedas' }]} />

      <h1 className="mt-4 text-[clamp(1.6rem,3.6vw,2.25rem)]">Todas las búsquedas</h1>
      <p className="text-tinta-60 mt-2 max-w-2xl">
        El mapa completo de Wasipe. Cada enlace lleva a un listado con el precio por m² a la
        vista en cada aviso.
      </p>

      <section aria-labelledby="por-tipo" className="mt-9">
        <h2 id="por-tipo" className="text-xl">
          Por tipo de inmueble
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {generales.map((landing) => (
            <li key={landing.href}>
              <Link
                href={landing.href}
                prefetch={false}
                className="border-linea text-tinta-70 hover:border-fucsia hover:text-fucsia inline-block rounded-xl border bg-white px-3.5 py-2 text-[14px] font-semibold transition-colors"
              >
                {landing.texto}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="por-distrito" className="mt-10">
        <h2 id="por-distrito" className="text-xl">
          Por distrito
        </h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {porDistrito.map((grupo) => (
            <div key={grupo.distrito} className="border-linea rounded-2xl border bg-white p-4">
              <h3 className="text-[15.5px] font-bold">
                {grupo.distrito}
                <span className="text-tinta-45 ml-1.5 text-[13px] font-normal">
                  {grupo.provincia}
                </span>
              </h3>
              <ul className="mt-2 flex flex-col gap-1">
                {grupo.enlaces.map((landing) => (
                  <li key={landing.href}>
                    <Link
                      href={landing.href}
                      prefetch={false}
                      className="text-tinta-60 hover:text-fucsia text-[13.5px]"
                    >
                      {landing.texto}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="por-precio" className="mt-10">
        <h2 id="por-precio" className="text-xl">
          Precio por m² por distrito
        </h2>
        <p className="text-tinta-60 mt-1.5 text-[14.5px]">
          Cuánto cuesta el metro cuadrado en cada zona, con la muestra a la vista para que se
          pueda juzgar la cifra.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {precios.map((precio) => (
            <li key={precio.href}>
              <Link
                href={precio.href}
                prefetch={false}
                className="border-linea text-tinta-70 hover:border-fucsia hover:text-fucsia inline-block rounded-xl border bg-white px-3 py-1.5 text-[13.5px] transition-colors"
              >
                {precio.distrito}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </Contenedor>
  );
}
