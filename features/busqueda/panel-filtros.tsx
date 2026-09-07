'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TIPOS_INMUEBLE } from '@/config/sitio';
import { SLUG_DESDE_TIPO, TIPO_DESDE_SLUG } from '@/lib/catalogo';
import {
  urlDeFiltros,
  urlSinFiltros,
  cantidadDeFiltros,
  type Filtros,
} from '@/lib/busqueda/filtros';
import { AutocompletadoUbicacion } from '@/features/busqueda/autocompletado-ubicacion';
import { cn } from '@/lib/cn';
import type { Moneda } from '@/types/base-datos';

/**
 * Panel de filtros.
 *
 * Toda la búsqueda vive en la URL: este formulario no guarda estado
 * propio más allá de lo que se está escribiendo. Al enviarlo se navega,
 * y con eso la búsqueda queda compartible y el botón "atrás" del
 * navegador funciona como la gente espera.
 *
 * En escritorio es una columna al costado; en móvil, un cajón que se
 * abre desde abajo. Es el mismo formulario en los dos casos: mantener
 * dos versiones distintas termina siempre en que una queda desactualizada.
 */

const AMBIENTES = [1, 2, 3, 4, 5];

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-linea border-t py-4 first:border-t-0 first:pt-0">
      <legend className="text-tinta mb-2.5 text-[14px] font-bold">{titulo}</legend>
      {children}
    </fieldset>
  );
}

/** Fila de botones excluyentes: "1+, 2+, 3+…". */
function Minimos({
  nombre,
  valor,
  opciones = AMBIENTES,
}: {
  nombre: string;
  valor: number | undefined;
  opciones?: number[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opciones.map((n) => (
        <label
          key={n}
          className={cn(
            'cifra cursor-pointer rounded-lg border-[1.5px] px-3 py-1.5 text-[14px] font-bold transition-colors',
            valor === n
              ? 'border-fucsia bg-fucsia-suave text-fucsia-osc'
              : 'border-linea text-tinta-60 hover:border-tinta-40 bg-white',
          )}
        >
          <input
            type="radio"
            name={nombre}
            value={n}
            defaultChecked={valor === n}
            className="sr-only"
          />
          {n}+
        </label>
      ))}
    </div>
  );
}

function Casilla({
  nombre,
  etiqueta,
  detalle,
  activa,
}: {
  nombre: string;
  etiqueta: string;
  detalle?: string;
  activa: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-1.5">
      <input
        type="checkbox"
        name={nombre}
        value="1"
        defaultChecked={activa}
        className="mt-0.5 size-4 accent-[var(--color-fucsia)]"
      />
      <span>
        <span className="text-tinta block text-[14.5px] font-semibold">{etiqueta}</span>
        {detalle && <span className="text-tinta-60 block text-[12.5px]">{detalle}</span>}
      </span>
    </label>
  );
}

/**
 * Los campos del formulario.
 *
 * `prefijo` existe porque este formulario se dibuja dos veces —la columna
 * de escritorio y el cajón de móvil— y los dos viven en el DOM al mismo
 * tiempo. Sin prefijo, los `id` se repetirían y cada etiqueta apuntaría
 * al campo equivocado.
 */
function Campos({
  filtros,
  moneda,
  prefijo,
}: {
  filtros: Filtros;
  moneda: Moneda;
  prefijo: string;
}) {
  return (
    <>
      <Grupo titulo="Dónde">
        <AutocompletadoUbicacion nombre="distrito" valorInicial={filtros.distrito ?? ''} />

        <label className="solo-lectores" htmlFor={`${prefijo}-zona`}>
          Urbanización o zona
        </label>
        <input
          id={`${prefijo}-zona`}
          name="zona"
          type="text"
          maxLength={80}
          defaultValue={filtros.zona ?? ''}
          placeholder="Urbanización o zona"
          className="border-linea focus:border-fucsia mt-2 w-full rounded-xl border-[1.5px] bg-white px-3 py-2 text-[14px] outline-none"
        />
      </Grupo>

      <Grupo titulo="Tipo de propiedad">
        <label className="solo-lectores" htmlFor={`${prefijo}-tipo`}>
          Tipo de propiedad
        </label>
        <select
          id={`${prefijo}-tipo`}
          name="tipo"
          defaultValue={filtros.tipo ? SLUG_DESDE_TIPO[filtros.tipo] : ''}
          className="border-linea bg-niebla text-tinta focus:border-fucsia w-full rounded-xl border-[1.5px] px-3 py-2.5 text-[15px] font-semibold focus:outline-none"
        >
          <option value="">Todos los tipos</option>
          {TIPOS_INMUEBLE.map((tipo) => (
            <option key={tipo.valor} value={tipo.valor}>
              {tipo.texto}
            </option>
          ))}
        </select>
      </Grupo>

      <Grupo titulo={`Precio en ${moneda === 'PEN' ? 'soles' : 'dólares'}`}>
        <div className="flex items-center gap-2">
          <label className="solo-lectores" htmlFor={`${prefijo}-precio-min`}>
            Precio mínimo
          </label>
          <input
            id={`${prefijo}-precio-min`}
            name="precioMin"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Desde"
            defaultValue={filtros.precioMin ?? ''}
            className="border-linea bg-niebla text-tinta focus:border-fucsia cifra w-full rounded-xl border-[1.5px] px-3 py-2.5 text-[15px] focus:outline-none"
          />
          <span className="text-tinta-40">—</span>
          <label className="solo-lectores" htmlFor={`${prefijo}-precio-max`}>
            Precio máximo
          </label>
          <input
            id={`${prefijo}-precio-max`}
            name="precioMax"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Hasta"
            defaultValue={filtros.precioMax ?? ''}
            className="border-linea bg-niebla text-tinta focus:border-fucsia cifra w-full rounded-xl border-[1.5px] px-3 py-2.5 text-[15px] focus:outline-none"
          />
        </div>
        <p className="text-tinta-45 mt-1.5 text-[12.5px]">
          Comparamos todo contra su valor en dólares, así los avisos en soles y en dólares
          entran en el mismo rango.
        </p>
      </Grupo>

      <Grupo titulo="Dormitorios">
        <Minimos nombre="dorm" valor={filtros.dorm} />
      </Grupo>

      <Grupo titulo="Baños">
        <Minimos nombre="banos" valor={filtros.banos} />
      </Grupo>

      <Grupo titulo="Cocheras">
        <Minimos nombre="cocheras" valor={filtros.cocheras} opciones={[1, 2, 3]} />
      </Grupo>

      <Grupo titulo="Área total (m²)">
        <div className="flex items-center gap-2">
          <label className="solo-lectores" htmlFor={`${prefijo}-area-min`}>
            Área total mínima
          </label>
          <input
            id={`${prefijo}-area-min`}
            name="areaMin"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Desde"
            defaultValue={filtros.areaMin ?? ''}
            className="border-linea bg-niebla text-tinta focus:border-fucsia cifra w-full rounded-xl border-[1.5px] px-3 py-2.5 text-[15px] focus:outline-none"
          />
          <span className="text-tinta-40">—</span>
          <label className="solo-lectores" htmlFor={`${prefijo}-area-max`}>
            Área total máxima
          </label>
          <input
            id={`${prefijo}-area-max`}
            name="areaMax"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Hasta"
            defaultValue={filtros.areaMax ?? ''}
            className="border-linea bg-niebla text-tinta focus:border-fucsia cifra w-full rounded-xl border-[1.5px] px-3 py-2.5 text-[15px] focus:outline-none"
          />
        </div>
      </Grupo>

      <Grupo titulo="Área techada (m²)">
        <div className="flex items-center gap-2">
          <label className="solo-lectores" htmlFor={`${prefijo}-techada-min`}>
            Área techada mínima
          </label>
          <input
            id={`${prefijo}-techada-min`}
            name="techadaMin"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Desde"
            defaultValue={filtros.techadaMin ?? ''}
            className="border-linea bg-niebla text-tinta focus:border-fucsia cifra w-full rounded-xl border-[1.5px] px-3 py-2.5 text-[15px] focus:outline-none"
          />
          <span className="text-tinta-40">—</span>
          <label className="solo-lectores" htmlFor={`${prefijo}-techada-max`}>
            Área techada máxima
          </label>
          <input
            id={`${prefijo}-techada-max`}
            name="techadaMax"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Hasta"
            defaultValue={filtros.techadaMax ?? ''}
            className="border-linea bg-niebla text-tinta focus:border-fucsia cifra w-full rounded-xl border-[1.5px] px-3 py-2.5 text-[15px] focus:outline-none"
          />
        </div>
      </Grupo>

      <Grupo titulo="Antigüedad">
        <label className="solo-lectores" htmlFor={`${prefijo}-antiguedad`}>
          Antigüedad máxima
        </label>
        <select
          id={`${prefijo}-antiguedad`}
          name="antiguedadMax"
          defaultValue={filtros.antiguedadMax ?? ''}
          className="border-linea bg-niebla text-tinta focus:border-fucsia w-full rounded-xl border-[1.5px] px-3 py-2.5 text-[15px] font-semibold focus:outline-none"
        >
          <option value="">Cualquier antigüedad</option>
          <option value="0">A estrenar</option>
          <option value="5">Hasta 5 años</option>
          <option value="10">Hasta 10 años</option>
          <option value="20">Hasta 20 años</option>
          <option value="30">Hasta 30 años</option>
        </select>
      </Grupo>

      <Grupo titulo="Amoblado">
        <label className="solo-lectores" htmlFor={`${prefijo}-amoblado`}>
          Estado del amoblado
        </label>
        <select
          id={`${prefijo}-amoblado`}
          name="amoblado"
          defaultValue={filtros.amoblado ?? ''}
          className="border-linea bg-niebla text-tinta focus:border-fucsia w-full rounded-xl border-[1.5px] px-3 py-2.5 text-[15px] font-semibold focus:outline-none"
        >
          <option value="">No importa</option>
          <option value="full">Amoblado</option>
          <option value="partial">Parcialmente amoblado</option>
          <option value="none">Sin amoblar</option>
        </select>
      </Grupo>

      <Grupo titulo="Más filtros">
        <Casilla
          nombre="mascotas"
          etiqueta="Acepta mascotas"
          detalle="Incluye los que lo dejan a conversar."
          activa={Boolean(filtros.mascotas)}
        />
        <Casilla
          nombre="verificados"
          etiqueta="Solo verificados"
          detalle="Alguien de Wasipe comprobó que existe y sigue disponible."
          activa={Boolean(filtros.verificados)}
        />
        <Casilla
          nombre="rebajados"
          etiqueta="Bajaron de precio"
          activa={Boolean(filtros.rebajados)}
        />
        <Casilla
          nombre="nuevos"
          etiqueta="Publicados esta semana"
          activa={Boolean(filtros.nuevos)}
        />
      </Grupo>
    </>
  );
}

/** Lee el formulario y arma la URL de la búsqueda. */
function filtrosDelFormulario(datos: FormData, filtros: Filtros): Filtros {
  const leer = (clave: string) => {
    const valor = datos.get(clave);
    const texto = typeof valor === 'string' ? valor.trim() : '';
    return texto === '' ? undefined : texto;
  };

  const numero = (clave: string) => {
    const texto = leer(clave);
    if (texto === undefined) return undefined;
    const n = Number(texto);
    return Number.isFinite(n) ? n : undefined;
  };

  const tipo = leer('tipo');

  return {
    operacion: filtros.operacion,
    moneda: filtros.moneda,
    vista: filtros.vista,
    orden: filtros.orden,
    // Cualquier cambio de filtro vuelve a la primera página: quedarse en
    // la página 7 de una búsqueda nueva deja la pantalla vacía.
    pagina: undefined,

    distrito: leer('distrito'),
    zona: leer('zona'),
    tipo: tipo ? TIPO_DESDE_SLUG[tipo] : undefined,
    precioMin: numero('precioMin'),
    precioMax: numero('precioMax'),
    dorm: numero('dorm'),
    banos: numero('banos'),
    cocheras: numero('cocheras'),
    areaMin: numero('areaMin'),
    areaMax: numero('areaMax'),
    techadaMin: numero('techadaMin'),
    techadaMax: numero('techadaMax'),
    antiguedadMax: numero('antiguedadMax'),
    amoblado: leer('amoblado') as Filtros['amoblado'],
    mascotas: datos.get('mascotas') === '1' ? true : undefined,
    verificados: datos.get('verificados') === '1' ? true : undefined,
    rebajados: datos.get('rebajados') === '1' ? true : undefined,
    nuevos: datos.get('nuevos') === '1' ? true : undefined,
  };
}

export function PanelFiltros({ filtros, moneda }: { filtros: Filtros; moneda: Moneda }) {
  const router = useRouter();
  const base = useId();
  const [abierto, setAbierto] = useState(false);
  const aplicados = cantidadDeFiltros(filtros);

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    setAbierto(false);
    router.push(urlDeFiltros(filtrosDelFormulario(datos, filtros)));
  }

  const formulario = (prefijo: string) => (
    <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-1">
        <Campos filtros={filtros} moneda={moneda} prefijo={prefijo} />
      </div>

      <div className="border-linea flex gap-2 border-t bg-white pt-4">
        <button
          type="submit"
          className="bg-fucsia hover:bg-fucsia-osc flex-1 rounded-xl px-5 py-3 text-[15px] font-bold text-white transition-colors"
        >
          Aplicar filtros
        </button>
        {aplicados > 0 && (
          <button
            type="button"
            onClick={() => {
              setAbierto(false);
              router.push(urlSinFiltros(filtros));
            }}
            className="border-linea text-tinta-60 hover:border-tinta-40 hover:text-tinta rounded-xl border-[1.5px] px-4 py-3 text-[15px] font-bold transition-colors"
          >
            Limpiar
          </button>
        )}
      </div>
    </form>
  );

  return (
    <>
      {/* Escritorio: columna fija al costado. */}
      <aside
        aria-label="Filtros de búsqueda"
        className="border-linea sticky top-20 hidden h-[calc(100dvh-6rem)] w-72 shrink-0 flex-col rounded-2xl border bg-white p-4 lg:flex"
      >
        {formulario(`${base}-escritorio`)}
      </aside>

      {/* Móvil: cajón. */}
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-expanded={abierto}
        aria-controls="cajon-filtros"
        className="border-linea text-tinta hover:border-tinta-40 inline-flex items-center gap-2 rounded-xl border-[1.5px] bg-white px-4 py-2.5 text-[15px] font-bold transition-colors lg:hidden"
      >
        Filtros
        {aplicados > 0 && (
          <span className="bg-fucsia cifra grid size-5 place-items-center rounded-full text-[12px] font-bold text-white">
            {aplicados}
          </span>
        )}
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setAbierto(false)}
            aria-hidden="true"
          />
          <div
            id="cajon-filtros"
            role="dialog"
            aria-modal="true"
            aria-label="Filtros de búsqueda"
            className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg">Filtros</h2>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="text-tinta-60 hover:text-tinta rounded-lg p-2"
              >
                <span className="solo-lectores">Cerrar los filtros</span>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            {formulario(`${base}-movil`)}
          </div>
        </div>
      )}
    </>
  );
}
