'use client';

import { useEffect, useState, useTransition } from 'react';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import { Aviso } from '@/components/estados/estado-error';
import {
  vistaPreviaDeVideo,
  pedirVideo,
  progresoDeVideo,
  cancelarVideo,
  enlaceDeDescarga,
} from '@/features/wasi-ai/video-acciones';
import {
  AVISO_DE_VIDEO,
  CLAVES_DE_FORMATO,
  CLAVES_DE_PLANTILLA,
  ETIQUETA_VIDEO,
  FORMATOS,
  MOVIMIENTOS_PROHIBIDOS,
  PLANTILLAS,
  areaSegura,
  type ClaveDeFormato,
  type ClaveDePlantilla,
} from '@/lib/ia/video';
import type { EstadoDelVideo, VistaPrevia } from '@/features/wasi-ai/video-tipos';
import { cn } from '@/lib/cn';

/**
 * Estudio de video.
 *
 * La vista previa se arma sin tocar al proveedor y sin gastar un crédito:
 * el guion es determinista, así que lo que se ve en pantalla es lo mismo
 * que va a recibir quien renderiza. Recién al apretar «Crear el video» se
 * apartan los créditos.
 *
 * El recuadro de la previa dibuja la zona segura del formato elegido. En
 * vertical no es un detalle: TikTok e Instagram pintan su interfaz encima
 * del video, y un precio fuera de esa zona queda tapado justo en el
 * formato que más se comparte.
 */

/** Cada cuánto se le pregunta al servidor cómo va el render. */
const CADA = 4000;

export function EstudioDeVideo({
  propiedadId,
  encendido,
}: {
  propiedadId: string;
  encendido: boolean;
}) {
  const [formato, setFormato] = useState<ClaveDeFormato>('vertical');
  const [plantilla, setPlantilla] = useState<ClaveDePlantilla>('modern');
  const [narracion, setNarracion] = useState(true);

  const [vista, setVista] = useState<VistaPrevia | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<EstadoDelVideo | null>(null);
  const [cargando, empezar] = useTransition();

  // La previa se rehace sola con cada cambio: es gratis.
  useEffect(() => {
    let vigente = true;
    void (async () => {
      const respuesta = await vistaPreviaDeVideo(propiedadId, formato, plantilla, narracion);
      if (!vigente) return;
      if (respuesta.ok) {
        setVista(respuesta.vista);
        setError(null);
      } else {
        setVista(null);
        setError(respuesta.mensaje);
      }
    })();
    return () => {
      vigente = false;
    };
  }, [propiedadId, formato, plantilla, narracion]);

  // Mientras renderiza, se pregunta cada pocos segundos.
  useEffect(() => {
    if (video?.estado !== 'renderizando' && video?.estado !== 'encolado') return;

    const id = setInterval(() => {
      void (async () => {
        const respuesta = await progresoDeVideo(video.trabajoId);
        if (respuesta.ok) setVideo(respuesta.video);
      })();
    }, CADA);

    return () => clearInterval(id);
  }, [video?.estado, video?.trabajoId]);

  function crear() {
    empezar(async () => {
      const respuesta = await pedirVideo(propiedadId, formato, plantilla, narracion);
      if (respuesta.ok) setVideo(respuesta.video);
      else setError(respuesta.mensaje);
    });
  }

  function cancelar() {
    if (!video) return;
    empezar(async () => {
      const respuesta = await cancelarVideo(video.trabajoId);
      if (respuesta.ok) setVideo(respuesta.video);
    });
  }

  function descargar() {
    if (!video?.videoId) return;
    empezar(async () => {
      const respuesta = await enlaceDeDescarga(video.videoId!);
      if (respuesta.ok && respuesta.url) window.location.href = respuesta.url;
      else setError(respuesta.mensaje ?? 'No pudimos preparar la descarga.');
    });
  }

  const alcanza = vista ? vista.saldo >= vista.costo : false;
  const trabajando = video?.estado === 'renderizando' || video?.estado === 'encolado';

  return (
    <div className="flex flex-col gap-5">
      {!encendido && (
        <Aviso tono="bien">
          El video automático no está disponible en esta instalación. Puedes compartir el enlace
          de tu aviso, que muestra todas las fotos.
        </Aviso>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <PreviaDelVideo vista={vista} formato={formato} />

        <div className="flex flex-col gap-4">
          <Grupo titulo="Formato">
            {CLAVES_DE_FORMATO.map((clave) => (
              <Opcion
                key={clave}
                activa={formato === clave}
                onClick={() => setFormato(clave)}
                titulo={FORMATOS[clave].etiqueta}
                nota={FORMATOS[clave].para}
              />
            ))}
          </Grupo>

          <Grupo titulo="Plantilla">
            {CLAVES_DE_PLANTILLA.map((clave) => (
              <Opcion
                key={clave}
                activa={plantilla === clave}
                onClick={() => setPlantilla(clave)}
                titulo={PLANTILLAS[clave].etiqueta}
                nota={`${PLANTILLAS[clave].resumen} · ${PLANTILLAS[clave].costo} créditos`}
              />
            ))}
          </Grupo>

          <label className="flex items-center gap-2.5 text-[14.5px]">
            <input
              type="checkbox"
              checked={narracion}
              onChange={(e) => setNarracion(e.target.checked)}
              className="size-4"
            />
            Narración en español
          </label>

          {vista && (
            <Tarjeta className="p-4">
              <p className="text-tinta-70 text-[14px]">
                {vista.fotos} fotos aprobadas ·{' '}
                <span className="cifra">{Math.round(vista.guion.segundosTotales)}</span> s
              </p>
              <p className="text-tinta-70 mt-1 text-[14px]">
                Cuesta <span className="cifra font-bold">{vista.costo}</span> créditos. Tienes{' '}
                <span className="cifra font-bold">{vista.saldo}</span>.
              </p>

              {!alcanza && (
                <p className="text-fucsia-osc mt-2 text-[13.5px] font-semibold">
                  No te alcanzan los créditos para este video.
                </p>
              )}

              <button
                type="button"
                onClick={crear}
                disabled={!encendido || !alcanza || cargando || trabajando}
                className="bg-turquesa hover:bg-turquesa-osc mt-3 w-full rounded-full px-4 py-2.5 text-[14.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                Crear el video
              </button>
              <p className="text-tinta-45 mt-2 text-[12.5px]">
                Los créditos se apartan al empezar. Si el render falla o lo cancelas, se
                devuelven enteros.
              </p>
            </Tarjeta>
          )}
        </div>
      </div>

      {error && <Aviso>{error}</Aviso>}

      {video && <EstadoDelRender video={video} onCancelar={cancelar} onDescargar={descargar} />}

      <p className="text-tinta-60 text-[13.5px] italic">{AVISO_DE_VIDEO}</p>

      <details className="border-linea rounded-xl border p-4">
        <summary className="cursor-pointer text-[14.5px] font-bold">
          Qué no va a hacer la cámara
        </summary>
        <ul className="text-tinta-70 mt-3 flex flex-col gap-2 text-[14px]">
          {MOVIMIENTOS_PROHIBIDOS.map((regla) => (
            <li key={regla}>· {regla}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------

/**
 * La previa.
 *
 * El recuadro punteado es la zona segura calculada del formato, en
 * proporción real. Si un texto se sale de ahí en la previa, se sale
 * también en el video.
 */
function PreviaDelVideo({
  vista,
  formato,
}: {
  vista: VistaPrevia | null;
  formato: ClaveDeFormato;
}) {
  const f = FORMATOS[formato];
  const zona = areaSegura(formato);
  const primera = vista?.guion.escenas[0];

  return (
    <div>
      <div
        className="border-linea relative mx-auto w-full overflow-hidden rounded-2xl border bg-black"
        style={{
          aspectRatio: `${f.ancho} / ${f.alto}`,
          maxWidth: f.alto > f.ancho ? 320 : 640,
        }}
      >
        {primera?.tipo === 'foto' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={primera.url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-90"
          />
        )}

        {/* La zona segura, en proporción exacta al formato. */}
        <div
          className="absolute border border-dashed border-white/45"
          style={{
            left: `${(zona.x / f.ancho) * 100}%`,
            top: `${(zona.y / f.alto) * 100}%`,
            width: `${(zona.ancho / f.ancho) * 100}%`,
            height: `${(zona.alto / f.alto) * 100}%`,
          }}
        >
          {primera?.tipo === 'foto' && primera.texto.length > 0 && (
            <div className="absolute inset-x-0 bottom-0 p-[4%] text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.8)]">
              <p className="text-[clamp(0.95rem,3.4cqw,1.6rem)] leading-tight font-extrabold">
                {primera.texto[0]}
              </p>
              {primera.texto[1] && (
                <p className="mt-1 text-[clamp(0.75rem,2.4cqw,1.1rem)]">{primera.texto[1]}</p>
              )}
            </div>
          )}
        </div>

        <span className="absolute top-2 left-2 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-bold text-white">
          {ETIQUETA_VIDEO}
        </span>
      </div>

      <p className="text-tinta-45 mt-2 text-center text-[12.5px]">
        El recuadro punteado es la zona segura: fuera de ahí, las redes tapan el texto con su
        propia interfaz.
      </p>

      {vista?.guion.narracion && (
        <Tarjeta className="mt-4 p-4">
          <Insignia tono="neutro">Narración</Insignia>
          <p className="text-tinta-70 mt-2 text-[14px]">{vista.guion.narracion}</p>
          <p className="text-tinta-45 mt-2 text-[12.5px]">
            Sale de los campos de tu aviso, uno por frase. No la escribe un modelo: por eso no
            puede decir nada que tú no hayas cargado.
          </p>
        </Tarjeta>
      )}
    </div>
  );
}

function EstadoDelRender({
  video,
  onCancelar,
  onDescargar,
}: {
  video: EstadoDelVideo;
  onCancelar: () => void;
  onDescargar: () => void;
}) {
  if (video.estado === 'renderizando' || video.estado === 'encolado') {
    return (
      <Tarjeta className="p-4">
        <p className="text-[14.5px] font-bold">Armando tu video…</p>
        <div
          role="progressbar"
          aria-valuenow={video.progreso}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Avance del video"
          className="bg-niebla mt-2.5 h-2 w-full overflow-hidden rounded-full"
        >
          <div
            className="bg-turquesa h-full transition-[width] duration-500"
            style={{ width: `${video.progreso}%` }}
          />
        </div>
        <p className="text-tinta-60 mt-2 text-[13.5px]">
          <span className="cifra">{video.progreso}</span>% · puede tardar un par de minutos.
        </p>
        <button
          type="button"
          onClick={onCancelar}
          className="text-tinta-60 hover:text-tinta mt-2 text-[14px] font-bold underline"
        >
          Cancelar y recuperar mis créditos
        </button>
      </Tarjeta>
    );
  }

  if (video.estado === 'listo') {
    return (
      <Tarjeta className="p-4">
        <Insignia tono="verde">Listo</Insignia>
        <p className="text-tinta-70 mt-2 text-[14.5px]">
          Tu video está listo para descargar.
          {video.venceEl && ' El enlace vence en 90 días para que no circule un precio viejo.'}
        </p>
        <button
          type="button"
          onClick={onDescargar}
          className="bg-turquesa hover:bg-turquesa-osc mt-3 rounded-full px-4 py-2 text-[14px] font-bold text-white"
        >
          Descargar
        </button>
      </Tarjeta>
    );
  }

  if (video.estado === 'cancelado') {
    return <Aviso tono="bien">Cancelado. Te devolvimos los créditos.</Aviso>;
  }

  return <Aviso>{video.mensaje ?? 'El video no se pudo terminar.'}</Aviso>;
}

// ---------------------------------------------------------------------

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="text-tinta mb-2 text-[14.5px] font-bold">{titulo}</legend>
      <div className="flex flex-col gap-1.5">{children}</div>
    </fieldset>
  );
}

function Opcion({
  activa,
  onClick,
  titulo,
  nota,
}: {
  activa: boolean;
  onClick: () => void;
  titulo: string;
  nota: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={cn(
        'rounded-xl border-[1.5px] px-3.5 py-2.5 text-left transition-colors',
        activa ? 'border-turquesa bg-turquesa-suave/50' : 'border-linea bg-white',
      )}
    >
      <span className="text-tinta block text-[14.5px] font-bold">{titulo}</span>
      <span className="text-tinta-60 block text-[13px]">{nota}</span>
    </button>
  );
}
