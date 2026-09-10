'use client';

import { useFormStatus } from 'react-dom';
import { Boton } from '@/components/ui/boton';

/**
 * Piezas de formulario del panel de proyectos.
 *
 * Son las mismas de siempre en apariencia: se reutiliza el estilo de los
 * campos del panel en vez de inventar otro. Lo que cambia acá es que cada
 * campo sabe mostrar su propio error, porque un proyecto tiene muchos y
 * un mensaje suelto arriba obliga a buscar cuál falló.
 */

/**
 * El `id` de un campo lleva prefijo cuando hace falta.
 *
 * En el editor conviven dos formularios y los dos tienen un campo
 * `name`. Sin prefijo, los dos `<input>` comparten `id="name"` y el
 * `<label for="name">` del segundo apunta al primero: al hacer clic en la
 * etiqueta se enfoca el control equivocado, y lo mismo le pasa a un
 * lector de pantalla. Lo encontró la prueba autenticada, escribiendo en
 * el campo de arriba sin darse cuenta.
 *
 * El `name` que se envía NO cambia: el prefijo es solo del `id`.
 */
const idDe = (prefijo: string | undefined, nombre: string) =>
  prefijo ? `${prefijo}-${nombre}` : nombre;

const BASE =
  'border-linea text-tinta focus:border-fucsia w-full rounded-xl border-[1.5px] bg-white px-3 py-2 text-[15px] focus:outline-none';

export function Campo({
  nombre,
  etiqueta,
  error,
  ayuda,
  tipo = 'text',
  valor,
  requerido = false,
  idPrefijo,
  ...resto
}: {
  nombre: string;
  etiqueta: string;
  error?: string;
  ayuda?: string;
  tipo?: string;
  valor?: string | number | null;
  requerido?: boolean;
  idPrefijo?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'name' | 'type' | 'defaultValue'>) {
  const id = idDe(idPrefijo, nombre);
  const idAyuda = ayuda || error ? `${id}-ayuda` : undefined;

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="text-tinta mb-1 block text-[14px] font-semibold">
        {etiqueta}
        {!requerido && <span className="text-tinta-45 font-normal"> (opcional)</span>}
      </label>
      <input
        id={id}
        name={nombre}
        type={tipo}
        defaultValue={valor ?? undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={idAyuda}
        className={BASE}
        {...resto}
      />
      {(error || ayuda) && (
        <p id={idAyuda} className={error ? 'mt-1 text-[13px] text-red-600' : 'text-tinta-60 mt-1 text-[13px]'}>
          {error ?? ayuda}
        </p>
      )}
    </div>
  );
}

export function AreaDeTexto({
  nombre,
  etiqueta,
  error,
  valor,
  idPrefijo,
  ...resto
}: {
  nombre: string;
  etiqueta: string;
  error?: string;
  valor?: string | null;
  idPrefijo?: string;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'name' | 'defaultValue'>) {
  const id = idDe(idPrefijo, nombre);
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="text-tinta mb-1 block text-[14px] font-semibold">
        {etiqueta} <span className="text-tinta-45 font-normal">(opcional)</span>
      </label>
      <textarea
        id={id}
        name={nombre}
        rows={5}
        defaultValue={valor ?? undefined}
        aria-invalid={error ? true : undefined}
        className={BASE}
        {...resto}
      />
      {error && <p className="mt-1 text-[13px] text-red-600">{error}</p>}
    </div>
  );
}

export function Seleccion({
  nombre,
  etiqueta,
  opciones,
  valor,
  error,
  idPrefijo,
}: {
  nombre: string;
  etiqueta: string;
  opciones: readonly { valor: string; texto: string }[];
  valor?: string | null;
  error?: string;
  idPrefijo?: string;
}) {
  const id = idDe(idPrefijo, nombre);
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="text-tinta mb-1 block text-[14px] font-semibold">
        {etiqueta}
      </label>
      {/* `min-w-0` y `max-w-full`: un <select> nativo se ancha hasta su
          opción más larga y no cede, y en un teléfono angosto eso empuja
          la página entera hacia el costado. Ya pasó una vez, en la barra
          de orden de la búsqueda. */}
      <select
        id={id}
        name={nombre}
        defaultValue={valor ?? undefined}
        aria-invalid={error ? true : undefined}
        className={`${BASE} max-w-full min-w-0`}
      >
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-[13px] text-red-600">{error}</p>}
    </div>
  );
}

/** Botón que se bloquea mientras la acción está en curso. */
export function Guardar({
  children = 'Guardar',
  enCurso = 'Guardando…',
  variante = 'primario',
}: {
  children?: React.ReactNode;
  enCurso?: string;
  variante?: 'primario' | 'secundario' | 'fantasma' | 'peligro';
}) {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" variante={variante} disabled={pending}>
      {pending ? enCurso : children}
    </Boton>
  );
}

/** El resultado de la última acción, dicho en una línea. */
export function Aviso({ estado }: { estado: { ok: boolean; mensaje?: string } }) {
  if (!estado.mensaje) return null;
  return (
    <p
      role="status"
      className={
        estado.ok
          ? 'text-turquesa-osc text-[14px] font-semibold'
          : 'text-[14px] font-semibold text-red-600'
      }
    >
      {estado.mensaje}
    </p>
  );
}
