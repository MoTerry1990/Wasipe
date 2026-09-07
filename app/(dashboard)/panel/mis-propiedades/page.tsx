import Link from 'next/link';
import { requiereSeccion } from '@/lib/auth/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import { EstadoVacio } from '@/components/estados/estado-vacio';
import { Aviso } from '@/components/estados/estado-error';
import { AccionesDelAviso } from '@/features/publicar/acciones-aviso';
import { enlaceDeAviso } from '@/lib/avisos/enlace';
import { Boton } from '@/components/ui/boton';
import { dinero, porMetro, fechaCorta } from '@/lib/formato';
import { ESTADO_PUBLICACION, OPERACION, TIPO_INMUEBLE } from '@/lib/etiquetas';
import type { EstadoPublicacion } from '@/types/base-datos';

export const metadata = { title: 'Mis propiedades' };

/** Color de la insignia según en qué punto del flujo está el aviso. */
const TONO: Record<EstadoPublicacion, 'neutro' | 'verde' | 'fucsia' | 'maiz'> = {
  draft: 'neutro',
  in_review: 'maiz',
  published: 'verde',
  rejected: 'fucsia',
  paused: 'neutro',
  expired: 'neutro',
  archived: 'neutro',
};

export default async function MisPropiedades({
  searchParams,
}: {
  searchParams: Promise<{ enviado?: string }>;
}) {
  await requiereSeccion('/panel/mis-propiedades');
  const parametros = await searchParams;
  const supabase = await clienteServidor();

  // Sin filtro por dueño a propósito: la RLS ya limita a los avisos
  // propios y a los de la inmobiliaria de la que la persona es miembro.
  const { data: avisos } = await supabase
    .from('properties')
    .select(
      'id, code, title, district, operation, property_type, currency, price, price_per_m2, publication_status, status, rejection_reason, views_count, inquiries_count, created_at, built_area, total_area',
    )
    .order('created_at', { ascending: false });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl">Mis propiedades</h1>
        <Boton href="/publicar">Publicar un aviso</Boton>
      </div>

      {parametros.enviado === '1' && (
        <div className="mt-5">
          <Aviso tono="bien">
            Enviamos tu aviso a revisión. Lo mira una persona del equipo y te avisamos cuando
            esté publicado; si hay algo que corregir, te decimos qué.
          </Aviso>
        </div>
      )}

      {!avisos || avisos.length === 0 ? (
        <div className="mt-7">
          <EstadoVacio
            titulo="Todavía no publicaste nada"
            descripcion="Publicar tu primer aviso es gratis y toma unos minutos. Con tres fotos y el precio ya alcanza para empezar."
            accion={{ texto: 'Publicar mi primer aviso', href: '/publicar' }}
          />
        </div>
      ) : (
        <ul className="mt-7 flex flex-col gap-3">
          {avisos.map((aviso) => (
            <li key={aviso.id}>
              <Tarjeta className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <Insignia tono={TONO[aviso.publication_status]}>
                        {ESTADO_PUBLICACION[aviso.publication_status]}
                      </Insignia>
                      <span className="cifra text-tinta-45 text-[13px]">{aviso.code}</span>
                    </div>

                    {/* Solo lo publicado tiene ficha pública que enlazar. */}
                    {aviso.publication_status === 'published' ? (
                      <Link
                        href={enlaceDeAviso(aviso)}
                        className="text-tinta hover:text-fucsia text-[17px] font-bold"
                      >
                        {aviso.title}
                      </Link>
                    ) : (
                      <span className="text-tinta text-[17px] font-bold">{aviso.title}</span>
                    )}

                    <p className="text-tinta-60 mt-1 text-[14px]">
                      {TIPO_INMUEBLE[aviso.property_type]} en {aviso.district} ·{' '}
                      {OPERACION[aviso.operation]} · creado el {fechaCorta(aviso.created_at)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="cifra text-tinta text-xl font-bold">
                      {dinero(aviso.price, aviso.currency)}
                    </p>
                    {aviso.price_per_m2 !== null && (
                      <p className="cifra text-tinta-60 mt-0.5 text-[13.5px]">
                        {porMetro(aviso.price_per_m2, aviso.currency)}
                      </p>
                    )}
                  </div>
                </div>

                <p className="border-linea text-tinta-60 mt-3 border-t pt-3 text-[13.5px]">
                  <span className="cifra text-tinta font-bold">{aviso.views_count}</span>{' '}
                  visitas ·{' '}
                  <span className="cifra text-tinta font-bold">{aviso.inquiries_count}</span>{' '}
                  consultas
                </p>

                <AccionesDelAviso
                  avisoId={aviso.id}
                  estado={aviso.publication_status}
                  disponibilidad={aviso.status}
                  motivoRechazo={aviso.rejection_reason}
                />

                <div className="mt-3 flex flex-wrap gap-4">
                  <Link
                    href={`/panel/mis-propiedades/${aviso.code}/fotos`}
                    className="text-turquesa-osc text-[13.5px] font-bold underline"
                  >
                    Fotos y Wasi AI
                  </Link>
                  <Link
                    href={`/panel/mis-propiedades/${aviso.code}/video`}
                    className="text-turquesa-osc text-[13.5px] font-bold underline"
                  >
                    Hacer un video
                  </Link>
                </div>
              </Tarjeta>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
