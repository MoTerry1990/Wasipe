import Link from 'next/link';
import { Contenedor } from '@/components/ui/contenedor';
import { Marca } from '@/components/navegacion/marca';
import { PIE, BUSQUEDAS_POPULARES, LEGALES, EMPRESA } from '@/config/sitio';

export function Pie() {
  const anio = new Date().getFullYear();

  return (
    <footer className="border-linea border-t bg-white pt-10 pb-7 text-sm">
      <Contenedor>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Marca className="mb-2.5" />
            <p className="text-tinta-60 max-w-[30em] text-[13.5px]">
              El portal inmobiliario peruano donde ves el precio antes de preguntar. Publicar es
              gratis, y el precio por m² va siempre a la vista.
            </p>
            <address className="text-tinta-60 mt-3 text-[13.5px] not-italic">
              {EMPRESA.razonSocial} · {EMPRESA.ciudad}
              <br />
              <a href={`mailto:${EMPRESA.correo}`} className="hover:text-fucsia">
                {EMPRESA.correo}
              </a>
            </address>
          </div>

          {PIE.map((grupo) => (
            <nav key={grupo.titulo} aria-labelledby={`pie-${grupo.titulo}`}>
              <h2
                id={`pie-${grupo.titulo}`}
                className="font-texto text-tinta-40 mb-3 text-xs font-bold tracking-[0.08em] uppercase"
              >
                {grupo.titulo}
              </h2>
              <ul className="flex flex-col gap-1">
                {grupo.enlaces.map((enlace) => (
                  <li key={enlace.href + enlace.texto}>
                    <Link
                      href={enlace.href}
                      className="text-tinta-60 hover:text-fucsia block py-1 transition-colors"
                    >
                      {enlace.texto}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/*
          Búsquedas populares.
          Son la puerta de entrada del tráfico de buscadores: en el Perú
          se busca "departamentos en alquiler en Miraflores", no "portal
          inmobiliario". Cada enlace es una búsqueda real y funciona.
        */}
        <nav aria-labelledby="pie-busquedas" className="border-linea mt-9 border-t pt-6">
          <h2
            id="pie-busquedas"
            className="font-texto text-tinta-40 mb-3 text-xs font-bold tracking-[0.08em] uppercase"
          >
            Búsquedas populares
          </h2>
          <ul className="flex flex-wrap gap-2" translate="no">
            {BUSQUEDAS_POPULARES.map((busqueda) => (
              <li key={busqueda.href}>
                <Link
                  href={busqueda.href}
                  className="border-linea text-tinta-60 hover:border-fucsia hover:text-fucsia inline-block rounded-full border px-3 py-1.5 text-[13px] transition-colors"
                >
                  {busqueda.texto}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-linea text-tinta-40 mt-8 flex flex-wrap justify-between gap-x-6 gap-y-3 border-t pt-5 text-[13px]">
          <span>
            © {anio} {EMPRESA.razonSocial} · {EMPRESA.ciudad}
          </span>

          {/*
            Términos, Privacidad y Libro de Reclamaciones todavía no tienen
            página escrita. El Libro de Reclamaciones es obligatorio en el
            Perú, así que se marcan como pendientes en vez de enlazar a un
            404 (KNOWN_ISSUES P-05).
          */}
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {LEGALES.map((legal) => (
              <li key={legal.href}>
                <span title="En preparación">{legal.texto}</span>
              </li>
            ))}
          </ul>
        </div>
      </Contenedor>
    </footer>
  );
}
