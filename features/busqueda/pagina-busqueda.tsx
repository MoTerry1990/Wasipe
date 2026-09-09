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
import { rutaCanonica } from '@/lib/busqueda/rutas';
import { SLUG_DESDE_TIPO } from '@/lib/catalogo';
import { motivoParaNoIndexar, robotsDeBusqueda, seIndexa } from '@/lib/seo/indexable';
import { contarAvisos } from '@/lib/consultas/conteo';
import { Migas, DatosEstructurados } from '@/components/ui/migas';
import { listaDeAvisos, type Miga } from '@/lib/seo/estructurados';
import { landingsDeBusqueda } from '@/lib/seo/landings';
import { enlaceDeAviso } from '@/lib/avisos/enlace';
import type { Metadata } from 'next';
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
async function Resultados({
  filtros,
  moneda,
  titulo,
}: {
  filtros: Filtros;
  moneda: Moneda;
  titulo: string;
}) {
  // El tipo de cambio no depende de los filtros, pero `buscar()` sí lo
  // necesita para comparar precios en dos monedas. Se pide primero y se
  // deja cacheado: dentro de la misma petición, quien lo vuelva a pedir
  // —el panel de filtros, las tarjetas— recibe este mismo valor.
  const cambio = await tipoDeCambio();
  const resultado = await buscar(filtros, cambio);

  if (resultado.avisos.length > 0) {
    return (
      <>
        {/* La lista de fichas, para que Google entienda que esto es un
            listado y no una página suelta. Solo las direcciones: el precio
            y el área los declara cada ficha, y repetirlos acá abre la
            puerta a que los dos números se contradigan. */}
        <DatosEstructurados
          datos={listaDeAvisos(
            titulo,
            resultado.avisos.map((aviso) => enlaceDeAviso(aviso)),
            resultado.total,
          )}
        />

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
                  {/* `min-w-0` porque al lado hay un `whitespace-nowrap`:
                      sin esto la frase no puede encogerse, la fila mide más
                      que la pantalla y arrastra el desplazamiento
                      horizontal de toda la página. Se veía a 360 px y menos
                      —scrollWidth 368 contra clientWidth 360—, o sea en
                      buena parte del parque de teléfonos del Perú. Es el
                      mismo defecto que la barra de orden del sprint 23E,
                      en otro sitio. */}
                  <span className="text-tinta min-w-0 text-[14.5px] font-semibold">
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

/**
 * Las migas de una búsqueda.
 *
 * Inicio › Comprar › Miraflores › Departamentos. El orden va de lo
 * general a lo específico y cada paso es una página que existe, así que
 * son una salida de verdad y no un adorno: quien cae en «departamentos en
 * venta en Miraflores» y quiere ver todo Miraflores tiene el enlace ahí.
 */
function migasDeBusqueda(filtros: Filtros, titulo: string): Miga[] {
  const raiz = filtros.operacion === 'rent' ? '/alquilar' : '/comprar';
  const pasos: Miga[] = [
    { texto: 'Inicio', href: '/' },
    { texto: filtros.operacion === 'rent' ? 'Alquilar' : 'Comprar', href: raiz },
  ];

  if (filtros.distrito) {
    pasos.push({
      texto: filtros.distrito,
      // Solo se enlaza si además hay tipo: sin tipo, ese paso ES la página
      // en la que estás, y enlazarla a sí misma no lleva a ninguna parte.
      href: filtros.tipo
        ? rutaCanonica(filtros.operacion, { distrito: filtros.distrito })
        : undefined,
    });
  }

  if (filtros.tipo || !filtros.distrito) pasos.push({ texto: titulo });

  return pasos;
}

/**
 * Enlaces a las landings hermanas.
 *
 * Quien está en «departamentos en venta en Miraflores» normalmente
 * también mira casas en Miraflores, o departamentos en San Isidro. Estos
 * enlaces existen para esa persona; que además le den a Google un camino
 * entre landings es la consecuencia, no el motivo. Un bloque de enlaces
 * que no le sirve a nadie se nota, y se penaliza.
 */
function LandingsHermanas({ filtros }: { filtros: Filtros }) {
  if (!filtros.distrito) return null;

  const hermanas = landingsDeBusqueda().filter(
    (l) =>
      l.operacion === filtros.operacion &&
      l.distrito === filtros.distrito &&
      l.tipo !== filtros.tipo,
  );

  const enOtrosDistritos = filtros.tipo
    ? landingsDeBusqueda()
        .filter(
          (l) =>
            l.operacion === filtros.operacion &&
            l.tipo === filtros.tipo &&
            l.distrito &&
            l.distrito !== filtros.distrito,
        )
        .slice(0, 8)
    : [];

  if (hermanas.length === 0 && enOtrosDistritos.length === 0) return null;

  const lista = (titulo: string, enlaces: typeof hermanas) =>
    enlaces.length > 0 && (
      <div>
        <h3 className="text-tinta-60 text-[13px] font-bold tracking-wide uppercase">
          {titulo}
        </h3>
        <ul className="mt-2 flex flex-wrap gap-2">
          {enlaces.map((enlace) => (
            <li key={enlace.href}>
              <Link
                href={enlace.href}
                className="border-linea text-tinta-70 hover:border-fucsia hover:text-fucsia inline-block rounded-xl border bg-white px-3 py-1.5 text-[13.5px] transition-colors"
              >
                {enlace.texto}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <section aria-labelledby="tambien-buscan" className="border-linea mt-10 border-t pt-6">
      <h2 id="tambien-buscan" className="text-lg">
        Otras búsquedas en {filtros.distrito}
      </h2>
      <div className="mt-4 flex flex-col gap-4">
        {lista(`Otros tipos en ${filtros.distrito}`, hermanas)}
        {lista('El mismo tipo en otros distritos', enOtrosDistritos)}
      </div>
    </section>
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
      <div className="mb-4">
        <Migas pasos={migasDeBusqueda(filtros, titulo)} />
      </div>

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
            <Resultados filtros={filtros} moneda={moneda} titulo={titulo} />
          </Suspense>

          <LandingsHermanas filtros={filtros} />
        </div>
      </div>
    </Contenedor>
  );
}

/**
 * Metadatos de la búsqueda, para el buscador y para compartir.
 *
 * Dos cosas que antes estaban mal y ahora no:
 *
 *  · La canónica de una landing es su ruta bonita —`/comprar/departamento/
 *    miraflores`— y no la versión con parámetros. Antes se declaraba la
 *    de parámetros, que es la misma página con otra dirección: exactamente
 *    lo que una canónica existe para evitar.
 *  · Una landing con tipo y distrito **sí** se indexa. Antes cualquier
 *    filtro la sacaba del índice, lo que dejaba fuera justo las páginas
 *    por las que la gente llega desde Google.
 *
 * El conteo decide lo último: una landing con dos avisos es una plantilla
 * casi vacía y no entra, por más que la combinación sea buena.
 */
export async function metadatosDeBusqueda(
  operacion: Operacion,
  params: ParametrosDeBusqueda,
): Promise<Metadata> {
  const filtros = leerFiltros(operacion, params);
  const titulo = tituloDeBusqueda(filtros, TIPO_INMUEBLE_PLURAL);

  // Solo se cuenta cuando la página podría indexarse. Preguntarle a la
  // base por una búsqueda con siete filtros que igual va a quedar fuera
  // del índice es una consulta regalada en cada visita de un robot.
  const total = seIndexa(filtros) ? await contarAvisos(filtros) : undefined;

  const descripcion = descripcionDeBusqueda(filtros, titulo);

  return {
    title: titulo,
    description: descripcion,
    alternates: { canonical: canonicaDeBusqueda(filtros) },
    robots: robotsDeBusqueda(filtros, total),
    openGraph: {
      type: 'website',
      title: titulo,
      description: descripcion,
      url: canonicaDeBusqueda(filtros),
      images: [{ url: ogDeBusqueda(filtros), width: 1200, height: 630, alt: titulo }],
    },
  };
}

/**
 * La imagen que se ve al compartir una landing por WhatsApp.
 *
 * Va por parámetros a `/og/busqueda` porque las landings viven bajo un
 * segmento comodín, y Next no admite un `opengraph-image.tsx` ahí adentro.
 */
function ogDeBusqueda(filtros: Filtros): string {
  const params = new URLSearchParams();
  if (filtros.operacion === 'rent') params.set('op', 'rent');
  if (filtros.tipo) params.set('tipo', SLUG_DESDE_TIPO[filtros.tipo]);
  if (filtros.distrito) params.set('lugar', filtros.distrito);

  const cola = params.toString();
  return cola ? `/og/busqueda?${cola}` : '/og/busqueda';
}

/**
 * La dirección canónica de una búsqueda.
 *
 * Para una landing es la ruta bonita, sin ningún parámetro. Para una
 * búsqueda con filtros de detalle es su propia URL sin paginación ni
 * presentación: no se indexa, pero la canónica igual tiene que apuntar a
 * algo coherente por si alguien la comparte.
 */
export function canonicaDeBusqueda(filtros: Filtros): string {
  if (esLanding(filtros)) {
    // `rutaCanonica` ya devuelve la ruta con su barra inicial.
    return rutaCanonica(filtros.operacion, {
      tipo: filtros.tipo,
      distrito: filtros.distrito,
    });
  }

  return urlDeFiltros({
    ...filtros,
    pagina: undefined,
    vista: undefined,
    orden: undefined,
    moneda: undefined,
  });
}

/**
 * ¿Esta búsqueda es una de las landings, o lleva filtros de detalle?
 *
 * La provincia y el departamento se ignoran **cuando hay distrito**,
 * porque en ese caso no los pidió nadie: `leerSegmentos()` los deduce del
 * distrito para poder consultar. Tratarlos como filtros propios hacía que
 * `/comprar/departamento/miraflores` se declarara canónica en su forma de
 * parámetros, que es justo lo que una canónica existe para evitar.
 *
 * Sin distrito sí cuentan: una búsqueda por provincia entera no es una de
 * las landings que se generan, y no tiene ruta bonita a la que apuntar.
 */
function esLanding(filtros: Filtros): boolean {
  const soloDerivadas =
    filtros.distrito !== undefined ||
    (filtros.provincia === undefined && filtros.departamento === undefined);

  return soloDerivadas && motivoParaNoIndexar(filtros) === null;
}

/**
 * La descripción para el resultado de Google.
 *
 * Distinta por landing, no una plantilla con el título metido dentro:
 * doscientas páginas con la misma frase son doscientas páginas que Google
 * lee como la misma.
 */
function descripcionDeBusqueda(filtros: Filtros, titulo: string): string {
  const donde = filtros.distrito ?? filtros.provincia ?? filtros.departamento;
  const verbo = filtros.operacion === 'rent' ? 'alquilar' : 'comprar';

  if (donde) {
    return `${titulo}: precios, área y precio por m² de cada aviso, más el promedio del distrito para saber si el precio de ${donde} es razonable antes de escribirle a nadie.`;
  }

  return `${titulo} en todo el Perú. Filtra por distrito, precio y área, y compara el precio por m² antes de decidir qué ${verbo}.`;
}
