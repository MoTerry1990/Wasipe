'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { agrupar, limitesDe, tienePuntoPublico } from '@/lib/mapa/agrupar';
import { ESTILO_DE_TESELAS, ATRIBUCION } from '@/lib/mapa/teselas';
import { enlaceDeAviso } from '@/lib/avisos/enlace';
import { precioMostrado } from '@/lib/moneda';
import { numero } from '@/lib/formato';
import { TIPO_INMUEBLE } from '@/lib/etiquetas';
import { cn } from '@/lib/cn';
import type { Resultado } from '@/lib/consultas/buscar';
import type { Moneda } from '@/types/base-datos';

/**
 * Mapa de resultados.
 *
 * Dibuja los avisos de la búsqueda actual sobre las calles reales,
 * agrupados por cercanía. Acercar parte los grupos; alejar los junta.
 *
 * **La cartografía la pone MapLibre GL con teselas de OpenFreeMap**, sin
 * clave y sin cuenta. Hasta el sprint 23D el fondo era un degradado liso
 * y se avisaba en pantalla: los marcadores flotaban sobre nada.
 *
 * Lo que cambió al poner el fondo, y por qué:
 *
 * La agrupación, los marcadores y la sincronización con la lista son los
 * mismos. Lo único que se movió es **de dónde sale la posición en
 * pantalla**. Antes la calculaba una proyección lineal propia, en
 * porcentajes del contenedor. Eso servía sobre un fondo liso, donde no
 * hay nada con qué comparar; sobre calles de verdad no sirve, porque
 * MapLibre dibuja en Mercator y una proyección lineal deja los alfileres
 * corridos respecto de la cuadra que dicen señalar. Ahora la posición la
 * da `map.project()`, así que el marcador cae donde el mapa dice.
 *
 * Lo que NUNCA se dibuja es la dirección exacta: el punto que llega acá
 * ya viene desplazado, y los avisos publicados como «solo distrito» no
 * entran al mapa.
 */

/**
 * El tipo del mapa, en posición de tipo y nada más.
 *
 * No se importa con `import type { Map } from 'maplibre-gl'` arriba:
 * aunque TypeScript lo borre, deja el especificador en el módulo y el
 * empaquetador lo ata al fragmento perezoso. Con eso, el `dynamic()` de
 * este componente se quedaba cargando para siempre —sin error, porque
 * `dynamic` no tiene estado de error— y el mapa nunca aparecía. Un
 * `import()` en posición de tipo no existe en tiempo de ejecución.
 */
type MapaLibre = import('maplibre-gl').Map;

/** Lo que hace falta saber del mapa para colocar un marcador. */
type Vista = { zoom: number; version: number };

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
  const contenedor = useRef<HTMLDivElement | null>(null);
  const mapa = useRef<MapaLibre | null>(null);

  // `version` cambia en cada movimiento del mapa y es lo que obliga a
  // recalcular las posiciones. El zoom aparte, porque además decide cómo
  // se agrupan los puntos.
  const [vista, setVista] = useState<Vista>({ zoom: 4, version: 0 });
  const [listo, setListo] = useState(false);

  const ubicables = useMemo(
    () =>
      avisos
        .filter(tienePuntoPublico)
        .map((aviso) => ({ ...aviso, lat: aviso.lat as number, lon: aviso.lon as number })),
    [avisos],
  );

  const limites = useMemo(() => limitesDe(ubicables), [ubicables]);
  /**
   * El zoom de MapLibre alimenta la agrupación, y **no son la misma
   * escala**.
   *
   * `agrupar()` tiene su propia lista de diez tamaños de celda, del más
   * grueso al más fino; MapLibre va de 0 a 22. Se le pasa el zoom crudo
   * y `ladoDeCelda()` lo recorta al rango que conoce, así que la relación
   * es monótona —más zoom, celdas más chicas— y a escala de ciudad se
   * comporta bien: en la vista completa de Lima quedan celdas de ~1 km, y
   * acercándose se separan hasta ~70 m.
   *
   * No es una equivalencia exacta y conviene no fingir que lo es: ahora
   * que MapLibre es el dueño del encuadre, lo correcto sería derivar el
   * tamaño de celda de la extensión visible en vez de un nivel. Queda
   * anotado; hoy no molesta.
   */
  const grupos = useMemo(() => agrupar(ubicables, vista.zoom), [ubicables, vista.zoom]);

  const ocultos = avisos.length - ubicables.length;

  // -------------------------------------------------------------------
  // El mapa
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!contenedor.current || mapa.current || !limites) return;

    let cancelado = false;

    // Import dinámico: MapLibre toca `window` al cargarse y este módulo
    // también se evalúa al renderizar en el servidor.
    void import('maplibre-gl').then(({ Map: MapaGL, AttributionControl }) => {
      if (cancelado || !contenedor.current) return;

      const m = new MapaGL({
        container: contenedor.current,
        style: ESTILO_DE_TESELAS,
        bounds: [
          [limites.oeste, limites.sur],
          [limites.este, limites.norte],
        ],
        fitBoundsOptions: { padding: 56, maxZoom: 16 },
        // La atribución la ponemos nosotros: el estilo de OpenFreeMap no
        // la declara, y los datos son de OpenStreetMap.
        attributionControl: false,
        // Sin rotar ni inclinar: no aporta nada para buscar casas y
        // complica el gesto en móvil.
        pitchWithRotate: false,
        dragRotate: false,
        touchZoomRotate: true,
      });

      // Los manejadores van PRIMERO, antes de cualquier otra cosa que
      // pueda lanzar. En el sprint 23D estaban después de `addControl` y
      // de `disableRotation()`, y algo entre medio cortaba la ejecución:
      // el mapa se dibujaba, la atribución aparecía, y `load` no llegaba
      // nunca. Resultado: `listo` en falso para siempre y cero
      // marcadores sobre un mapa que se veía perfecto.
      const sincronizar = () =>
        setVista((v) => ({ zoom: Math.round(m.getZoom()), version: v.version + 1 }));

      // NO se espera al evento `load`.
      //
      // Se intentó, y no llega: el mapa se dibuja, las teselas bajan, la
      // atribución aparece, y `load` nunca dispara. Se perdió medio
      // sprint buscando por qué, con el resultado visible de un mapa
      // perfecto y cero marcadores encima.
      //
      // Y además no hacía falta: `project()` traduce coordenadas usando
      // la transformación de la cámara, que existe desde que el mapa se
      // construye. Esperar a que terminen de bajar las teselas para
      // colocar un alfiler era atarse a un evento que no aporta nada a
      // lo que se necesita.
      m.on('move', sincronizar);
      m.on('zoom', sincronizar);

      // Si el estilo o las teselas fallan, que no quede un mapa mudo:
      // sin esto un error de red se ve igual que un mapa vacío.
      m.on('error', (e) => {
        if (!cancelado) console.error('Mapa:', e?.error?.message ?? e);
      });

      mapa.current = m;
      setListo(true);
      sincronizar();

      m.addControl(new AttributionControl({ compact: true, customAttribution: ATRIBUCION }));
    });

    return () => {
      cancelado = true;
      mapa.current?.remove();
      mapa.current = null;
    };
    // Solo al montar: los cambios de límites se manejan abajo, sin
    // rehacer el mapa entero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Una búsqueda nueva mueve la cámara, no reconstruye el mapa.
  useEffect(() => {
    if (!mapa.current || !listo || !limites) return;
    mapa.current.fitBounds(
      [
        [limites.oeste, limites.sur],
        [limites.este, limites.norte],
      ],
      { padding: 56, maxZoom: 16, duration: 400 },
    );
  }, [limites, listo]);

  /**
   * Dónde cae cada grupo en la pantalla, según el mapa.
   *
   * Se calcula en un efecto y se guarda en estado en vez de proyectar al
   * vuelo dentro del render. No es un rodeo: `mapa.current` es una
   * referencia, y leerla mientras se renderiza es justo lo que React no
   * garantiza —el valor puede cambiar sin que nada se vuelva a dibujar—.
   * Acá el disparador es explícito: cambió el mapa de sitio, o cambiaron
   * los grupos.
   */
  const [posiciones, setPosiciones] = useState<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;

    const nuevas: Record<string, { x: number; y: number }> = {};
    for (const grupo of grupos) {
      const { x, y } = m.project([grupo.lon, grupo.lat]);
      nuevas[grupo.id] = { x, y };
    }
    setPosiciones(nuevas);
  }, [grupos, listo, vista.version]);

  const acercar = () => mapa.current?.zoomIn();
  const alejar = () => mapa.current?.zoomOut();

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
      <div ref={contenedor} className="absolute inset-0" data-mapa="teselas" />

      <div
        className="pointer-events-none absolute inset-0"
        role="application"
        aria-label="Mapa de resultados"
      >
        {listo &&
          grupos.map((grupo) => {
            const punto = posiciones[grupo.id];
            if (!punto) return null;

            const cantidad = grupo.puntos.length;
            const unico = cantidad === 1 ? grupo.puntos[0]! : null;
            const activo = unico ? unico.id === seleccionado : false;

            if (unico) {
              const precio = precioMostrado(unico, moneda, tipoDeCambio);
              return (
                <Link
                  key={grupo.id}
                  // La misma función que usan la lista y los favoritos.
                  // Acá decía `/aviso/${id}`, una ruta que no existe: la
                  // ficha vive en `/propiedad/[aviso]`. Cada alfiler del
                  // mapa era un enlace muerto desde que el mapa existe, y
                  // no se notó porque nadie hace clic en un mapa que
                  // estaba sin marcadores.
                  href={enlaceDeAviso(unico)}
                  style={{ left: punto.x, top: punto.y }}
                  onMouseEnter={() => onSeleccionar(unico.id)}
                  onMouseLeave={() => onSeleccionar(null)}
                  onFocus={() => onSeleccionar(unico.id)}
                  onBlur={() => onSeleccionar(null)}
                  className={cn(
                    'cifra pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-2.5 py-1 text-[12.5px] font-bold whitespace-nowrap shadow-md transition-[transform,background-color]',
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
                style={{ left: punto.x, top: punto.y }}
                onClick={acercar}
                className="bg-turquesa cifra pointer-events-auto absolute z-10 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[13px] font-extrabold text-white shadow-md transition-transform hover:scale-110"
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
          onClick={acercar}
          className="text-tinta hover:bg-niebla px-3 py-2 text-lg font-bold disabled:opacity-40"
        >
          +<span className="solo-lectores">Acercar</span>
        </button>
        <button
          type="button"
          onClick={alejar}
          className="border-linea text-tinta hover:bg-niebla border-t px-3 py-2 text-lg font-bold disabled:opacity-40"
        >
          −<span className="solo-lectores">Alejar</span>
        </button>
      </div>

      <p className="text-tinta-60 pointer-events-none absolute bottom-3 left-3 z-30 max-w-[22rem] rounded-lg bg-white/90 px-3 py-2 text-[12px]">
        Las ubicaciones son aproximadas: el punto está desplazado unos 300 m de la dirección
        real.
        {ocultos > 0 &&
          ` ${ocultos} ${ocultos === 1 ? 'aviso no aparece' : 'avisos no aparecen'} porque se publicaron solo con su distrito.`}
      </p>
    </div>
  );
}
