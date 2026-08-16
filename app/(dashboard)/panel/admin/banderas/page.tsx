import Link from 'next/link';
import { requiereSeccionDeAdmin } from '@/lib/auth/personal';
import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import { EstadoVacio } from '@/components/estados/estado-vacio';
import { ResolverBandera, VolverAMarcar } from '@/features/admin/formularios';
import { BANDERAS, esBandera, LAS_BANDERAS_NO_DECIDEN } from '@/lib/admin/permisos';
import { enlaceDeAviso } from '@/lib/avisos/enlace';
import { fecha, numero } from '@/lib/formato';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Banderas', robots: { index: false } };

/**
 * Banderas de moderación.
 *
 * Lo primero que se lee es que una bandera no decide nada. Es a
 * propósito: una lista de avisos «marcados» invita a actuar sobre todos,
 * y la mayoría son falsas —dos departamentos parecidos del mismo
 * edificio, una inmobiliaria republicando su propia foto—.
 */
export default async function Banderas() {
  await requiereSeccionDeAdmin('banderas');

  if (!supabaseConfigurado()) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl">Banderas</h1>
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

  const { data: banderas } = await supabase
    .from('moderation_flags')
    .select('id, property_id, kind, detail, score, created_at')
    .eq('status', 'open')
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(50);

  const abiertas = banderas ?? [];

  const { data: avisos } = abiertas.length
    ? await supabase
        .from('properties')
        .select('id, code, title, district, publication_status, operation, property_type, total_area')
        .in(
          'id',
          abiertas.map((b) => b.property_id),
        )
    : { data: [] };

  const porId = new Map((avisos ?? []).map((a) => [a.id, a]));

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/panel/admin" className="text-tinta-60 text-[14px] underline">
        ← Administración
      </Link>

      <h1 className="mt-3 text-3xl">Banderas</h1>
      <p className="text-tinta-60 mt-2">{LAS_BANDERAS_NO_DECIDEN}</p>

      {abiertas.length === 0 ? (
        <div className="mt-7">
          <EstadoVacio
            titulo="No hay banderas abiertas"
            descripcion="Las comprobaciones automáticas marcan duplicados, precios raros y fotos repetidas cuando alguien envía un aviso a revisión."
            accion={{ texto: 'Volver a administración', href: '/panel/admin' }}
          />
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {abiertas.map((bandera) => {
            const aviso = porId.get(bandera.property_id);
            const detalle = bandera.detail as Record<string, unknown>;

            return (
              <li key={bandera.id}>
                <Tarjeta className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Insignia tono={bandera.score >= 75 ? 'fucsia' : 'maiz'}>
                      {esBandera(bandera.kind) ? BANDERAS[bandera.kind].etiqueta : bandera.kind}
                    </Insignia>
                    <span className="text-tinta-45 text-[13px]">
                      prioridad <span className="cifra">{numero(bandera.score)}</span> ·{' '}
                      {fecha(bandera.created_at)}
                    </span>
                  </div>

                  {aviso ? (
                    <p className="text-tinta mt-2 text-[15px] font-bold">
                      <Link href={enlaceDeAviso(aviso)} className="hover:text-fucsia">
                        {aviso.title}
                      </Link>{' '}
                      <span className="text-tinta-45 cifra text-[13px] font-normal">
                        {aviso.code} · {aviso.district}
                      </span>
                    </p>
                  ) : (
                    <p className="text-tinta-45 mt-2 text-[14px]">
                      El aviso ya no está disponible.
                    </p>
                  )}

                  <p className="text-tinta-60 mt-1 text-[13.5px]">
                    {esBandera(bandera.kind) ? BANDERAS[bandera.kind].queMirar : ''}
                  </p>

                  {Object.keys(detalle).length > 0 && (
                    <dl className="text-tinta-60 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                      {Object.entries(detalle).map(([clave, valor]) => (
                        <div key={clave} className="flex gap-1.5">
                          <dt className="font-bold">{clave}:</dt>
                          <dd className="cifra">{String(valor)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  <div className="border-linea mt-3 border-t pt-3">
                    <ResolverBandera banderaId={bandera.id} />
                  </div>

                  {aviso && (
                    <div className="mt-2">
                      <VolverAMarcar propiedadId={aviso.id} />
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
