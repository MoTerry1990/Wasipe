'use client';

import { useState, useTransition } from 'react';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import { Aviso } from '@/components/estados/estado-error';
import { Comparador } from '@/features/wasi-ai/comparador';
import {
  pedirEdicionDeFoto,
  reintentarEdicionDeFoto,
  aplicarEdicionDeFoto,
  descartarEdicionDeFoto,
} from '@/features/wasi-ai/fotos-acciones';
import {
  EDICIONES,
  CLAVES_DE_EDICION,
  AVISO_ANTES_DE_APLICAR,
  PROHIBIDO_EN_FOTOS,
  type ClaveDeEdicion,
} from '@/lib/ia/imagenes';
import type { RespuestaDeFoto } from '@/features/wasi-ai/fotos-tipos';
import { cn } from '@/lib/cn';

/**
 * Mejorar una foto con Wasi AI.
 *
 * La propuesta se muestra al lado de la original, nunca encima. Para que
 * entre al aviso hay que apretar «Usar esta versión», y aun así se
 * agrega como foto nueva: la original se queda donde está.
 */

export type FotoEditable = {
  id: string;
  url: string;
  alt: string | null;
};

export function EditorDeFotos({
  fotos,
  encendido,
}: {
  fotos: readonly FotoEditable[];
  /** false cuando no hay proveedor de imagen configurado. */
  encendido: boolean;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);

  if (fotos.length === 0) {
    return (
      <p className="text-tinta-60 text-[14.5px]">
        Este aviso todavía no tiene fotos que mejorar.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!encendido && (
        <Aviso tono="bien">
          La mejora de fotos de Wasi AI no está disponible en esta instalación. Tus fotos se
          publican tal como las subiste.
        </Aviso>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {fotos.map((foto) => (
          <li key={foto.id}>
            <Tarjeta className="overflow-hidden p-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={foto.url}
                alt={foto.alt ?? 'Foto del aviso'}
                className="bg-niebla aspect-[4/3] w-full object-cover"
              />
              <div className="p-3">
                <button
                  type="button"
                  disabled={!encendido}
                  onClick={() => setAbierta(abierta === foto.id ? null : foto.id)}
                  className="border-turquesa text-turquesa-osc hover:bg-turquesa-suave w-full rounded-full border-[1.5px] bg-white px-3.5 py-2 text-[13.5px] font-bold disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {abierta === foto.id ? 'Cerrar' : 'Mejorar con Wasi AI'}
                </button>
              </div>
            </Tarjeta>

            {abierta === foto.id && <PanelDeEdicion foto={foto} />}
          </li>
        ))}
      </ul>

      <details className="border-linea rounded-xl border p-4">
        <summary className="cursor-pointer text-[14.5px] font-bold">
          Qué no va a hacer Wasi AI con tus fotos
        </summary>
        <ul className="text-tinta-70 mt-3 flex flex-col gap-2 text-[14px]">
          {PROHIBIDO_EN_FOTOS.map((regla) => (
            <li key={regla}>· {regla}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------

function PanelDeEdicion({ foto }: { foto: FotoEditable }) {
  const [elegida, setElegida] = useState<ClaveDeEdicion | null>(null);
  const [opcion, setOpcion] = useState<string | undefined>(undefined);
  const [respuesta, setRespuesta] = useState<RespuestaDeFoto | null>(null);
  const [aplicada, setAplicada] = useState(false);
  const [trabajando, empezar] = useTransition();

  function pedir(clave: ClaveDeEdicion, valor?: string) {
    setElegida(clave);
    setRespuesta(null);
    setAplicada(false);
    empezar(async () => {
      setRespuesta(await pedirEdicionDeFoto(foto.id, clave, valor));
    });
  }

  function reintentar(trabajoId: string) {
    setRespuesta(null);
    empezar(async () => {
      setRespuesta(await reintentarEdicionDeFoto(trabajoId));
    });
  }

  function aplicar(trabajoId: string) {
    empezar(async () => {
      const resultado = await aplicarEdicionDeFoto(trabajoId);
      if (resultado.ok) {
        setAplicada(true);
        setRespuesta(null);
      } else {
        setRespuesta({ ok: false, mensaje: resultado.mensaje ?? 'No pudimos aplicarla.' });
      }
    });
  }

  function descartar(trabajoId: string) {
    void descartarEdicionDeFoto(trabajoId);
    setRespuesta(null);
    setElegida(null);
  }

  const config = elegida ? EDICIONES[elegida] : null;

  return (
    <Tarjeta className="border-turquesa/30 bg-turquesa-suave/25 mt-2 p-4">
      <Insignia tono="verde">Wasi AI</Insignia>

      <div className="mt-3 flex flex-wrap gap-2">
        {CLAVES_DE_EDICION.map((clave) => (
          <button
            key={clave}
            type="button"
            disabled={trabajando}
            onClick={() => {
              const primera = EDICIONES[clave].opcion?.valores[0];
              setOpcion(primera);
              pedir(clave, primera);
            }}
            title={EDICIONES[clave].resumen}
            className={cn(
              'rounded-full border-[1.5px] px-3 py-1.5 text-[13px] font-bold',
              elegida === clave
                ? 'border-turquesa bg-turquesa text-white'
                : 'border-linea text-tinta-70 bg-white',
              'disabled:cursor-not-allowed disabled:opacity-45',
            )}
          >
            {EDICIONES[clave].etiqueta}
            {EDICIONES[clave].costo > 0 && (
              <span className="ml-1.5 font-normal opacity-70">
                {EDICIONES[clave].costo} cr.
              </span>
            )}
          </button>
        ))}
      </div>

      {config && <p className="text-tinta-60 mt-2.5 text-[13px]">{config.resumen}</p>}

      {config?.opcion && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-tinta-70 text-[13px] font-bold">{config.opcion.etiqueta}:</span>
          {config.opcion.valores.map((valor) => (
            <button
              key={valor}
              type="button"
              disabled={trabajando}
              onClick={() => {
                setOpcion(valor);
                if (elegida) pedir(elegida, valor);
              }}
              className={cn(
                'rounded-full px-3 py-1 text-[13px]',
                opcion === valor ? 'bg-tinta text-white' : 'border-linea border bg-white',
              )}
            >
              {valor}
            </button>
          ))}
        </div>
      )}

      {trabajando && (
        <p className="text-tinta-60 mt-3 text-[14px]" role="status">
          Trabajando en tu foto… esto puede tardar medio minuto.
        </p>
      )}

      {aplicada && (
        <div className="mt-3">
          <Aviso tono="bien">
            Listo: la agregamos como foto nueva del aviso. Tu foto original sigue ahí.
          </Aviso>
        </div>
      )}

      {respuesta && !respuesta.ok && (
        <div className="mt-3 flex flex-col gap-2">
          <Aviso>{respuesta.mensaje}</Aviso>
          {respuesta.sePuedeReintentar && respuesta.trabajoId && (
            <button
              type="button"
              onClick={() => reintentar(respuesta.trabajoId!)}
              disabled={trabajando}
              className="text-turquesa-osc self-start text-[14px] font-bold underline"
            >
              Volver a intentarlo
            </button>
          )}
        </div>
      )}

      {respuesta?.ok && (
        <div className="mt-4">
          <p className="text-tinta-60 mb-2.5 text-[13px] italic">{AVISO_ANTES_DE_APLICAR}</p>

          <Comparador
            original={respuesta.propuesta.original}
            propuesta={respuesta.propuesta.propuesta}
            etiqueta={respuesta.propuesta.etiqueta}
            alt={foto.alt ?? 'Foto del aviso'}
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={trabajando}
              onClick={() => aplicar(respuesta.propuesta.trabajoId)}
              className="bg-turquesa hover:bg-turquesa-osc rounded-full px-4 py-2 text-[14px] font-bold text-white disabled:opacity-45"
            >
              Usar esta versión
            </button>
            <button
              type="button"
              disabled={trabajando}
              onClick={() => descartar(respuesta.propuesta.trabajoId)}
              className="text-tinta-60 hover:text-tinta rounded-full px-4 py-2 text-[14px] font-bold"
            >
              Descartar
            </button>
          </div>

          <p className="text-tinta-45 mt-2 text-[12.5px]">
            Se agrega como foto nueva y llevará su etiqueta a la vista. Tu foto original no se
            reemplaza nunca.
          </p>
        </div>
      )}
    </Tarjeta>
  );
}
