'use client';

import { useState, useTransition } from 'react';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import { Aviso } from '@/components/estados/estado-error';
import {
  pedirTexto,
  aceptarSugerencia,
  descartarSugerencia,
} from '@/features/wasi-ai/acciones';
import {
  OPERACIONES,
  AVISO_REVISION,
  datosSuficientes,
  type OperacionDeAsistente,
} from '@/lib/ia/asistente';
import type { RespuestaDelAsistente } from '@/features/wasi-ai/tipos';
import type { BorradorDeAviso } from '@/lib/validacion/aviso';
import { cn } from '@/lib/cn';

/**
 * Wasi AI dentro del asistente de publicación.
 *
 * La propuesta se muestra aparte, nunca encima de lo que la persona
 * escribió. Hay que apretar «Usar este texto» para que entre al
 * formulario, y ese clic es lo que se registra en la base como
 * confirmación. Sin ese clic no pasa nada: ni se aplica, ni se publica,
 * ni queda guardado en el borrador.
 */

type Props = {
  datos: BorradorDeAviso;
  operaciones: readonly OperacionDeAsistente[];
  /** Qué hacer con el texto aceptado. Lo decide quien usa el asistente. */
  aplicar: (operacion: OperacionDeAsistente, texto: string) => void;
  /** false cuando no hay proveedor configurado: se explica y no se ofrece. */
  encendido: boolean;
};

export function AsistenteDeTexto({ datos, operaciones, aplicar, encendido }: Props) {
  const [respuesta, setRespuesta] = useState<RespuestaDelAsistente | null>(null);
  const [pidiendo, empezarPedido] = useTransition();
  const [enCurso, setEnCurso] = useState<OperacionDeAsistente | null>(null);

  const listo = datosSuficientes(datos);

  function pedir(operacion: OperacionDeAsistente) {
    setEnCurso(operacion);
    setRespuesta(null);
    empezarPedido(async () => {
      setRespuesta(await pedirTexto(operacion, datos));
    });
  }

  function usar(texto: string) {
    if (!respuesta?.ok) return;
    aplicar(respuesta.operacion, texto);
    // La constancia se registra después de aplicar: si la red falla, la
    // persona igual se queda con el texto que aceptó.
    void aceptarSugerencia(respuesta.trabajoId);
    setRespuesta(null);
  }

  function descartar() {
    if (respuesta?.ok) void descartarSugerencia(respuesta.trabajoId);
    setRespuesta(null);
  }

  return (
    <Tarjeta className="border-turquesa/30 bg-turquesa-suave/25 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Insignia tono="verde">Wasi AI</Insignia>
        <p className="text-tinta-60 text-[13.5px]">
          {encendido
            ? 'Te propone un texto con lo que ya cargaste. Tú decides si lo usas.'
            : 'Wasi AI no está disponible ahora. Escribe el aviso a tu manera; queda igual de bien.'}
        </p>
      </div>

      {encendido && (
        <>
          <div className="mt-3.5 flex flex-wrap gap-2">
            {operaciones.map((operacion) => (
              <button
                key={operacion}
                type="button"
                onClick={() => pedir(operacion)}
                disabled={pidiendo || !listo}
                className={cn(
                  'border-turquesa text-turquesa-osc rounded-full border-[1.5px] bg-white px-3.5 py-1.5 text-[13.5px] font-bold',
                  'hover:bg-turquesa-suave disabled:cursor-not-allowed disabled:opacity-45',
                )}
              >
                {pidiendo && enCurso === operacion
                  ? 'Escribiendo…'
                  : OPERACIONES[operacion].etiqueta}
              </button>
            ))}
          </div>

          {!listo && (
            <p className="text-tinta-45 mt-2.5 text-[13px]">
              Completa la operación, el tipo, el distrito y el área total para que Wasi AI tenga
              con qué escribir.
            </p>
          )}
        </>
      )}

      {respuesta && !respuesta.ok && (
        <div className="mt-3.5">
          <Aviso>{respuesta.mensaje}</Aviso>
        </div>
      )}

      {respuesta?.ok && (
        <div className="mt-4">
          <p className="text-tinta-60 mb-2.5 text-[13px] italic">{AVISO_REVISION}</p>

          {respuesta.sugerencia.tipo === 'titulos' ? (
            <ul className="flex flex-col gap-2">
              {respuesta.sugerencia.opciones.map((opcion) => (
                <li key={opcion}>
                  <button
                    type="button"
                    onClick={() => usar(opcion)}
                    className="border-linea hover:border-turquesa w-full rounded-xl border-[1.5px] bg-white px-3.5 py-2.5 text-left text-[14.5px]"
                  >
                    {opcion}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="border-linea rounded-xl border-[1.5px] bg-white p-3.5">
              <p className="text-tinta text-[14.5px] whitespace-pre-wrap">
                {respuesta.sugerencia.texto}
              </p>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {respuesta.sugerencia.tipo === 'texto' && (
              <button
                type="button"
                onClick={() =>
                  usar(respuesta.sugerencia.tipo === 'texto' ? respuesta.sugerencia.texto : '')
                }
                className="bg-turquesa hover:bg-turquesa-osc rounded-full px-4 py-2 text-[14px] font-bold text-white"
              >
                Usar este texto
              </button>
            )}
            <button
              type="button"
              onClick={descartar}
              className="text-tinta-60 hover:text-tinta rounded-full px-4 py-2 text-[14px] font-bold"
            >
              Descartar
            </button>
          </div>

          {respuesta.sugerencia.tipo === 'titulos' && (
            <p className="text-tinta-45 mt-2 text-[13px]">
              Toca el título que prefieras para usarlo.
            </p>
          )}
        </div>
      )}
    </Tarjeta>
  );
}
