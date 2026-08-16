'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  agrupar,
  limitesDe,
  proyectar,
  tienePuntoPublico,
  ZOOM_MAXIMO,
  ZOOM_MINIMO,
} from '@/lib/mapa/agrupar';
import { precioMostrado } from '@/lib/moneda';
import { numero } from '@/lib/formato';
import { TIPO_INMUEBLE } from '@/lib/etiquetas';
import { cn } from '@/lib/cn';
import type { Resultado } from '@/lib/consultas/buscar';
import type { Moneda } from '@/types/base-datos';

/**
 * Mapa de resultados.
 *
 * Dibuja los avisos de la búsqueda actual sobre un plano proyectado a
 * partir de sus propias coordenadas, agrupados por cercanía. Acercar
 * parte los grupos; alejar los junta.
 *
 * LO QUE FALTA: la cartografía de fondo (las calles) necesita un
 * proveedor de mapas con su clave. Mientras no esté configurada, el
 * fondo es liso y se avisa. Los marcadores, la agrupación y la
 * sincronización con la lista sí funcionan.
 *
 * Lo que NUNCA se dibuja es la dirección exacta: el punto que llega acá
 * ya viene desplazado, y los avisos publicados como "solo distrito" no
 * entran al mapa.
 */
export function MapaResultados({
  avisos,
  moneda,
  tipoDeCambio,
  seleccionado,
  onSeleccionar,
}: {
  avisos: readonly Resultado[];
  moneda: Moneda;
  tipoDeCambio: number;
  seleccionado: string | null;
  onSeleccionar: (id: string | null) => void;
}) {
  const [zoom, setZoom] = useState(4);

  const ubicables = useMemo(
    () =>
      avisos
        .filter(tienePuntoPublico)
        .map((aviso) => ({ ...aviso, lat: aviso.lat as number, lon: aviso.lon as number })),
    [avisos],
  );

  const limites = useMemo(() => limitesDe(ubicables), [ubicables]);
  const grupos = useMemo(() => agrupar(ubicables, zoom), [ubicables, zoom]);

  const ocultos = avisos.length - ubicables.length;

  if (!limites) {
    return (
      <div className="border-linea bg-niebla grid h-full min-h-[24rem] place-items-center rounded-2xl border p-8 text-center">
        <div>
          <p className="text-tinta font-bold">Ningún aviso de esta búsqueda tiene ubicación</p>
          <p className="text-tinta-60 mt-1.5 text-[14.5px]">
            Los avisos publicados como «solo distrito» no se muestran en el mapa, a pedido de
            quien los publicó.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-linea relative h-full min-h-[24rem] overflow-hidden rounded-2xl border bg-[linear-gradient(160deg,#E4F1FC,#F4F6F8)]">
      <div className="absolute inset-0" role="application" aria-label="Mapa de resultados">
        {grupos.map((grupo) => {
          const { x, y } = proyectar(grupo, limites);
          const cantidad = grupo.puntos.length;
          const unico = cantidad === 1 ? grupo.puntos[0]! : null;
          const activo = unico ? unico.id === seleccionado : false;

          if (unico) {
            const precio = precioMostrado(unico, moneda, tipoDeCambio);
            return (
              <Link
                key={grupo.id}
                href={`/aviso/${unico.id}`}
                style={{ left: `${x}%`, top: `${y}%` }}
                onMouseEnter={() => onSeleccionar(unico.id)}
                onMouseLeave={() => onSeleccionar(null)}
                onFocus={() => onSeleccionar(unico.id)}
                onBlur={() => onSeleccionar(null)}
                className={cn(
                  'cifra absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-2.5 py-1 text-[12.5px] font-bold whitespace-nowrap shadow-md transition-[transform,background-color]',
                  activo
                    ? 'bg-fucsia z-20 scale-110 text-white'
                    : 'text-tinta hover:bg-fucsia z-10 bg-white hover:text-white',
                )}
                title={`${TIPO_INMUEBLE[unico.property_type]} en ${unico.district}`}
              >
                {precio.texto}
              </Link>
            );
          }

          return (
            <button
              key={grupo.id}
              type="button"
              style={{ left: `${x}%`, top: `${y}%` }}
              onClick={() => setZoom((z) => Math.min(z + 2, ZOOM_MAXIMO))}
              className="bg-turquesa cifra absolute z-10 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[13px] font-extrabold text-white shadow-md transition-transform hover:scale-110"
            >
              {numero(cantidad)}
              <span className="solo-lectores">
                {cantidad} propiedades en esta zona. Acercar para separarlas.
              </span>
            </button>
          );
        })}
      </div>

      {/* Acercar y alejar */}
      <div className="absolute top-3 right-3 z-30 flex flex-col overflow-hidden rounded-xl bg-white shadow-md">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(z + 1, ZOOM_MAXIMO))}
          disabled={zoom >= ZOOM_MAXIMO}
          className="text-tinta hover:bg-niebla px-3 py-2 text-lg font-bold disabled:opacity-40"
        >
          +<span className="solo-lectores">Acercar</span>
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(z - 1, ZOOM_MINIMO))}
          disabled={zoom <= ZOOM_MINIMO}
          className="border-linea text-tinta hover:bg-niebla border-t px-3 py-2 text-lg font-bold disabled:opacity-40"
        >
          −<span className="solo-lectores">Alejar</span>
        </button>
      </div>

      <p className="text-tinta-60 absolute bottom-3 left-3 z-30 max-w-[22rem] rounded-lg bg-white/90 px-3 py-2 text-[12px]">
        Las ubicaciones son aproximadas: el punto está desplazado unos 300 m de la dirección
        real.
        {ocultos > 0 &&
          ` ${ocultos} ${ocultos === 1 ? 'aviso no aparece' : 'avisos no aparecen'} porque se publicaron solo con su distrito.`}
      </p>
    </div>
  );
}
