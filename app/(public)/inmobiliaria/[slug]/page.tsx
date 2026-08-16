import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { Contenedor } from '@/components/ui/contenedor';
import { Insignia } from '@/components/ui/tarjeta';
import { Migas, DatosEstructurados } from '@/components/ui/migas';
import { SeccionAvisos } from '@/components/propiedades/seccion-avisos';
import { inmobiliariaPorSlug, avisosDeInmobiliaria } from '@/lib/consultas/inmobiliaria';
import { tipoDeCambio } from '@/lib/consultas/portada';
import { monedaPreferida } from '@/lib/preferencias';
import { inmobiliaria as inmobiliariaJsonLd, listaDeAvisos } from '@/lib/seo/estructurados';
import { enlaceDeAviso } from '@/lib/avisos/enlace';
import { ESTADO_VERIFICACION } from '@/lib/etiquetas';
import { fecha } from '@/lib/formato';

type Props = { params: Promise<{ slug: string }> };

/**
 * Perfil público de una inmobiliaria.
 *
 * Es la página que una inmobiliaria manda por WhatsApp cuando alguien le
 * pregunta «¿ustedes quiénes son?», así que lo primero tiene que ser si
 * está verificada o no, y desde cuándo publica. Lo demás es su catálogo.
 *
 * Solo se indexa si tiene avisos: un perfil vacío es una página sin
 * contenido con el nombre de una empresa, que es justo lo que Google
 * castiga y lo que además no le sirve a la inmobiliaria.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const agencia = await inmobiliariaPorSlug(slug);

  if (!agencia) {
    return { title: 'Inmobiliaria no encontrada', robots: { index: false } };
  }

  const avisos = await avisosDeInmobiliaria(agencia.id);
  const verificada = agencia.verification_status === 'verified';

  const descripcion =
    agencia.description?.trim() ||
    `${agencia.name} publica ${avisos.length} ${avisos.length === 1 ? 'propiedad' : 'propiedades'} en Wasipe${verificada ? ', con verificación de Wasipe' : ''}. Mira su catálogo con el precio por m² de cada aviso.`;

  return {
    title: agencia.name,
    description: descripcion.slice(0, 300),
    alternates: { canonical: `/inmobiliaria/${agencia.slug}` },
    robots: avisos.length === 0 ? { index: false, follow: true } : undefined,
    openGraph: {
      type: 'profile',
      title: agencia.name,
      description: descripcion.slice(0, 300),
      url: `/inmobiliaria/${agencia.slug}`,
      ...(agencia.logo_url ? { images: [{ url: agencia.logo_url, alt: agencia.name }] } : {}),
    },
  };
}

export default async function PerfilDeInmobiliaria({ params }: Props) {
  const { slug } = await params;
  const agencia = await inmobiliariaPorSlug(slug);
  if (!agencia) notFound();

  const [avisos, cambio, moneda] = await Promise.all([
    avisosDeInmobiliaria(agencia.id),
    tipoDeCambio(),
    monedaPreferida(),
  ]);

  const verificada = agencia.verification_status === 'verified';

  return (
    <Contenedor className="py-8">
      <DatosEstructurados
        datos={[
          inmobiliariaJsonLd({
            nombre: agencia.name,
            slug: agencia.slug,
            descripcion: agencia.description,
            logo: agencia.logo_url,
            telefono: agencia.phone,
            sitioWeb: agencia.website,
            verificada,
          }),
          ...(avisos.length > 0
            ? [
                listaDeAvisos(
                  `Propiedades de ${agencia.name}`,
                  avisos.map((a) => enlaceDeAviso(a)),
                  avisos.length,
                ),
              ]
            : []),
        ]}
      />

      <Migas
        pasos={[
          { texto: 'Inicio', href: '/' },
          { texto: 'Inmobiliarias', href: '/busquedas' },
          { texto: agencia.name },
        ]}
      />

      <header className="mt-4 flex flex-wrap items-start gap-5">
        {agencia.logo_url && (
          <Image
            src={agencia.logo_url}
            alt={`Logo de ${agencia.name}`}
            width={88}
            height={88}
            className="border-linea size-22 shrink-0 rounded-2xl border bg-white object-contain p-2"
          />
        )}

        <div className="min-w-0 flex-1">
          <h1 className="text-[clamp(1.6rem,3.6vw,2.25rem)]">{agencia.name}</h1>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {verificada ? (
              <Insignia tono="verde">{ESTADO_VERIFICACION.verified}</Insignia>
            ) : (
              <Insignia tono="neutro">Sin verificar</Insignia>
            )}
            <span className="text-tinta-45 text-[13.5px]">
              Publica en Wasipe desde el {fecha(agencia.created_at)}
            </span>
          </div>

          {agencia.description && (
            <p className="text-tinta-70 mt-3 max-w-[62ch]">{agencia.description}</p>
          )}

          {/* El teléfono va como enlace `tel:`, que en un celular llama de
              un toque. El correo no se muestra: es lo que primero cosechan
              los robots de spam. */}
          <div className="mt-3 flex flex-wrap gap-4 text-[14.5px]">
            {agencia.phone && (
              <a href={`tel:${agencia.phone}`} className="text-fucsia font-semibold">
                {agencia.phone}
              </a>
            )}
            {agencia.website && (
              <a
                href={agencia.website}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-tinta-60 hover:text-fucsia underline"
              >
                Sitio web
                <span className="solo-lectores">
                  {' '}
                  de {agencia.name}, se abre en otra pestaña
                </span>
              </a>
            )}
          </div>

          {!verificada && (
            <p className="text-tinta-45 mt-3 max-w-[62ch] text-[13.5px]">
              Wasipe todavía no verificó esta inmobiliaria. Que no esté verificada no quiere
              decir que haya algo mal: quiere decir que no lo comprobamos.
            </p>
          )}
        </div>
      </header>

      <div className="mt-10">
        <SeccionAvisos
          id="propiedades"
          titulo={`Propiedades de ${agencia.name}`}
          avisos={avisos}
          moneda={moneda}
          tipoDeCambio={cambio}
          prioridad
          vacio={{
            titulo: 'Todavía no tiene propiedades publicadas',
            descripcion: 'Cuando publique la primera, aparecerá acá.',
            accion: { texto: 'Ver todas las búsquedas', href: '/busquedas' },
          }}
        />
      </div>
    </Contenedor>
  );
}
