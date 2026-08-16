'use client';

import { useRef, useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/navegador';
import {
  revisarFoto,
  rutaDeFoto,
  LADO_MAXIMO,
  CALIDAD,
  FOTOS_MINIMAS,
  FOTOS_MAXIMAS,
} from '@/lib/validacion/aviso';
import { Aviso } from '@/components/estados/estado-error';
import { cn } from '@/lib/cn';

/**
 * Fotos del aviso.
 *
 * Se comprimen en el navegador antes de subirlas. Una foto de celular
 * pesa 6 MB; a 1920 px de lado mayor y calidad 0,82 baja a unos 300 KB
 * sin que se note la diferencia en pantalla. Con conexión móvil, eso es
 * la diferencia entre subir seis fotos y abandonar a la tercera.
 *
 * EL ARCHIVO ORIGINAL SE SUBE IGUAL, a una subcarpeta que la política de
 * storage no deja borrar. Si mañana hay que reprocesar, o si alguien
 * reclama que su foto fue alterada, el original está.
 *
 * La subida va directa del navegador a Supabase Storage, sin pasar por
 * el servidor de la aplicación: así no la limita el tamaño máximo de
 * cuerpo de una petición y se puede mostrar el avance real.
 */

export type FotoDelAviso = {
  id: string;
  url: string;
  alt?: string;
  /** Solo una por aviso. Sin ella, la primera de la lista hace de portada. */
  portada: boolean;
};

type EnCurso = { id: string; nombre: string; avance: number; error?: string };

/**
 * Reduce y convierte a WebP con un canvas.
 *
 * Devuelve null si el navegador no puede —un formato que no sabe
 * decodificar, memoria insuficiente— y entonces se sube el archivo tal
 * cual: es preferible una foto pesada a ninguna foto.
 */
async function comprimir(archivo: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));

    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;

    const pincel = lienzo.getContext('2d');
    if (!pincel) return null;

    pincel.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close();

    return await new Promise((resolver) =>
      lienzo.toBlob((blob) => resolver(blob), 'image/webp', CALIDAD),
    );
  } catch {
    return null;
  }
}

export function Fotos({
  carpeta,
  fotos,
  onCambio,
}: {
  /** Identificador del borrador o del aviso: es la carpeta en storage. */
  carpeta: string;
  fotos: FotoDelAviso[];
  onCambio: (fotos: FotoDelAviso[]) => void;
}) {
  const [enCurso, setEnCurso] = useState<EnCurso[]>([]);
  const [error, setError] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  async function subir(archivos: FileList) {
    setError(null);
    const supabase = clienteNavegador();
    const nuevas: FotoDelAviso[] = [];

    const espacio = FOTOS_MAXIMAS - fotos.length;
    if (archivos.length > espacio) {
      setError(
        `Puedes tener hasta ${FOTOS_MAXIMAS} fotos. Se subirán las primeras ${espacio}.`,
      );
    }

    for (const archivo of Array.from(archivos).slice(0, Math.max(espacio, 0))) {
      const revision = revisarFoto(archivo);
      if (!revision.ok) {
        setError(revision.error);
        continue;
      }

      const marca = Date.now() + Math.round(performance.now());
      const clave = `${marca}`;

      setEnCurso((v) => [...v, { id: clave, nombre: archivo.name, avance: 10 }]);

      try {
        // 1. El original, primero. Si algo falla después, al menos el
        //    archivo tal como lo subieron quedó guardado.
        const rutaOriginal = rutaDeFoto(carpeta, marca, true);
        await supabase.storage.from('avisos').upload(rutaOriginal, archivo, {
          contentType: archivo.type,
          upsert: false,
        });

        setEnCurso((v) => v.map((e) => (e.id === clave ? { ...e, avance: 45 } : e)));

        // 2. La versión que se muestra.
        const comprimida = await comprimir(archivo);
        const cuerpo = comprimida ?? archivo;
        const ruta = comprimida ? rutaDeFoto(carpeta, marca) : `${carpeta}/${marca}.bin`;

        setEnCurso((v) => v.map((e) => (e.id === clave ? { ...e, avance: 70 } : e)));

        const { error: fallo } = await supabase.storage.from('avisos').upload(ruta, cuerpo, {
          contentType: comprimida ? 'image/webp' : archivo.type,
          upsert: false,
        });

        if (fallo) throw fallo;

        const {
          data: { publicUrl },
        } = supabase.storage.from('avisos').getPublicUrl(ruta);

        nuevas.push({ id: clave, url: publicUrl, alt: '', portada: false });
        setEnCurso((v) => v.filter((e) => e.id !== clave));
      } catch {
        setEnCurso((v) =>
          v.map((e) => (e.id === clave ? { ...e, error: 'No se pudo subir' } : e)),
        );
        setError(`No pudimos subir "${archivo.name}". Reintenta en un momento.`);
      }
    }

    if (nuevas.length > 0) {
      const todas = [...fotos, ...nuevas];
      // La primera foto es la portada mientras nadie elija otra.
      if (!todas.some((f) => f.portada) && todas[0]) todas[0].portada = true;
      onCambio(todas);
    }

    if (entrada.current) entrada.current.value = '';
  }

  function mover(indice: number, paso: number) {
    const destino = indice + paso;
    if (destino < 0 || destino >= fotos.length) return;

    const copia = [...fotos];
    const [movida] = copia.splice(indice, 1);
    if (movida) copia.splice(destino, 0, movida);
    onCambio(copia);
  }

  function hacerPortada(id: string) {
    onCambio(fotos.map((f) => ({ ...f, portada: f.id === id })));
  }

  /**
   * Quitar una foto del aviso.
   *
   * Se borra la versión que se muestra, no el original: la política de
   * storage tampoco lo permitiría. El original se conserva mientras el
   * aviso exista y cae con él.
   */
  async function quitar(foto: FotoDelAviso) {
    const restantes = fotos.filter((f) => f.id !== foto.id);
    if (foto.portada && restantes[0]) restantes[0].portada = true;
    onCambio(restantes);

    try {
      const supabase = clienteNavegador();
      await supabase.storage.from('avisos').remove([rutaDeFoto(carpeta, Number(foto.id))]);
    } catch {
      // Si el archivo queda huérfano no es grave: no se ve en ningún
      // lado y una tarea de limpieza lo recoge después.
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="border-linea hover:border-fucsia flex cursor-pointer flex-col items-center justify-center rounded-2xl border-[1.5px] border-dashed bg-white px-6 py-10 text-center transition-colors">
          <span className="text-tinta text-[16px] font-bold">Sube tus fotos</span>
          <span className="text-tinta-60 mt-1 text-[14px]">
            JPG, PNG o WEBP. Hasta 15 MB cada una.
          </span>
          <span className="text-tinta-45 mt-0.5 text-[13px]">
            Mínimo {FOTOS_MINIMAS} · Máximo {FOTOS_MAXIMAS}
          </span>
          <input
            ref={entrada}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            onChange={(e) => e.target.files && void subir(e.target.files)}
            className="sr-only"
          />
        </label>

        <p className="text-tinta-45 mt-2 text-[12.5px]">
          Las achicamos para que carguen rápido, y guardamos tu archivo original tal como lo
          subiste.
        </p>
      </div>

      {error && <Aviso tono="mal">{error}</Aviso>}

      {enCurso.length > 0 && (
        <ul className="flex flex-col gap-2">
          {enCurso.map((subida) => (
            <li key={subida.id} className="border-linea rounded-xl border bg-white p-3">
              <div className="flex items-center justify-between text-[13.5px]">
                <span className="text-tinta truncate font-semibold">{subida.nombre}</span>
                <span className="cifra text-tinta-60">
                  {subida.error ?? `${subida.avance}%`}
                </span>
              </div>
              <div className="bg-niebla mt-2 h-1.5 overflow-hidden rounded-full">
                <div
                  className={cn(
                    'h-full transition-[width]',
                    subida.error ? 'bg-fucsia' : 'bg-turquesa',
                  )}
                  style={{ width: `${subida.avance}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {fotos.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {fotos.map((foto, i) => (
            <li
              key={foto.id}
              className="border-linea overflow-hidden rounded-2xl border bg-white"
            >
              <div className="bg-niebla relative aspect-[4/3]">
                {/* Viene de Storage y cambia de tamaño con el diseño: <img> alcanza. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={foto.url}
                  alt={foto.alt || `Foto ${i + 1} del aviso`}
                  className="size-full object-cover"
                />
                {foto.portada && (
                  <span className="bg-fucsia absolute top-2 left-2 rounded-full px-2.5 py-1 text-[11.5px] font-bold text-white">
                    Portada
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2 p-3">
                <label className="solo-lectores" htmlFor={`alt-${foto.id}`}>
                  Descripción de la foto {i + 1}
                </label>
                <input
                  id={`alt-${foto.id}`}
                  type="text"
                  value={foto.alt ?? ''}
                  maxLength={160}
                  placeholder="Qué se ve en la foto (para quien no puede verla)"
                  onChange={(e) =>
                    onCambio(
                      fotos.map((f) => (f.id === foto.id ? { ...f, alt: e.target.value } : f)),
                    )
                  }
                  className="border-linea bg-niebla text-tinta focus:border-fucsia rounded-xl border-[1.5px] px-3 py-2 text-[14px] focus:outline-none"
                />

                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => mover(i, -1)}
                    disabled={i === 0}
                    className="border-linea text-tinta-60 hover:border-tinta-40 rounded-lg border px-2.5 py-1.5 text-[13px] font-semibold disabled:opacity-40"
                  >
                    ←<span className="solo-lectores">Mover antes</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => mover(i, 1)}
                    disabled={i === fotos.length - 1}
                    className="border-linea text-tinta-60 hover:border-tinta-40 rounded-lg border px-2.5 py-1.5 text-[13px] font-semibold disabled:opacity-40"
                  >
                    →<span className="solo-lectores">Mover después</span>
                  </button>
                  {!foto.portada && (
                    <button
                      type="button"
                      onClick={() => hacerPortada(foto.id)}
                      className="border-linea text-tinta-60 hover:border-fucsia hover:text-fucsia rounded-lg border px-2.5 py-1.5 text-[13px] font-semibold"
                    >
                      Hacer portada
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void quitar(foto)}
                    className="text-fucsia-osc hover:bg-fucsia-suave ml-auto rounded-lg px-2.5 py-1.5 text-[13px] font-semibold"
                  >
                    Quitar
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
