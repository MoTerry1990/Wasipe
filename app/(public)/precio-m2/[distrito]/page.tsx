import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Contenedor } from '@/components/ui/contenedor';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import { EstadoVacio } from '@/components/estados/estado-vacio';
import { detalleDeDistrito } from '@/lib/consultas/mercado';
import {
  AVISO_ESTIMACION_INFORMATIVA,
  MUESTRA_MINIMA,
  PERIODOS,
  esPeriodo,
} from '@/lib/mercado/evaluacion';
import { UBICACIONES } from '@/config/ubicaciones';
import { aSlug } from '@/lib/avisos/enlace';
import { TIPO_INMUEBLE } from '@/lib/etiquetas';
import { dinero, fecha, metros, numero, porMetro } from '@/lib/formato';
import type { TipoInmueble } from '@/types/base-datos';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ distrito: string }>;
  searchParams: Promise<{ operacion?: string; periodo?: string }>;
};

/** El distrito a partir de su forma en la dirección. */
function distritoDesdeSlug(slug: string): string | null {
  return UBICACIONES.find((u) => u.slug === slug || aSlug(u.nombre) === slug)?.nombre ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { distrito: slug } = await params;
  const distrito = distritoDesdeSlug(slug);
  if (!distrito) return { title: 'Precio por m²' };

  return {
    title: `Precio por m² en ${distrito}`,
    description: `Cuánto cuesta el metro cuadrado en ${distrito}, por tipo de propiedad, calculado con avisos publicados en Wasipe.`,
    alternates: { canonical: `/precio-m2/${slug}` },
  };
}

/**
 * El precio por m² de un distrito, tipo por tipo.
 *
 * La fila «Todos los tipos» va primero porque es la que la gente busca;
 * las de cada tipo van debajo, y las que no llegaron a la muestra mínima
 * se muestran igual, pero SIN cifra: decir «departamentos: 3 avisos, sin
 * datos suficientes» es información. Decir un promedio de tres avisos, no.
 */
export default async function PrecioDeDistrito({ params, searchParams }: Props) {
  const { distrito: slug } = await params;
  const { operacion: op, periodo: per } = await searchParams;

  const distrito = distritoDesdeSlug(slug);
  if (!distrito) notFound();

  const operacion = op === 'rent' ? 'rent' : 'sale';
  const periodo = per && esPeriodo(per) ? per : 'm12';

  const filas = await detalleDeDistrito(distrito, operacion, periodo);
  const general = filas.find((f) => f.property_type === null) ?? null;
  const porTipo = filas
    .filter((f) => f.property_type !== null)
    .sort((a, b) => b.listings - a.listings);

  return (
    <Contenedor className="py-10 sm:py-14">
      <Link href="/precio-m2" className="text-tinta-60 text-[14px] underline">
        ← Todos los distritos
      </Link>

      <h1 className="mt-3 text-[clamp(1.5rem,3.6vw,2.1rem)]">Precio por m² en {distrito}</h1>
      <p className="text-tinta-60 mt-2 max-w-[58ch]">
        {operacion === 'rent' ? 'Alquiler' : 'Venta'} ·{' '}
        {PERIODOS[periodo].toLowerCase()}. Calculado con los avisos publicados en Wasipe.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <Pestana href={`/precio-m2/${slug}?periodo=${periodo}`} activa={operacion === 'sale'}>
          Venta
        </Pestana>
        <Pestana
          href={`/precio-m2/${slug}?operacion=rent&periodo=${periodo}`}
          activa={operacion === 'rent'}
        >
          Alquiler
        </Pestana>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(PERIODOS) as (keyof typeof PERIODOS)[]).map((clave) => (
          <Pestana
            key={clave}
            href={`/precio-m2/${slug}?operacion=${operacion}&periodo=${clave}`}
            activa={periodo === clave}
            pequena
          >
            {PERIODOS[clave]}
          </Pestana>
        ))}
      </div>

      {!general && porTipo.length === 0 ? (
        <div className="mt-8">
          <EstadoVacio
            titulo={`Todavía no hay datos de ${distrito}`}
            descripcion={`Publicamos una cifra recién cuando el distrito tiene al menos ${MUESTRA_MINIMA} avisos activos en el período elegido.`}
            accion={{ texto: 'Ver propiedades', href: '/comprar' }}
          />
        </div>
      ) : (
        <>
          {general && <ResumenDelDistrito fila={general} />}

          {porTipo.length > 0 && (
            <>
              <h2 className="mt-9 mb-3 text-xl">Por tipo de propiedad</h2>
              <ul className="flex flex-col gap-2.5">
                {porTipo.map((fila) => (
                  <li key={fila.property_type}>
                    <Tarjeta className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div>
                        <p className="text-tinta text-[15px] font-bold">
                          {TIPO_INMUEBLE[fila.property_type as TipoInmueble]}
                        </p>
                        <p className="text-tinta-45 text-[13px]">
                          {numero(fila.listings)}{' '}
                          {fila.listings === 1 ? 'aviso' : 'avisos'}
                          {fila.outliers > 0 &&
                            ` · ${numero(fila.outliers)} fuera por atípicos`}
                        </p>
                      </div>

                      {fila.sufficient && fila.median_usd_per_m2 ? (
                        <p className="cifra text-turquesa-osc text-[17px] font-extrabold">
                          {porMetro(Number(fila.median_usd_per_m2), 'USD')}
                        </p>
                      ) : (
                        <Insignia tono="neutro">Pocos datos</Insignia>
                      )}
                    </Tarjeta>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <div className="text-tinta-45 mt-8 max-w-[62ch] text-[12.5px]">
        <p>
          Se descartan los avisos con un precio por m² muy alejado del resto —vallas
          intercuartílicas— y no entran los rechazados, pausados, vencidos ni vendidos.
        </p>
        {general && (
          <p className="mt-1.5">
            Calculado el {fecha(general.computed_at)} · normalizado a dólares con S/{' '}
            {Number(general.pen_per_usd).toFixed(2)} por dólar.
          </p>
        )}
        <p className="mt-1.5 italic">{AVISO_ESTIMACION_INFORMATIVA}</p>
      </div>
    </Contenedor>
  );
}

function ResumenDelDistrito({
  fila,
}: {
  fila: Awaited<ReturnType<typeof detalleDeDistrito>>[number];
}) {
  if (!fila.sufficient) {
    return (
      <Tarjeta className="mt-6 p-5">
        <Insignia tono="neutro">Pocos datos</Insignia>
        <p className="text-tinta-70 mt-2 text-[15px]">
          Hay {numero(fila.listings)} {fila.listings === 1 ? 'aviso' : 'avisos'} en este corte y
          hacen falta {MUESTRA_MINIMA}. No publicamos una cifra que no se sostiene.
        </p>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta className="mt-6 p-5">
      <p className="text-tinta-45 text-[13px]">Mediana de todos los tipos</p>
      <p className="cifra text-turquesa-osc mt-1 text-3xl font-extrabold">
        {porMetro(Number(fila.median_usd_per_m2), 'USD')}
      </p>

      <dl className="border-linea mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 sm:grid-cols-4">
        <Dato
          etiqueta="Rango habitual"
          valor={`${numero(Number(fila.p25_usd_per_m2))} – ${numero(Number(fila.p75_usd_per_m2))}`}
        />
        <Dato
          etiqueta="Precio típico"
          valor={fila.median_price_usd ? dinero(Number(fila.median_price_usd), 'USD') : '—'}
        />
        <Dato
          etiqueta="Área típica"
          valor={fila.median_area ? metros(Number(fila.median_area)) : '—'}
        />
        <Dato etiqueta="Avisos" valor={numero(fila.listings)} />
      </dl>
    </Tarjeta>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-tinta-45 text-[12.5px]">{etiqueta}</dt>
      <dd className="cifra text-tinta text-[15px] font-bold">{valor}</dd>
    </div>
  );
}

function Pestana({
  href,
  activa,
  pequena,
  children,
}: {
  href: string;
  activa: boolean;
  pequena?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={activa ? 'page' : undefined}
      className={[
        'rounded-full border-[1.5px] font-bold',
        pequena ? 'px-3 py-1.5 text-[13px]' : 'px-4 py-2 text-[14.5px]',
        activa ? 'border-tinta bg-tinta text-white' : 'border-linea text-tinta-60 bg-white',
      ].join(' ')}
    >
      {children}
    </Link>
  );
}
