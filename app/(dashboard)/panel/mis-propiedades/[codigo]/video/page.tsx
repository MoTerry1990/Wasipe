import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requiereSeccion } from '@/lib/auth/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import { EstudioDeVideo } from '@/features/wasi-ai/estudio-de-video';
import { videoDisponible } from '@/lib/ia/registro';
import { FORMATOS, PLANTILLAS, esFormato, esPlantilla } from '@/lib/ia/video';
import { fecha } from '@/lib/formato';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Video del aviso', robots: { index: false } };

/**
 * Estudio de video de un aviso.
 *
 * Arriba, el estudio: se elige formato y plantilla, se ve la previa y
 * recién ahí se gastan créditos. Abajo, los videos ya hechos, con su
 * fecha de vencimiento a la vista: un video con un precio de hace medio
 * año circulando por WhatsApp es un problema, y por eso caducan.
 */
export default async function VideoDelAviso({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  await requiereSeccion('/panel/mis-propiedades');
  const { codigo } = await params;

  if (!supabaseConfigurado()) notFound();

  const supabase = await clienteServidor();

  // La RLS limita a los avisos que esta persona administra.
  const { data: aviso } = await supabase
    .from('properties')
    .select('id, code, title')
    .eq('code', codigo)
    .maybeSingle();

  if (!aviso) notFound();

  const { data: videos } = await supabase
    .from('property_videos')
    .select('id, format, template, status, duration_ms, expires_at, downloads, created_at')
    .eq('property_id', aviso.id)
    .order('created_at', { ascending: false })
    .limit(12);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/panel/mis-propiedades" className="text-tinta-60 text-[14px] underline">
        ← Mis propiedades
      </Link>

      <h1 className="mt-3 text-3xl">Video de {aviso.title}</h1>
      <p className="text-tinta-60 mt-2">
        Un video con tus fotos y los datos de tu aviso, listo para WhatsApp y redes.
      </p>

      <div className="mt-7">
        <EstudioDeVideo propiedadId={aviso.id} encendido={videoDisponible()} />
      </div>

      {videos && videos.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 text-xl">Videos que ya hiciste</h2>
          <ul className="flex flex-col gap-2">
            {videos.map((video) => (
              <li key={video.id}>
                <Tarjeta className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0">
                    <p className="text-tinta text-[15px] font-bold">
                      {esFormato(video.format) ? FORMATOS[video.format].etiqueta : video.format}{' '}
                      ·{' '}
                      {esPlantilla(video.template)
                        ? PLANTILLAS[video.template].etiqueta
                        : video.template}
                    </p>
                    <p className="text-tinta-45 text-[13px]">
                      {fecha(video.created_at)}
                      {video.duration_ms ? ` · ${Math.round(video.duration_ms / 1000)} s` : ''}
                      {video.downloads > 0 ? ` · ${video.downloads} descargas` : ''}
                    </p>
                  </div>

                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <EstadoDelVideo estado={video.status} />
                    {video.expires_at && video.status === 'ready' && (
                      <span className="text-tinta-45 text-[13px]">
                        vence el {fecha(video.expires_at)}
                      </span>
                    )}
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

function EstadoDelVideo({ estado }: { estado: string }) {
  if (estado === 'ready') return <Insignia tono="verde">Listo</Insignia>;
  if (estado === 'rendering' || estado === 'queued') {
    return <Insignia tono="maiz">Armándose</Insignia>;
  }
  if (estado === 'failed') return <Insignia tono="fucsia">No salió</Insignia>;
  if (estado === 'canceled') return <Insignia tono="neutro">Cancelado</Insignia>;
  // Vencido no es un error: es lo que tenía que pasar.
  return <Insignia tono="neutro">Vencido</Insignia>;
}
