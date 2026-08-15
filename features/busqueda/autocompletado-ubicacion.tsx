'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { buscarUbicaciones, type Ubicacion } from '@/config/ubicaciones';
import { cn } from '@/lib/cn';

/**
 * Autocompletado de ubicación.
 *
 * Es la base: por ahora filtra el catálogo local de distritos, sin pedir
 * nada al servidor. Cuando la base tenga volumen se reemplaza el origen
 * de las sugerencias por una consulta con conteo de avisos, y el resto
 * del componente no cambia.
 *
 * Se escribe a mano y no con `<datalist>` porque datalist no deja
 * mostrar la provincia debajo del distrito ni navegar con el teclado de
 * forma predecible entre navegadores.
 *
 * Accesibilidad: es un combobox según ARIA. Sin `aria-activedescendant`
 * un lector de pantalla no anunciaría qué sugerencia está marcada.
 */
export function AutocompletadoUbicacion({
  nombre = 'donde',
  valorInicial = '',
  placeholder = 'Distrito, ciudad o zona',
  className,
}: {
  nombre?: string;
  valorInicial?: string;
  placeholder?: string;
  className?: string;
}) {
  const id = useId();
  const [texto, setTexto] = useState(valorInicial);
  const [abierto, setAbierto] = useState(false);
  const [marcada, setMarcada] = useState(-1);
  const campo = useRef<HTMLInputElement>(null);

  const sugerencias = useMemo(
    () => (abierto ? buscarUbicaciones(texto) : []),
    [texto, abierto],
  );

  function elegir(ubicacion: Ubicacion) {
    setTexto(ubicacion.nombre);
    setAbierto(false);
    setMarcada(-1);
    campo.current?.focus();
  }

  function alTeclear(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (sugerencias.length === 0) return;

    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setMarcada((i) => (i + 1) % sugerencias.length);
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setMarcada((i) => (i <= 0 ? sugerencias.length - 1 : i - 1));
    } else if (evento.key === 'Enter' && marcada >= 0) {
      // Solo intercepta el Enter cuando hay una sugerencia marcada; si no,
      // el formulario se envía como corresponde.
      evento.preventDefault();
      const elegida = sugerencias[marcada];
      if (elegida) elegir(elegida);
    } else if (evento.key === 'Escape') {
      setAbierto(false);
      setMarcada(-1);
    }
  }

  return (
    <div className={cn('relative', className)}>
      <label className="solo-lectores" htmlFor={id}>
        ¿Dónde buscas?
      </label>

      <input
        ref={campo}
        id={id}
        name={nombre}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={abierto && sugerencias.length > 0}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        aria-activedescendant={marcada >= 0 ? `${id}-opcion-${marcada}` : undefined}
        placeholder={placeholder}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          setMarcada(-1);
        }}
        onFocus={() => setAbierto(true)}
        // El cierre se retrasa un instante: sin eso, el clic sobre una
        // sugerencia dispara el blur antes y la selección se pierde.
        onBlur={() => window.setTimeout(() => setAbierto(false), 120)}
        onKeyDown={alTeclear}
        className="text-tinta placeholder:text-tinta-40 w-full bg-transparent py-3 text-[15.5px] focus:outline-none"
      />

      {abierto && sugerencias.length > 0 && (
        <ul
          id={`${id}-lista`}
          role="listbox"
          aria-label="Ubicaciones sugeridas"
          className="border-linea shadow-marca absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border bg-white py-1 text-left"
        >
          {sugerencias.map((ubicacion, i) => (
            <li
              key={ubicacion.slug}
              id={`${id}-opcion-${i}`}
              role="option"
              aria-selected={i === marcada}
              onMouseDown={() => elegir(ubicacion)}
              onMouseEnter={() => setMarcada(i)}
              className={cn(
                'cursor-pointer px-3.5 py-2.5',
                i === marcada ? 'bg-fucsia-suave' : 'hover:bg-niebla',
              )}
            >
              <span className="text-tinta block text-[15px] font-semibold">
                {ubicacion.nombre}
              </span>
              <span className="text-tinta-60 block text-[12.5px]">
                {ubicacion.provincia === ubicacion.departamento
                  ? ubicacion.departamento
                  : `${ubicacion.provincia}, ${ubicacion.departamento}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
