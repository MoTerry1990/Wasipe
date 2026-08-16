import { Suspense } from 'react';
import Link from 'next/link';
import { Contenedor } from '@/components/ui/contenedor';
import { Esqueleto } from '@/components/ui/esqueleto';
import { EstadoVacio } from '@/components/estados/estado-vacio';
import { PanelFiltros } from '@/features/busqueda/panel-filtros';
import { VistaResultados } from '@/features/busqueda/vista-resultados';
import { SelectorMoneda } from '@/features/preferencias/selector-moneda';
import { buscar, sugerencias } from '@/lib/consultas/buscar';
import { tipoDeCambio } from '@/lib/consultas/portada';
import { monedaPreferida } from '@/lib/preferencias';
import {
  leerFiltros,
  urlDeFiltros,
  urlSinFiltros,
  hayFiltros,
  tituloDeBusqueda,
  cantidadDeFiltros,
  POR_PAGINA,
  type Filtros,
} from '@/lib/busqueda/filtros';
import { BuscadorConversacional } from '@/features/busqueda/buscador-conversacional';
import { TIPO_INMUEBLE_PLURAL } from '@/lib/etiquetas';
import { numero } from '@/lib/formato';
import type { Moneda, Operacion } from '@/types/base-datos';

/**
 * Página de búsqueda.
 *
 * La misma para comprar, alquilar y proyectos: lo único que cambia es la
 * operación, que viene de la ruta. Tener tres copias de esta pantalla
 * garantizaría que dos se queden atrás.
 *
 * El encabezado y los filtros se dibujan de inmediato; los resultados van
 * dentro de un Suspense y llegan cuando la base responde. El esqueleto
 * está acá adentro y no en un `loading.tsx` a propósito: con loading.tsx,
 * Next empieza a transmitir la respuesta antes de correr el componente, y
 * para cuando una ruta inválida llama a notFound() ya se envió un 200.
 */

export type ParametrosDeBusqueda = Record<string, string | string[] | undefined>;

/** Esqueleto de la lista, del mismo alto que las tarjetas reales. */
export function ResultadosCargando() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="border-linea overflow-hidden rounded-2xl border bg-white">
          <Esqueleto className="aspect-[4/3] w-full rounded-none" />
          <div className="flex flex-col gap-2 p-4">
            <Esqueleto className="h-6 w-32" />
            <Esqueleto className="h-4 w-24" />
            <Esqueleto className="h-4 w-full" />
            <Esqueleto className="h-4 w-3/4" />
          </div>
        </div>
      ))}
      <span className="solo-lectores">Buscando propiedades…</span>
    </div>
  );
}

/** Paginación con enlaces de verdad: se pueden abrir en otra pestaña. */
function Paginacion({
  filtros,
  pagina,
  paginas,
}: {
  filtros: Filtros;
  pagina: number;
  paginas: number;
}) {
  if (paginas <= 1) return null;

  // Una ventana alrededor de la página actual. Con 200 páginas, pintarlas
  // todas es inútil y además pesa.
  const desde = Math.max(1, pagina - 2);
  const hasta = Math.min(paginas, desde + 4);
  const numeros = Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);

  const enlace = (n: number, texto: string, activo = false) => (
    <li key={texto}>
      <Link
        href={urlDeFiltros(filtros, { pagina: n })}
        aria-current={activo ? 'page' : undefined}
        className={
          activo
            ? 'bg-fucsia cifra grid size-10 place-items-center rounded-xl font-bold text-white'
            : 'border-linea text-tinta-60 hover:border-fucsia hover:text-fucsia cifra grid size-10 place-items-center rounded-xl border bg-white font-bold transition-colors'
        }
      >
        {texto}
      </Link>
    </li>
  );

  return (
    <nav aria-label="Páginas de resultados" className="mt-8">
      <ul className="flex flex-wrap items-center justify-center gap-2">
        {pagina > 1 && enlace(pagina - 1, '‹')}
        {numeros.map((n) => enlace(n, String(n), n === pagina))}
        {pagina < paginas && enlace(pagina + 1, '›')}
      </ul>
      <p className="text-tinta-45 mt-3 text-center text-[13px]">
        Página <span className="cifra">{numero(pagina)}</span> de{' '}
        <span className="cifra">{numero(paginas)}</span>
      </p>
    </nav>
  );
}

/** Los resultados. Aparte, para que el encabezado no espere a la base. */
async function Resultados({ filtros, moneda }: { filtros: Filtros; moneda: Moneda }) {
  const cambio = await tipoDeCambio();
  const resultado = await buscar(filtros, cambio);

  if (resultado.avisos.length > 0) {
    return (
      <>
        <VistaResultados
          avisos={resultado.avisos}
          filtros={filtros}
          moneda={moneda}
          tipoDeCambio={cambio}
          total={resultado.total}
        />
        <Paginacion filtros={filtros} pagina={resultado.pagina} paginas={resultado.paginas} />
        <p className="text-tinta-45 mt-4 text-center text-[13px]">
          Mostrando hasta {POR_PAGINA} propiedades por página.
        </p>
      </>
    );
  }

  const conFiltros = hayFiltros(filtros);
  const alternativas = resultado.sinConexion ? [] : await sugerencias(filtros, cambio);

  return (
    <div className="flex flex-col gap-4">
      <EstadoVacio
        titulo={
          conFiltros
            ? 'No encontramos propiedades con esos filtros'
            : 'Todavía no hay propiedades acá'
        }
        descripcion={
          conFiltros
            ? 'Prueba aflojando alguno. Acá abajo te dejamos las búsquedas parecidas que sí tienen resultados.'
            : 'El portal acaba de abrir. Tu propiedad puede ser la primera que vean todos, y publicar es gratis.'
        }
        accion={
          conFiltros
            ? { texto: 'Limpiar todos los filtros', href: urlSinFiltros(filtros) }
            : { texto: 'Publicar gratis', href: '/publicar' }
        }
      />

      {alternativas.length > 0 && (
        <div className="border-linea rounded-2xl border bg-white p-5">
          <h2 className="text-lg">Búsquedas parecidas con resultados</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {alternativas.map((sugerencia) => (
              <li key={sugerencia.texto}>
                <Link
                  href={urlDeFiltros(filtros, { ...sugerencia.filtros, pagina: undefined })}
                  className="border-linea hover:border-fucsia flex items-center justify-between gap-4 rounded-xl border px-4 py-3 transition-colors"
                >
                  <span className="text-tinta text-[14.5px] font-semibold">
                    {sugerencia.texto}
                  </span>
                  <span className="cifra text-turquesa-osc text-[14px] font-bold whitespace-nowrap">
                    {numero(sugerencia.total)}{' '}
                    {sugerencia.total === 1 ? 'resultado' : 'resultados'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export async function PaginaDeBusqueda({
  operacion,
  params,
}: {
  operacion: Operacion;
  params: ParametrosDeBusqueda;
}) {
  const filtros = leerFiltros(operacion, params);

  // La moneda de la URL manda sobre la preferencia guardada: así un
  // enlace compartido se ve igual para quien lo mandó y para quien lo abre.
  const moneda = filtros.moneda ?? (await monedaPreferida());

  const titulo = tituloDeBusqueda(filtros, TIPO_INMUEBLE_PLURAL);
  const aplicados = cantidadDeFiltros(filtros);

  // La clave hace que el Suspense vuelva a mostrar el esqueleto cuando
  // cambian los filtros. Sin ella, React reutiliza el árbol anterior y la
  // pantalla se queda con los resultados viejos hasta que llegan los nuevos.
  const clave = urlDeFiltros(filtros);

  return (
    <Contenedor className="py-7">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[clamp(1.5rem,3.4vw,2.125rem)]">{titulo}</h1>
          <p className="text-tinta-60 mt-1.5 text-[14.5px]">
            Con el precio por m² a la vista en cada aviso, para comparar de verdad.
          </p>
        </div>
        <SelectorMoneda actual={moneda} />
      </div>

      {/* Buscar escribiendo. Sale filtros, no avisos: los resultados de
          abajo los trae Postgres igual que siempre. */}
      <div className="mb-5">
        <BuscadorConversacional operacion={filtros.operacion} />
      </div>

      <div className="flex items-start gap-6">
        <PanelFiltros filtros={filtros} moneda={moneda} />

        <div className="min-w-0 flex-1">
          {aplicados > 0 && (
            <div className="mb-4 lg:hidden">
              <Link
                href={urlSinFiltros(filtros)}
                className="text-tinta-60 hover:text-fucsia text-[14px] font-semibold"
              >
                Limpiar filtros
              </Link>
            </div>
          )}

          <Suspense key={clave} fallback={<ResultadosCargando />}>
            <Resultados filtros={filtros} moneda={moneda} />
          </Suspense>
        </div>
      </div>
    </Contenedor>
  );
}

/** Metadatos de la búsqueda, para el buscador y para compartir. */
export function metadatosDeBusqueda(operacion: Operacion, params: ParametrosDeBusqueda) {
  const filtros = leerFiltros(operacion, params);
  const titulo = tituloDeBusqueda(filtros, TIPO_INMUEBLE_PLURAL);

  return {
    title: titulo,
    description: `${titulo} en Wasipe, con el precio por m² siempre visible. Publicar es gratis.`,
    alternates: {
      canonical: urlDeFiltros({ ...filtros, pagina: undefined, vista: undefined }),
    },
    // Las páginas con filtros no se indexan: son miles de combinaciones
    // que compiten entre sí y diluyen las que sí importan.
    robots:
      hayFiltros(filtros) || (filtros.pagina ?? 1) > 1
        ? { index: false, follow: true }
        : undefined,
  };
}
