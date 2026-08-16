import Link from 'next/link';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import {
  AVISO_ESTIMACION_INFORMATIVA,
  BANDAS,
  armarSerie,
  evaluarPrecio,
  pieDeMuestra,
  type EstadisticaDeMercado,
  type PuntoDePrecio,
} from '@/lib/mercado/evaluacion';
import { costoMensual, rentabilidadBruta } from '@/lib/mercado/costos';
import { enlaceDeAviso } from '@/lib/avisos/enlace';
import { dinero, fecha, metros, numero, porMetro } from '@/lib/formato';
import type { Comparable } from '@/lib/consultas/mercado';
import type { Moneda, Operacion, TipoInmueble } from '@/types/base-datos';

/**
 * Análisis de precio de un aviso.
 *
 * Es el diferenciador del producto: el precio por m² comparado contra su
 * distrito, con el tamaño de la muestra, la fecha del cálculo y los
 * avisos que se usaron, todos a la vista y con enlace.
 *
 * Cuando no hay datos suficientes, no se muestra una cifra más suave: se
 * dice que no alcanza. Una precisión falsa en la decisión de compra más
 * grande de la vida de alguien es peor que no decir nada.
 */
export function AnalisisDePrecio({
  aviso,
  estadistica,
  alquileres,
  comparables,
  historial,
  tipoDeCambio,
}: {
  aviso: {
    id: string;
    operation: Operacion;
    property_type: TipoInmueble;
    currency: Moneda;
    price: number;
    price_usd: number | null;
    price_usd_per_m2: number | null;
    total_area: number;
    district: string;
    maintenance: number | null;
  };
  estadistica: EstadisticaDeMercado | null;
  alquileres: EstadisticaDeMercado | null;
  comparables: readonly Comparable[];
  historial: readonly PuntoDePrecio[];
  tipoDeCambio: number;
}) {
  const evaluacion = evaluarPrecio(aviso.price_usd_per_m2, estadistica);
  const banda = BANDAS[evaluacion.banda];
  const serie = armarSerie(historial);

  const costos =
    aviso.operation === 'sale'
      ? costoMensual({
          precio: aviso.price,
          moneda: aviso.currency,
          mantenimiento: aviso.maintenance,
          tipoDeCambio,
        })
      : null;

  const rentabilidad =
    aviso.operation === 'sale'
      ? rentabilidadBruta({
          precioUsd: aviso.price_usd,
          areaTotal: aviso.total_area,
          alquileres,
        })
      : null;

  return (
    <section className="mt-6 flex flex-col gap-5">
      {/* ---------------------------------------------------- evaluación */}
      <Tarjeta className="p-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-lg">Cómo está este precio</h2>
          <Insignia tono={banda.tono}>{banda.etiqueta}</Insignia>
        </div>

        <p className="text-tinta-70 mt-2 text-[15px]">
          {evaluacion.banda === 'sin-datos' ? banda.resumen : evaluacion.frase}
        </p>

        {evaluacion.banda !== 'sin-datos' && estadistica && (
          <dl className="border-linea mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 sm:grid-cols-4">
            <Dato
              etiqueta="Este aviso"
              valor={aviso.price_usd_per_m2 ? porMetro(aviso.price_usd_per_m2, 'USD') : '—'}
            />
            <Dato
              etiqueta={`Mediana en ${estadistica.district}`}
              valor={
                estadistica.median_usd_per_m2
                  ? porMetro(Number(estadistica.median_usd_per_m2), 'USD')
                  : '—'
              }
            />
            <Dato
              etiqueta="Rango habitual"
              valor={
                estadistica.p25_usd_per_m2 && estadistica.p75_usd_per_m2
                  ? `${numero(Number(estadistica.p25_usd_per_m2))} – ${numero(Number(estadistica.p75_usd_per_m2))}`
                  : '—'
              }
            />
            <Dato etiqueta="Avisos comparados" valor={numero(evaluacion.muestra)} />
          </dl>
        )}

        <p className="text-tinta-45 mt-3 text-[12.5px]">{pieDeMuestra(evaluacion)}</p>
        <p className="text-tinta-45 mt-1 text-[12.5px] italic">
          {AVISO_ESTIMACION_INFORMATIVA}
        </p>
      </Tarjeta>

      {/* -------------------------------------------------- comparables */}
      {comparables.length > 0 && (
        <Tarjeta className="p-5">
          <h2 className="text-lg">Con qué lo comparamos</h2>
          <p className="text-tinta-60 mt-1 text-[14px]">
            Avisos publicados del mismo distrito y tipo, con área parecida. Puedes abrirlos y
            hacer la cuenta tú.
          </p>
          <ul className="mt-3">
            {comparables.map((c) => (
              <li
                key={c.id}
                className="border-linea flex flex-wrap items-center justify-between gap-2 border-b py-2.5 last:border-0"
              >
                <Link
                  href={enlaceDeAviso({
                    code: c.code,
                    district: c.district,
                    operation: aviso.operation,
                    property_type: aviso.property_type,
                    total_area: c.total_area,
                  })}
                  className="text-tinta hover:text-fucsia min-w-0 flex-1 truncate text-[14.5px] font-semibold"
                >
                  {c.title}
                </Link>
                <span className="text-tinta-60 text-[13.5px]">
                  {metros(c.total_area)} · {dinero(c.price, c.currency)}
                  {c.price_usd_per_m2
                    ? ` · ${porMetro(Number(c.price_usd_per_m2), 'USD')}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {/* ----------------------------------------------------- historial */}
      {serie && (
        <Tarjeta className="p-5">
          <h2 className="text-lg">Historial de precios</h2>
          <p className="text-tinta-70 mt-1 text-[14px]">{serie.resumen}</p>
          <GraficoDePrecios serie={serie} />
          <p className="text-tinta-45 mt-2 text-[12.5px]">
            Cada cambio de precio queda registrado por la base, no por quien publica: la línea
            de tiempo no se puede maquillar.
          </p>
        </Tarjeta>
      )}

      {/* -------------------------------------------------- costo mensual */}
      {costos && (
        <Tarjeta className="p-5">
          <h2 className="text-lg">Cuánto costaría al mes</h2>
          <dl className="mt-3 flex flex-col gap-2.5">
            <Linea
              etiqueta="Cuota estimada del crédito"
              valor={dinero(costos.cuota, costos.moneda)}
            />
            {costos.mantenimiento > 0 && (
              <Linea
                etiqueta="Mantenimiento"
                valor={dinero(costos.mantenimiento, costos.moneda)}
                nota={
                  costos.tipoDeCambio
                    ? `Se cobra en soles; convertido a S/ ${costos.tipoDeCambio.toFixed(2)} por dólar`
                    : undefined
                }
              />
            )}
            <div className="border-linea flex items-baseline justify-between border-t pt-2.5">
              <dt className="text-tinta text-[15px] font-bold">Total mensual estimado</dt>
              <dd className="cifra text-tinta text-[17px] font-extrabold">
                {dinero(costos.total, costos.moneda)}
              </dd>
            </div>
          </dl>
          <p className="text-tinta-45 mt-3 text-[12.5px] italic">{costos.aviso}</p>
        </Tarjeta>
      )}

      {/* ------------------------------------------------- rentabilidad */}
      {rentabilidad && (
        <Tarjeta className="p-5">
          <h2 className="text-lg">Si lo compras para alquilar</h2>
          <p className="cifra text-turquesa-osc mt-2 text-2xl font-extrabold">
            {(rentabilidad.anual * 100).toFixed(1)}% bruto anual
          </p>
          <p className="text-tinta-70 mt-1 text-[14.5px]">
            Alquiler estimado: {dinero(rentabilidad.alquilerEstimado, 'USD')} al mes.
          </p>
          <p className="text-tinta-60 mt-1 text-[13.5px]">{rentabilidad.frase}</p>
          <p className="text-tinta-45 mt-3 text-[12.5px] italic">{rentabilidad.aviso}</p>
        </Tarjeta>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-tinta-45 text-[12.5px]">{etiqueta}</dt>
      <dd className="cifra text-tinta text-[15px] font-bold">{valor}</dd>
    </div>
  );
}

function Linea({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-tinta-60 text-[14.5px]">
        {etiqueta}
        {nota && <span className="text-tinta-45 block text-[12px]">{nota}</span>}
      </dt>
      <dd className="cifra text-tinta text-[15px] font-bold">{valor}</dd>
    </div>
  );
}

/**
 * El gráfico.
 *
 * SVG plano, sin librería y sin JavaScript: son cuatro o cinco puntos y
 * se renderiza en el servidor. Traer 40 KB de librería de gráficos para
 * dibujar una polilínea es exactamente lo que hace lenta una ficha en un
 * teléfono con señal de barrio.
 */
function GraficoDePrecios({ serie }: { serie: NonNullable<ReturnType<typeof armarSerie>> }) {
  const ancho = 600;
  const alto = 160;
  const margen = 8;

  const rango = serie.maximo - serie.minimo || 1;
  const paso = serie.puntos.length > 1 ? (ancho - margen * 2) / (serie.puntos.length - 1) : 0;

  const coordenadas = serie.puntos.map((punto, i) => {
    const x = margen + i * paso;
    const y = alto - margen - ((punto.valor - serie.minimo) / rango) * (alto - margen * 2);
    return { x, y, punto };
  });

  const linea = coordenadas.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  return (
    <>
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        className="mt-3 h-40 w-full"
        role="img"
        aria-label={`Precio del aviso a lo largo del tiempo. ${serie.resumen}`}
      >
        <polyline
          points={linea}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="text-turquesa"
        />
        {coordenadas.map((c) => (
          <circle key={c.punto.fecha} cx={c.x} cy={c.y} r={4} className="fill-turquesa-osc" />
        ))}
      </svg>

      {/* La tabla es la fuente accesible: el SVG es la ilustración. */}
      <ul className="mt-2">
        {serie.puntos.map((punto) => (
          <li
            key={punto.fecha}
            className="border-linea flex items-center justify-between border-b py-2 text-[14px] last:border-0"
          >
            <span className="text-tinta-60">{fecha(punto.fecha)}</span>
            <span className="cifra text-tinta font-bold">{punto.etiqueta}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
