import type { Metadata } from 'next';
import Link from 'next/link';
import { Contenedor } from '@/components/ui/contenedor';
import { Tarjeta } from '@/components/ui/tarjeta';
import { EnConstruccion } from '@/components/estados/estado-vacio';
import { indicePorDistrito } from '@/lib/consultas/mercado';
import {
  AVISO_ESTIMACION_INFORMATIVA,
  MUESTRA_MINIMA,
  PERIODOS,
  esPeriodo,
} from '@/lib/mercado/evaluacion';
import { aSlug } from '@/lib/avisos/enlace';
import { fecha, numero, porMetro } from '@/lib/formato';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Precio por m²',
  description:
    'Precio por metro cuadrado por distrito en Lima y el Perú, calculado con avisos publicados. Con el tamaño de la muestra y la fecha del cálculo siempre a la vista.',
  alternates: { canonical: '/precio-m2' },
};

/**
 * El índice de precio por m².
 *
 * Es el diferenciador del producto, y por eso la regla de oro está en la
 * consulta y no acá: solo aparecen los distritos que llegaron a la
 * muestra mínima. Un distrito con tres avisos no sale con una cifra
 * suave; simplemente no sale, y se dice cuántos faltan.
 */
export default async function PrecioM2({
  searchParams,
}: {
  searchParams: Promise<{ operacion?: string; periodo?: string }>;
}) {
  const { operacion: op, periodo: per } = await searchParams;
  const operacion = op === 'rent' ? 'rent' : 'sale';
  const periodo = per && esPeriodo(per) ? per : 'm12';

  const distritos = await indicePorDistrito(operacion, periodo);
  const calculado = distritos[0]?.computed_at ?? null;

  return (
    <Contenedor className="py-10 sm:py-16">
      <header className="mb-7 text-center">
        <h1 className="text-[clamp(1.6rem,4vw,2.25rem)]">Precio por m² en el Perú</h1>
        <p className="text-tinta-60 mx-auto mt-3 max-w-[56ch]">
          Cuánto cuesta el metro cuadrado en cada distrito, calculado con los avisos publicados
          en Wasipe. Con el tamaño de la muestra a la vista: un promedio sin decir de cuántos
          avisos sale es la forma más fácil de mentir con estadística.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap justify-center gap-2">
        <Pestana href={`/precio-m2?periodo=${periodo}`} activa={operacion === 'sale'}>
          Venta
        </Pestana>
        <Pestana
          href={`/precio-m2?operacion=rent&periodo=${periodo}`}
          activa={operacion === 'rent'}
        >
          Alquiler
        </Pestana>
      </div>

      <div className="mb-7 flex flex-wrap justify-center gap-2">
        {(Object.keys(PERIODOS) as (keyof typeof PERIODOS)[]).map((clave) => (
          <Pestana
            key={clave}
            href={`/precio-m2?operacion=${operacion}&periodo=${clave}`}
            activa={periodo === clave}
            pequena
          >
            {PERIODOS[clave]}
          </Pestana>
        ))}
      </div>

      {distritos.length === 0 ? (
        <EnConstruccion
          titulo="Todavía no hay distritos con datos suficientes"
          descripcion={`Publicamos un distrito recién cuando tiene al menos ${MUESTRA_MINIMA} avisos activos en el período elegido. Preferimos no publicar antes que publicar una cifra que no se sostiene.`}
          mientrasTanto={{ texto: 'Ver propiedades', href: '/comprar' }}
        />
      ) : (
        <Tarjeta className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-[14.5px]">
              <caption className="sr-only">
                Precio por m² por distrito, en {operacion === 'rent' ? 'alquiler' : 'venta'}
              </caption>
              <thead>
                <tr className="border-linea border-b text-left">
                  <th scope="col" className="p-3 font-bold">
                    Distrito
                  </th>
                  <th scope="col" className="p-3 font-bold">
                    Mediana
                  </th>
                  <th scope="col" className="p-3 font-bold">
                    Rango habitual
                  </th>
                  <th scope="col" className="p-3 font-bold">
                    Avisos
                  </th>
                </tr>
              </thead>
              <tbody>
                {distritos.map((fila) => (
                  <tr key={fila.district} className="border-linea border-b last:border-0">
                    <th scope="row" className="p-3 text-left font-semibold">
                      <Link
                        href={`/precio-m2/${aSlug(fila.district)}?operacion=${operacion}&periodo=${periodo}`}
                        className="text-tinta hover:text-fucsia"
                      >
                        {fila.district}
                      </Link>
                    </th>
                    <td className="cifra p-3 font-bold">
                      {fila.median_usd_per_m2
                        ? porMetro(Number(fila.median_usd_per_m2), 'USD')
                        : '—'}
                    </td>
                    <td className="text-tinta-60 p-3">
                      {fila.p25_usd_per_m2 && fila.p75_usd_per_m2
                        ? `${numero(Number(fila.p25_usd_per_m2))} – ${numero(Number(fila.p75_usd_per_m2))}`
                        : '—'}
                    </td>
                    <td className="cifra text-tinta-60 p-3">{numero(fila.listings)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}

      <div className="text-tinta-45 mx-auto mt-6 max-w-[62ch] text-center text-[12.5px]">
        <p>
          Solo aparecen los distritos con al menos {MUESTRA_MINIMA} avisos publicados en el
          período. Se descartan los avisos con un precio por m² muy alejado del resto, y no
          entran los rechazados, pausados, vencidos ni vendidos.
        </p>
        {calculado && (
          <p className="mt-1.5">
            Calculado el {fecha(calculado)} · valores normalizados a dólares con el tipo de
            cambio de ese día.
          </p>
        )}
        <p className="mt-1.5 italic">{AVISO_ESTIMACION_INFORMATIVA}</p>
      </div>
    </Contenedor>
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
