import Link from 'next/link';
import { Contenedor } from '@/components/ui/contenedor';
import { Marca } from '@/components/navegacion/marca';
import { PIE } from '@/config/sitio';

export function Pie() {
  const anio = new Date().getFullYear();

  return (
    <footer className="border-t border-linea bg-white pt-9 pb-7 text-sm">
      <Contenedor>
        <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Marca className="mb-2.5" />
            <p className="max-w-[28em] text-[13.5px] text-tinta-60">
              El portal inmobiliario peruano donde ves el precio antes de preguntar.
            </p>
          </div>

          {PIE.map((grupo) => (
            <div key={grupo.titulo}>
              <h2 className="mb-3 font-texto text-xs font-bold tracking-[0.08em] text-tinta-40 uppercase">
                {grupo.titulo}
              </h2>
              <ul className="flex flex-col gap-1">
                {grupo.enlaces.map((enlace) => (
                  <li key={enlace.href}>
                    <Link
                      href={enlace.href}
                      className="block py-1 text-tinta-60 transition-colors hover:text-fucsia"
                    >
                      {enlace.texto}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap justify-between gap-4 border-t border-linea pt-5 text-[13px] text-tinta-40">
          <span>© {anio} Wasipe · Lima, Perú</span>
          {/*
            Términos, Privacidad y Libro de Reclamaciones todavía no tienen
            página. El Libro de Reclamaciones es obligatorio en Perú, así que
            se marca como pendiente en vez de enlazar a un 404 (KNOWN_ISSUES P-05).
          */}
          <span className="flex gap-3">
            <span>Términos</span>
            <span>Privacidad</span>
            <span>Libro de Reclamaciones</span>
          </span>
        </div>
      </Contenedor>
    </footer>
  );
}
