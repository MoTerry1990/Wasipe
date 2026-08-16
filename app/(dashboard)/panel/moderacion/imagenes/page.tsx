import Link from 'next/link';
import { requiereSeccion } from '@/lib/auth/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import { EstadoVacio } from '@/components/estados/estado-vacio';
import { RevisionDeImagen } from '@/features/wasi-ai/revision-de-imagen';
import { EDICIONES, esEdicion, PROHIBIDO_EN_FOTOS } from '@/lib/ia/imagenes';
import { fecha } from '@/lib/formato';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Revisión de imágenes', robots: { index: false } };

/**
 * Revisión de seguridad de las imágenes generadas.
 *
 * Toda imagen que sale de Wasi AI entra acá en «pendiente». La cola no
 * bloquea la publicación —eso haría inservible la herramienta— pero deja
 * que una persona del equipo mire lo que la máquina hizo y retire lo que
 * no corresponda.
 *
 * Lo que se busca es exactamente lo que el modelo tiene prohibido: una
 * rajadura tapada, una ventana que apareció, un ambiente que creció.
 */
export default async function RevisionDeImagenes() {
  await requiereSeccion('/panel/moderacion/imagenes');

  if (!supabaseConfigurado()) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl">Revisión de imágenes</h1>
        <div className="mt-7">
          <EstadoVacio
            titulo="Sin conexión con la base"
            descripcion="Falta enlazar el proyecto de Supabase."
            accion={{ texto: 'Volver al panel', href: '/panel' }}
          />
        </div>
      </div>
    );
  }

  const supabase = await clienteServidor();

  const { data: pendientes } = await supabase
    .from('property_media')
    .select(
      'id, url, alt, edit_kind, ai_label, review_status, review_reason, created_at, property_id, original_media_id',
    )
    .in('review_status', ['pending', 'flagged'])
    .order('created_at', { ascending: true })
    .limit(60);

  const filas = pendientes ?? [];

  // Las originales de las que salió cada una: sin el antes, el después
  // no dice nada.
  const idsOriginales = filas.map((f) => f.original_media_id).filter(Boolean) as string[];
  const { data: originales } = idsOriginales.length
    ? await supabase.from('property_media').select('id, url').in('id', idsOriginales)
    : { data: [] };

  const porId = new Map((originales ?? []).map((o) => [o.id, o.url]));

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-3xl">Revisión de imágenes</h1>
      <p className="text-tinta-60 mt-2">
        Imágenes generadas con Wasi AI que todavía nadie miró. Retirar una no la borra: deja de
        mostrarse en el aviso y queda el registro de por qué.
      </p>

      <details className="border-linea mt-5 rounded-xl border p-4">
        <summary className="cursor-pointer text-[14.5px] font-bold">Qué buscar</summary>
        <ul className="text-tinta-70 mt-3 flex flex-col gap-2 text-[14px]">
          {PROHIBIDO_EN_FOTOS.map((regla) => (
            <li key={regla}>· {regla}</li>
          ))}
        </ul>
      </details>

      {filas.length === 0 ? (
        <div className="mt-7">
          <EstadoVacio
            titulo="No hay nada por revisar"
            descripcion="Cuando alguien aplique una mejora de Wasi AI a una foto, aparecerá acá."
            accion={{ texto: 'Volver al panel', href: '/panel' }}
          />
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {filas.map((foto) => (
            <li key={foto.id}>
              <Tarjeta className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {foto.edit_kind && esEdicion(foto.edit_kind) && (
                    <Insignia tono="neutro">{EDICIONES[foto.edit_kind].etiqueta}</Insignia>
                  )}
                  {foto.review_status === 'flagged' && (
                    <Insignia tono="maiz">Ya observada</Insignia>
                  )}
                  <span className="text-tinta-45 text-[13px]">{fecha(foto.created_at)}</span>
                  <Link
                    href={`/propiedad/${foto.property_id}`}
                    className="text-tinta-60 ml-auto text-[13px] underline"
                  >
                    Ver el aviso
                  </Link>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <figure className="m-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={porId.get(foto.original_media_id ?? '') ?? foto.url}
                      alt="Foto original"
                      className="bg-niebla aspect-[4/3] w-full rounded-xl object-cover"
                    />
                    <figcaption className="text-tinta-45 mt-1 text-[12.5px]">
                      Original
                    </figcaption>
                  </figure>
                  <figure className="m-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={foto.url}
                      alt={foto.alt ?? 'Imagen generada'}
                      className="bg-niebla aspect-[4/3] w-full rounded-xl object-cover"
                    />
                    <figcaption className="text-tinta-45 mt-1 text-[12.5px]">
                      {foto.ai_label}
                    </figcaption>
                  </figure>
                </div>

                {foto.review_reason && (
                  <p className="text-tinta-60 mt-2 text-[13.5px]">
                    Observación anterior: {foto.review_reason}
                  </p>
                )}

                <div className="mt-3">
                  <RevisionDeImagen mediaId={foto.id} />
                </div>
              </Tarjeta>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
