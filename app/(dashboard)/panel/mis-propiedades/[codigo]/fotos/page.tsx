import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requiereSeccion } from '@/lib/auth/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import { EditorDeFotos } from '@/features/wasi-ai/editor-de-fotos';
import { imagenDisponible } from '@/lib/ia/registro';
import { EDICIONES, esEdicion } from '@/lib/ia/imagenes';
import type { MedioPropiedad } from '@/types/base-datos';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Fotos del aviso', robots: { index: false } };

/**
 * Fotos de un aviso, con Wasi AI al lado.
 *
 * Arriba las fotos originales, que son las que se pueden mejorar. Abajo
 * las versiones generadas, cada una con su etiqueta y con el estado de
 * la revisión de seguridad. Las dos listas están separadas a propósito:
 * ver de un vistazo qué subió la persona y qué generó la máquina es
 * justamente lo que el producto promete.
 */
export default async function FotosDelAviso({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  await requiereSeccion('/panel/mis-propiedades');
  const { codigo } = await params;

  if (!supabaseConfigurado()) notFound();

  const supabase = await clienteServidor();

  // La RLS limita a los avisos que esta persona administra: si el código
  // es de otra, no aparece y la página responde "no encontrado".
  const { data: aviso } = await supabase
    .from('properties')
    .select('id, code, title')
    .eq('code', codigo)
    .maybeSingle();

  if (!aviso) notFound();

  const { data: medios } = await supabase
    .from('property_media')
    .select(
      'id, url, alt, ai_edited, is_staged, edit_kind, ai_label, review_status, review_reason, original_media_id, created_at',
    )
    .eq('property_id', aviso.id)
    .order('sort_order', { ascending: true });

  const fotos = (medios ?? []) as Pick<
    MedioPropiedad,
    | 'id'
    | 'url'
    | 'alt'
    | 'ai_edited'
    | 'is_staged'
    | 'edit_kind'
    | 'ai_label'
    | 'review_status'
    | 'review_reason'
    | 'original_media_id'
    | 'created_at'
  >[];

  const originales = fotos.filter((f) => !f.ai_edited);
  const editadas = fotos.filter((f) => f.ai_edited);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/panel/mis-propiedades" className="text-tinta-60 text-[14px] underline">
        ← Mis propiedades
      </Link>

      <h1 className="mt-3 text-3xl">Fotos de {aviso.title}</h1>
      <p className="text-tinta-60 mt-2">
        Tus fotos originales se conservan siempre. Lo que hace Wasi AI se agrega aparte, con su
        etiqueta, y solo si tú lo confirmas.
      </p>

      <h2 className="mt-8 mb-3 text-xl">Tus fotos</h2>
      <EditorDeFotos
        fotos={originales.map((f) => ({ id: f.id, url: f.url, alt: f.alt }))}
        encendido={imagenDisponible()}
      />

      {editadas.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 text-xl">Versiones hechas con Wasi AI</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {editadas.map((foto) => (
              <li key={foto.id}>
                <Tarjeta className="overflow-hidden p-0">
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={foto.url}
                      alt={foto.alt ?? 'Versión hecha con Wasi AI'}
                      className="bg-niebla aspect-[4/3] w-full object-cover"
                    />
                    {/* La etiqueta la genera la base; acá solo se pinta. */}
                    {foto.ai_label && (
                      <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2.5 py-1 text-[11.5px] font-bold text-white">
                        {foto.ai_label}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 p-3">
                    {foto.edit_kind && esEdicion(foto.edit_kind) && (
                      <Insignia tono="neutro">{EDICIONES[foto.edit_kind].etiqueta}</Insignia>
                    )}
                    <RevisionDeImagen estado={foto.review_status} motivo={foto.review_reason} />
                  </div>
                </Tarjeta>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * Estado de la revisión de seguridad, contado sin jerga.
 *
 * Una imagen bloqueada deja de verse en el aviso, y quien publica tiene
 * derecho a saber que pasó y por qué. Por eso se muestra acá, con el
 * motivo, en vez de que la foto desaparezca sin explicación.
 */
function RevisionDeImagen({ estado, motivo }: { estado: string; motivo: string | null }) {
  if (estado === 'pending') return <Insignia tono="maiz">En revisión</Insignia>;
  if (estado === 'cleared') return <Insignia tono="verde">Revisada</Insignia>;
  if (estado === 'flagged') {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Insignia tono="maiz">Observada</Insignia>
        {motivo && <span className="text-tinta-60 text-[13px]">{motivo}</span>}
      </span>
    );
  }
  if (estado === 'blocked') {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Insignia tono="fucsia">Retirada</Insignia>
        <span className="text-tinta-60 text-[13px]">
          {motivo ?? 'No se muestra en el aviso.'}
        </span>
      </span>
    );
  }
  return null;
}
