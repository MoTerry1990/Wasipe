'use client';

import { useState, useTransition } from 'react';
import { guardarNota, borrarNota } from '@/features/preferencias/acciones';
import { LARGO_MAXIMO_DE_NOTA } from '@/lib/preferencias';

/**
 * La nota de un favorito.
 *
 * La columna `favorites.note` existía desde el esquema inicial y la
 * página la mostraba si estaba, pero **nada la escribía**: la única nota
 * que se veía en pruebas la había puesto la siembra. Esto es el editor
 * que faltaba.
 *
 * Se muestra como texto hasta que se toca. Un formulario abierto en cada
 * tarjeta convierte una lista de seis favoritos en una pared de cajas, y
 * lo que se viene a hacer acá es mirar lo guardado, no escribir.
 */
export function NotaDelFavorito({ avisoId, nota }: { avisoId: string; nota: string | null }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(nota ?? '');
  const [enCurso, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const guardar = () => {
    empezar(async () => {
      const resultado = await guardarNota(avisoId, texto);
      if (resultado.ok) {
        setEditando(false);
        setError(null);
      } else {
        setError(resultado.mensaje ?? 'No pudimos guardar la nota.');
      }
    });
  };

  const borrar = () => {
    empezar(async () => {
      const resultado = await borrarNota(avisoId);
      if (resultado.ok) {
        setTexto('');
        setEditando(false);
        setError(null);
      } else {
        setError(resultado.mensaje ?? 'No pudimos borrar la nota.');
      }
    });
  };

  if (!editando) {
    return (
      <div className="border-linea mt-3 border-t pt-3">
        {nota ? (
          <p className="text-tinta-60 text-[13.5px] italic">{nota}</p>
        ) : (
          <p className="text-tinta-45 text-[13px]">Sin notas.</p>
        )}
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="text-fucsia mt-1.5 text-[13px] font-bold hover:underline"
        >
          {nota ? 'Editar nota' : 'Agregar una nota'}
        </button>
      </div>
    );
  }

  return (
    <div className="border-linea mt-3 border-t pt-3">
      <label htmlFor={`nota-${avisoId}`} className="text-tinta text-[13px] font-bold">
        Tu nota
      </label>
      <p className="text-tinta-45 mt-0.5 text-[12.5px]">
        Solo la ves tú. Sirve para acordarte de por qué lo guardaste.
      </p>
      <textarea
        id={`nota-${avisoId}`}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        maxLength={LARGO_MAXIMO_DE_NOTA}
        rows={3}
        disabled={enCurso}
        placeholder="Preguntar por el mantenimiento y si acepta mascotas."
        className="border-linea focus:border-fucsia mt-2 w-full rounded-xl border-[1.5px] bg-white px-3 py-2 text-[14px] outline-none disabled:opacity-50"
      />
      <p className="text-tinta-45 mt-1 text-right text-[12px]">
        {texto.length} de {LARGO_MAXIMO_DE_NOTA}
      </p>

      {error && <p className="text-rojo mt-1 text-[13px]">{error}</p>}

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={enCurso}
          className="bg-fucsia rounded-xl px-3.5 py-2 text-[13.5px] font-bold text-white disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={() => {
            setTexto(nota ?? '');
            setEditando(false);
            setError(null);
          }}
          disabled={enCurso}
          className="border-linea text-tinta-60 rounded-xl border-[1.5px] bg-white px-3.5 py-2 text-[13.5px] font-bold disabled:opacity-50"
        >
          Cancelar
        </button>
        {nota && (
          <button
            type="button"
            onClick={borrar}
            disabled={enCurso}
            className="border-linea text-tinta-60 ml-auto rounded-xl border-[1.5px] bg-white px-3.5 py-2 text-[13.5px] font-bold disabled:opacity-50"
          >
            Borrar nota
          </button>
        )}
      </div>
    </div>
  );
}
