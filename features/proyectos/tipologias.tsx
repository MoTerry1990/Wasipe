'use client';

import { useActionState, useEffect, useState } from 'react';
import { Tarjeta } from '@/components/ui/tarjeta';
import { Boton } from '@/components/ui/boton';
import { Campo, Seleccion, Guardar, Aviso } from './campos';
import { guardarTipologia, borrarTipologia, moverTipologia } from './acciones';
import { dinero } from '@/lib/formato';
import type { TipologiaDeProyecto } from '@/types/base-datos';

/**
 * Las tipologías del proyecto.
 *
 * Cada una es un modelo de departamento —«2 dormitorios, 65 m²»— con su
 * rango de precio y cuántas quedan. No son unidades individuales:
 * registrar el departamento 502 sería un CRM y no un portal.
 *
 * Acá vive el precio, y no en el proyecto. Esa es la razón de ser de todo
 * el sprint: un proyecto no tiene *un* precio.
 */

const MONEDAS = [
  { valor: 'USD', texto: 'US$ dólares' },
  { valor: 'PEN', texto: 'S/ soles' },
] as const;

export function Tipologias({
  codigo,
  tipologias,
  puedeEditar,
}: {
  codigo: string;
  tipologias: readonly TipologiaDeProyecto[];
  puedeEditar: boolean;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl">Tipologías</h2>
          <p className="text-tinta-60 mt-1 text-[14.5px]">
            Cada modelo de departamento, con su rango de precio y cuántas quedan.
          </p>
        </div>
        {puedeEditar && !agregando && (
          <Boton variante="secundario" onClick={() => setAgregando(true)}>
            Agregar tipología
          </Boton>
        )}
      </div>

      {agregando && (
        <FormularioTipologia
          codigo={codigo}
          alTerminar={() => setAgregando(false)}
          etiqueta="Agregar"
        />
      )}

      {tipologias.length === 0 && !agregando ? (
        <Tarjeta className="p-6">
          <p className="text-tinta-60 text-[15px]">
            Todavía no hay ninguna tipología.{' '}
            {puedeEditar
              ? 'Agrega al menos una: sin eso el proyecto no dice ni cuánto cuesta ni qué se vende.'
              : 'Quien administra la inmobiliaria puede agregarlas.'}
          </p>
        </Tarjeta>
      ) : (
        <ul className="flex flex-col gap-3">
          {tipologias.map((t, i) =>
            editando === t.id ? (
              <li key={t.id}>
                <FormularioTipologia
                  codigo={codigo}
                  tipologia={t}
                  alTerminar={() => setEditando(null)}
                  etiqueta="Guardar tipología"
                />
              </li>
            ) : (
              <li key={t.id}>
                <FilaTipologia
                  codigo={codigo}
                  tipologia={t}
                  puedeEditar={puedeEditar}
                  primera={i === 0}
                  ultima={i === tipologias.length - 1}
                  alEditar={() => setEditando(t.id)}
                />
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

function FilaTipologia({
  codigo,
  tipologia: t,
  puedeEditar,
  primera,
  ultima,
  alEditar,
}: {
  codigo: string;
  tipologia: TipologiaDeProyecto;
  puedeEditar: boolean;
  primera: boolean;
  ultima: boolean;
  alEditar: () => void;
}) {
  const [estadoBorrar, borrar] = useActionState(borrarTipologia, { ok: false });
  const [, mover] = useActionState(moverTipologia, { ok: false });

  return (
    <Tarjeta className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-tinta text-[16px] font-bold">{t.name}</p>
          <p className="text-tinta-60 mt-0.5 text-[14px]">
            {t.bedrooms} dorm · {t.bathrooms} baños
            {t.parking > 0 && ` · ${t.parking} cochera${t.parking > 1 ? 's' : ''}`}
            {t.total_area && ` · ${t.total_area} m²`}
          </p>
        </div>
        <div className="min-w-0 text-right">
          <p className="cifra text-tinta text-[15px] font-bold whitespace-nowrap">
            {t.price_from === t.price_to
              ? dinero(t.price_from, t.currency)
              : `${dinero(t.price_from, t.currency)} — ${dinero(t.price_to, t.currency)}`}
          </p>
          <p className="text-tinta-60 mt-0.5 text-[13.5px]">
            Quedan {t.units_available} de {t.units_total}
          </p>
        </div>
      </div>

      {puedeEditar && (
        <div className="border-linea flex flex-wrap items-center gap-2 border-t pt-3">
          <Boton variante="secundario" tamano="sm" onClick={alEditar}>
            Editar
          </Boton>

          <form action={mover} className="contents">
            <input type="hidden" name="codigo" value={codigo} />
            <input type="hidden" name="id" value={t.id} />
            <button
              type="submit"
              name="direccion"
              value="arriba"
              disabled={primera}
              className="text-tinta-60 hover:text-tinta rounded-lg px-2.5 py-1.5 text-[14px] font-semibold disabled:opacity-40"
            >
              Subir
            </button>
            <button
              type="submit"
              name="direccion"
              value="abajo"
              disabled={ultima}
              className="text-tinta-60 hover:text-tinta rounded-lg px-2.5 py-1.5 text-[14px] font-semibold disabled:opacity-40"
            >
              Bajar
            </button>
          </form>

          <form action={borrar} className="ml-auto">
            <input type="hidden" name="codigo" value={codigo} />
            <input type="hidden" name="id" value={t.id} />
            <Guardar variante="peligro" enCurso="Borrando…">
              Borrar
            </Guardar>
          </form>
          <Aviso estado={estadoBorrar} />
        </div>
      )}
    </Tarjeta>
  );
}

function FormularioTipologia({
  codigo,
  tipologia: t,
  alTerminar,
  etiqueta,
}: {
  codigo: string;
  tipologia?: TipologiaDeProyecto;
  alTerminar: () => void;
  etiqueta: string;
}) {
  const [estado, enviar] = useActionState(guardarTipologia, { ok: false });
  const e = estado.errores ?? {};

  // Cada formulario de tipología tiene su propio espacio de `id`: en el
  // editor puede haber uno abierto junto al de información general, y los
  // dos tienen un campo `name`.
  const prefijo = t ? `tip-${t.id}` : 'tip-nueva';

  // Al guardar bien, el formulario se cierra. Dejarlo abierto con los
  // datos puestos hace creer que no se guardó e invita a mandar la misma
  // tipología dos veces.
  useEffect(() => {
    if (estado.ok) alTerminar();
  }, [estado.ok, alTerminar]);

  return (
    <Tarjeta className="p-5 sm:p-6">
      <form action={enviar} className="flex flex-col gap-4">
        <input type="hidden" name="codigo" value={codigo} />
        {t && <input type="hidden" name="id" value={t.id} />}
        <input type="hidden" name="sort_order" value={t?.sort_order ?? 0} />

        <Campo
          idPrefijo={prefijo}
          nombre="name"
          etiqueta="Nombre de la tipología"
          requerido
          valor={t?.name}
          error={e.name}
          maxLength={80}
          placeholder="2 dormitorios · 65 m²"
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo
          idPrefijo={prefijo}
          nombre="bedrooms" etiqueta="Dormitorios" requerido tipo="number" min={0} max={10} valor={t?.bedrooms ?? 2} error={e.bedrooms} />
          <Campo
          idPrefijo={prefijo}
          nombre="bathrooms" etiqueta="Baños" requerido tipo="number" min={0} max={10} valor={t?.bathrooms ?? 1} error={e.bathrooms} />
          <Campo
          idPrefijo={prefijo}
          nombre="parking" etiqueta="Estacionamientos" requerido tipo="number" min={0} max={10} valor={t?.parking ?? 0} error={e.parking} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
          idPrefijo={prefijo}
          nombre="total_area" etiqueta="Área total (m²)" tipo="number" step="0.01" min={0} valor={t?.total_area} error={e.total_area} />
          <Campo
          idPrefijo={prefijo}
          nombre="built_area" etiqueta="Área construida (m²)" tipo="number" step="0.01" min={0} valor={t?.built_area} error={e.built_area} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Seleccion idPrefijo={prefijo} nombre="currency" etiqueta="Moneda" opciones={MONEDAS} valor={t?.currency ?? 'USD'} error={e.currency} />
          <Campo
          idPrefijo={prefijo}
          nombre="price_from" etiqueta="Precio desde" requerido tipo="number" step="0.01" min={0} valor={t?.price_from} error={e.price_from} />
          <Campo
          idPrefijo={prefijo}
          nombre="price_to" etiqueta="Precio hasta" requerido tipo="number" step="0.01" min={0} valor={t?.price_to} error={e.price_to} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
          idPrefijo={prefijo}
          nombre="units_total" etiqueta="Unidades totales" requerido tipo="number" min={1} max={2000} valor={t?.units_total} error={e.units_total} />
          <Campo
          idPrefijo={prefijo}
          nombre="units_available" etiqueta="Unidades disponibles" requerido tipo="number" min={0} max={2000} valor={t?.units_available} error={e.units_available} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Guardar>{etiqueta}</Guardar>
          <Boton variante="fantasma" onClick={alTerminar}>
            Cancelar
          </Boton>
          <Aviso estado={estado} />
        </div>
      </form>
    </Tarjeta>
  );
}
