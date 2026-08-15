'use client';

import { useFormStatus } from 'react-dom';
import { Boton } from '@/components/ui/boton';

/**
 * Piezas compartidas por los formularios de cuenta.
 */

/**
 * Botón de envío que se bloquea mientras la acción está en curso.
 *
 * Vive en su propio componente porque `useFormStatus` solo funciona
 * dentro del formulario que envía. Sin este bloqueo, un doble clic manda
 * dos registros o dos correos de recuperación.
 */
export function BotonEnviar({
  children,
  enCurso = 'Un momento…',
}: {
  children: React.ReactNode;
  enCurso?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" tamano="lg" full disabled={pending}>
      {pending ? enCurso : children}
    </Boton>
  );
}

/** Grupo de opciones excluyentes, presentadas como tarjetas. */
export function Opciones({
  nombre,
  leyenda,
  opciones,
  valorInicial,
  error,
  columnas = 1,
}: {
  nombre: string;
  leyenda: string;
  opciones: readonly { valor: string; titulo: string; detalle?: string }[];
  valorInicial?: string;
  error?: string;
  columnas?: 1 | 2;
}) {
  return (
    <fieldset>
      <legend className="text-tinta mb-2 text-[14.5px] font-bold">{leyenda}</legend>
      <div className={columnas === 2 ? 'grid gap-2 sm:grid-cols-2' : 'flex flex-col gap-2'}>
        {opciones.map((opcion) => (
          <label
            key={opcion.valor}
            className="border-linea has-[:checked]:border-fucsia has-[:checked]:bg-fucsia-suave hover:border-tinta-40 flex cursor-pointer items-start gap-3 rounded-xl border-[1.5px] bg-white p-3.5 transition-colors"
          >
            <input
              type="radio"
              name={nombre}
              value={opcion.valor}
              defaultChecked={valorInicial === opcion.valor}
              className="mt-1 size-4 accent-[var(--color-fucsia)]"
            />
            <span>
              <span className="text-tinta block text-[15px] font-bold">{opcion.titulo}</span>
              {opcion.detalle && (
                <span className="text-tinta-60 mt-0.5 block text-[13.5px]">
                  {opcion.detalle}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p className="text-fucsia-osc mt-1.5 text-[13.5px] font-semibold" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Selección múltiple en forma de etiquetas. */
export function Etiquetas({
  nombre,
  leyenda,
  ayuda,
  opciones,
  seleccionadas = [],
  error,
}: {
  nombre: string;
  leyenda: string;
  ayuda?: string;
  opciones: readonly string[];
  seleccionadas?: readonly string[];
  error?: string;
}) {
  return (
    <fieldset>
      <legend className="text-tinta text-[14.5px] font-bold">{leyenda}</legend>
      {ayuda && <p className="text-tinta-60 mt-0.5 mb-2 text-[13.5px]">{ayuda}</p>}
      <div className="flex flex-wrap gap-2">
        {opciones.map((opcion) => (
          <label
            key={opcion}
            className="border-linea text-tinta-60 has-[:checked]:border-turquesa has-[:checked]:bg-turquesa-suave has-[:checked]:text-turquesa-osc hover:border-tinta-40 cursor-pointer rounded-full border-[1.5px] bg-white px-3.5 py-2 text-[14px] font-semibold transition-colors"
          >
            <input
              type="checkbox"
              name={nombre}
              value={opcion}
              defaultChecked={seleccionadas.includes(opcion)}
              className="sr-only"
            />
            {opcion}
          </label>
        ))}
      </div>
      {error && (
        <p className="text-fucsia-osc mt-1.5 text-[13.5px] font-semibold" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
