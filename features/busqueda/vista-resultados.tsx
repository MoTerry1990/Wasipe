'use client';

import dynamic from 'next/dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TarjetaPropiedad } from '@/components/propiedades/tarjeta-propiedad';
import { Insignia } from '@/components/ui/tarjeta';
/**
 * El mapa se carga solo cuando se pide.
 *
 * La vista por defecto es la lista, y la mayoría de la gente nunca abre
 * el mapa. Importarlo de la forma normal metía su código —con la
 * agrupación y la proyección— en el paquete de toda búsqueda, se mirara
 * o no. `ssr: false` además evita dibujarlo en el servidor, que no tiene
 * sentido para algo que solo existe en pantalla.
 */
const MapaResultados = dynamic(
  () => import('@/features/busqueda/mapa-resultados').then((m) => m.MapaResultados),
  {
    ssr: false,
    loading: () => (
      <div
        className="border-linea bg-niebla grid h-full place-items-center rounded-2xl border"
        role="status"
      >
        <span className="text-tinta-45 text-[14px]">Cargando el mapa…</span>
      </div>
    ),
  },
);
import { urlDeFiltros, ETIQUETA_ORDEN, ORDENES, type Filtros } from '@/lib/busqueda/filtros';
import { numero } from '@/lib/formato';
import { cn } from '@/lib/cn';
import type { Resultado } from '@/lib/consultas/buscar';
import type { Moneda } from '@/types/base-datos';

/**
 * Resultados: lista y mapa.
 *
 * Los dos leen exactamente el mismo arreglo de avisos, el de la página
 * actual. Por eso no pueden desincronizarse: no hay dos consultas ni dos
 * estados, hay uno solo que se dibuja de dos maneras.
 *
 * Pasar el puntero por una tarjeta resalta su marcador y al revés. Es lo
 * que hace que el mapa sirva para algo más que decorar.
 */
export function VistaResultados({
  avisos,
  filtros,
  moneda,
  tipoDeCambio,
  total,
}: {
  avisos: readonly Resultado[];
  filtros: Filtros;
  moneda: Moneda;
  tipoDeCambio: number;
  total: number;
}) {
  const router = useRouter();
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const vista = filtros.vista ?? 'lista';

  const etiquetaDe = (aviso: Resultado) =>
    aviso.price_dropped_at ? <Insignia tono="fucsia">Bajó de precio</Insignia> : null;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-tinta-60 text-[14.5px]">
          <span className="cifra text-tinta font-bold">{numero(total)}</span>{' '}
          {total === 1 ? 'propiedad encontrada' : 'propiedades encontradas'}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {/* Orden */}
          <label className="solo-lectores" htmlFor="orden-resultados">
            Ordenar los resultados
          </label>
          <select
            id="orden-resultados"
            value={filtros.orden ?? 'recientes'}
            onChange={(e) =>
              router.push(
                urlDeFiltros(filtros, {
                  orden: e.target.value as Filtros['orden'],
                  pagina: undefined,
                }),
              )
            }
            className="border-linea text-tinta focus:border-fucsia rounded-xl border-[1.5px] bg-white px-3 py-2 text-[14.5px] font-semibold focus:outline-none"
          >
            {ORDENES.map((orden) => (
              <option key={orden} value={orden}>
                {ETIQUETA_ORDEN[orden]}
              </option>
            ))}
          </select>

          {/* Lista o mapa */}
          <div
            role="group"
            aria-label="Cómo ver los resultados"
            className="bg-niebla ring-linea inline-flex gap-0.5 rounded-xl p-1 ring-1"
          >
            {(['lista', 'mapa'] as const).map((cual) => (
              <button
                key={cual}
                type="button"
                aria-pressed={vista === cual}
                onClick={() => router.push(urlDeFiltros(filtros, { vista: cual }))}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-[14px] font-bold capitalize transition-colors',
                  vista === cual
                    ? 'text-tinta bg-white shadow-sm'
                    : 'text-tinta-60 hover:text-tinta',
                )}
              >
                {cual}
              </button>
            ))}
          </div>
        </div>
      </div>

      {vista === 'mapa' ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* En móvil el mapa va primero: es lo que se fue a ver. */}
          <div className="order-1 h-[26rem] lg:sticky lg:top-20 lg:order-2 lg:h-[calc(100dvh-7rem)]">
            <MapaResultados
              avisos={avisos}
              moneda={moneda}
              tipoDeCambio={tipoDeCambio}
              seleccionado={seleccionado}
              onSeleccionar={setSeleccionado}
            />
          </div>

          <ul className="order-2 flex flex-col gap-3 lg:order-1">
            {avisos.map((aviso) => (
              <li
                key={aviso.id}
                onMouseEnter={() => setSeleccionado(aviso.id)}
                onMouseLeave={() => setSeleccionado(null)}
                className={cn(
                  'rounded-2xl transition-shadow',
                  seleccionado === aviso.id && 'ring-fucsia ring-2',
                )}
              >
                <TarjetaPropiedad
                  aviso={aviso}
                  moneda={moneda}
                  tipoDeCambio={tipoDeCambio}
                  etiqueta={etiquetaDe(aviso)}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {avisos.map((aviso, i) => (
            <li key={aviso.id}>
              <TarjetaPropiedad
                aviso={aviso}
                moneda={moneda}
                tipoDeCambio={tipoDeCambio}
                prioridad={i < 3}
                etiqueta={etiquetaDe(aviso)}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
