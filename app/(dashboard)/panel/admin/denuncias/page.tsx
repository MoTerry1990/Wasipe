import Link from 'next/link';
import { requiereSeccionDeAdmin } from '@/lib/auth/personal';
import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import { EstadoVacio } from '@/components/estados/estado-vacio';
import { DecisionDeModeracion } from '@/features/admin/decision-de-moderacion';
import { MOTIVO_DENUNCIA } from '@/lib/etiquetas';
import { enlaceDeAviso } from '@/lib/avisos/enlace';
import { fecha } from '@/lib/formato';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Denuncias', robots: { index: false } };

/**
 * Denuncias sobre avisos.
 *
 * Cada denuncia llega junto al aviso y a los botones de decisión: quien
 * modera puede resolverla sin salir de acá. No se muestra quién denunció
 * —solo el motivo y el detalle—: si el nombre estuviera a la vista, nadie
 * volvería a denunciar el aviso de su vecino.
 */
export default async function Denuncias() {
  await requiereSeccionDeAdmin('denuncias');

  if (!supabaseConfigurado()) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl">Denuncias</h1>
        <div className="mt-7">
          <EstadoVacio
            titulo="Sin conexión con la base"
            descripcion="Falta enlazar el proyecto de Supabase."
            accion={{ texto: 'Volver a administración', href: '/panel/admin' }}
          />
        </div>
      </div>
    );
  }

  const supabase = await clienteServidor();

  const { data: denuncias } = await supabase
    .from('reports')
    .select('id, property_id, reason, detail, status, created_at')
    .in('status', ['open', 'reviewing'])
    .order('created_at', { ascending: true })
    .limit(50);

  const abiertas = denuncias ?? [];

  const { data: avisos } = abiertas.length
    ? await supabase
        .from('properties')
        .select(
          'id, code, title, district, operation, property_type, total_area, publication_status',
        )
        .in(
          'id',
          abiertas.map((d) => d.property_id),
        )
    : { data: [] };

  const porId = new Map((avisos ?? []).map((a) => [a.id, a]));

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/panel/admin" className="text-tinta-60 text-[14px] underline">
        ← Administración
      </Link>

      <h1 className="mt-3 text-3xl">Denuncias</h1>
      <p className="text-tinta-60 mt-2">
        Las más antiguas primero. No mostramos quién denunció: con el nombre a la vista, nadie
        volvería a denunciar el aviso de su vecino.
      </p>

      {abiertas.length === 0 ? (
        <div className="mt-7">
          <EstadoVacio
            titulo="No hay denuncias abiertas"
            descripcion="Cuando alguien denuncie un aviso, aparecerá acá."
            accion={{ texto: 'Volver a administración', href: '/panel/admin' }}
          />
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {abiertas.map((denuncia) => {
            const aviso = porId.get(denuncia.property_id);

            return (
              <li key={denuncia.id}>
                <Tarjeta className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Insignia tono="maiz">{MOTIVO_DENUNCIA[denuncia.reason]}</Insignia>
                    <span className="text-tinta-45 text-[13px]">
                      {fecha(denuncia.created_at)}
                    </span>
                  </div>

                  {aviso ? (
                    <p className="text-tinta mt-2 text-[15px] font-bold">
                      <Link href={enlaceDeAviso(aviso)} className="hover:text-fucsia">
                        {aviso.title}
                      </Link>{' '}
                      <span className="text-tinta-45 cifra text-[13px] font-normal">
                        {aviso.code}
                      </span>
                    </p>
                  ) : (
                    <p className="text-tinta-45 mt-2 text-[14px]">
                      El aviso ya no está disponible.
                    </p>
                  )}

                  {denuncia.detail && (
                    <p className="text-tinta-70 mt-1.5 text-[14px]">«{denuncia.detail}»</p>
                  )}

                  {aviso && (
                    <div className="border-linea mt-3 border-t pt-3">
                      <DecisionDeModeracion propiedadId={aviso.id} />
                    </div>
                  )}
                </Tarjeta>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
