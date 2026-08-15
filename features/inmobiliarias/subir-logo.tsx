'use client';

import { useActionState, useRef, useState } from 'react';
import { Aviso } from '@/components/estados/estado-error';
import { subirLogo, type Estado } from '@/features/cuentas/acciones';
import { revisarImagen, TIPOS_LOGO, PESO_MAXIMO } from '@/lib/validacion/cuenta';

const INICIAL: Estado = {};

/**
 * Logo de la inmobiliaria.
 *
 * Acepta además SVG: muchas inmobiliarias tienen el logo así y
 * convertirlo a mano es una fricción tonta. El archivo se guarda en una
 * carpeta con el id de la inmobiliaria, y la política de storage exige
 * administrarla para poder escribir ahí.
 */
export function SubirLogo({
  agencia,
  logo,
  nombre,
}: {
  agencia: string;
  logo: string | null;
  nombre: string;
}) {
  const [estado, accion] = useActionState(subirLogo, INICIAL);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const formulario = useRef<HTMLFormElement>(null);

  function alElegir(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;

    const revision = revisarImagen(archivo, TIPOS_LOGO);
    if (!revision.ok) {
      setErrorLocal(revision.error);
      setVistaPrevia(null);
      evento.target.value = '';
      return;
    }

    setErrorLocal(null);
    setVistaPrevia(URL.createObjectURL(archivo));
    formulario.current?.requestSubmit();
  }

  const imagen = vistaPrevia ?? logo;
  const mensaje = errorLocal ?? estado.mensaje;

  return (
    <form ref={formulario} action={accion} className="flex flex-col gap-3">
      <input type="hidden" name="agencia" value={agencia} />

      <div className="flex items-center gap-4">
        <div className="bg-niebla ring-linea grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl ring-1">
          {imagen ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imagen}
              alt={`Logo de ${nombre}`}
              className="size-full object-contain p-2"
            />
          ) : (
            <span className="text-tinta-40 text-2xl font-bold">
              {nombre.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div>
          <label className="border-linea text-tinta hover:border-tinta-40 inline-flex cursor-pointer items-center rounded-xl border-[1.5px] bg-white px-4 py-2.5 text-[15px] font-bold transition-colors">
            Cambiar logo
            <input
              type="file"
              name="logo"
              accept={TIPOS_LOGO.join(',')}
              onChange={alElegir}
              className="sr-only"
            />
          </label>
          <p className="text-tinta-45 mt-1.5 text-[13px]">
            JPG, PNG, WEBP o SVG. Hasta {Math.round(PESO_MAXIMO / 1024 / 1024)} MB.
          </p>
        </div>
      </div>

      {mensaje && <Aviso tono={estado.ok && !errorLocal ? 'bien' : 'mal'}>{mensaje}</Aviso>}
    </form>
  );
}
