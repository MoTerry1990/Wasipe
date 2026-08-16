import Link from 'next/link';
import { requiereSeccionDeAdmin } from '@/lib/auth/personal';
import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import { EstadoVacio } from '@/components/estados/estado-vacio';
import { DecisionDeModeracion } from '@/features/admin/decision-de-moderacion';
import { BANDERAS, esBandera, LAS_BANDERAS_NO_DECIDEN } from '@/lib/admin/permisos';
import { enlaceDeAviso } from '@/lib/avisos/enlace';
import { OPERACION, TIPO_INMUEBLE } from '@/lib/etiquetas';
import { dinero, fecha, metros, porMetro } from '@/lib/formato';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Avisos por revisar', robots: { index: false } };

/**
 * La cola de moderación.
 *
 * Cada aviso llega con lo que hace falta para decidir sin abrir cinco
 * pestañas: los datos, el precio por m², las banderas que le pusieron las
 * comprobaciones automáticas y el enlace a la ficha.
 *
 * Las banderas se muestran ARRIBA de la decisión, con qué mirar en cada
 * caso. Muchas son falsas, y una persona que no sabe qué está mirando
 * termina rechazando por las dudas.
 */
export default async function ColaDeModeracion() {
  await requiereSeccionDeAdmin('avisos');

  if (!supabaseConfigurado()) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl">Avisos por revisar</h1>
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

  const { data: avisos } = await supabase
    .from('properties')
    .select(
      'id, code, title, description, district, province, operation, property_type, currency, price, price_per_m2, total_area, bedrooms, bathrooms, parking, submitted_at, created_at, owner_id',
    )
    .eq('publication_status', 'in_review')
    .order('submitted_at', { ascending: true })
    .limit(40);

  const cola = avisos ?? [];

  const { data: banderas } = cola.length
    ? await supabase
        .from('moderation_flags')
        .select('id, property_id, kind, detail, score')
        .eq('status', 'open')
        .in(
          'property_id',
          cola.map((a) => a.id),
        )
    : { data: [] };

  const porAviso = new Map<string, typeof banderas>();
  for (const bandera of banderas ?? []) {
    porAviso.set(bandera.property_id, [...(porAviso.get(bandera.property_id) ?? []), bandera]);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/panel/admin" className="text-tinta-60 text-[14px] underline">
        ← Administración
      </Link>

      <h1 className="mt-3 text-3xl">Avisos por revisar</h1>
      <p className="text-tinta-60 mt-2">
        Los más antiguos primero: quien envió hace tres días viene esperando más.
      </p>

      {cola.length === 0 ? (
        <div className="mt-7">
          <EstadoVacio
            titulo="No hay nada por revisar"
            descripcion="Cuando alguien envíe un aviso a revisión, aparecerá acá."
            accion={{ texto: 'Volver a administración', href: '/panel/admin' }}
          />
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {cola.map((aviso) => {
            const suyas = porAviso.get(aviso.id) ?? [];

            return (
              <li key={aviso.id}>
                <Tarjeta className="p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-lg">{aviso.title}</h2>
                    <span className="text-tinta-45 cifra text-[13px]">{aviso.code}</span>
                  </div>

                  <p className="text-tinta-60 mt-1 text-[14px]">
                    {TIPO_INMUEBLE[aviso.property_type]} · {OPERACION[aviso.operation]} ·{' '}
                    {aviso.district}, {aviso.province}
                  </p>

                  <p className="text-tinta mt-2 text-[15px]">
                    <span className="cifra font-bold">
                      {dinero(aviso.price, aviso.currency)}
                    </span>{' '}
                    · {metros(aviso.total_area)}
                    {aviso.price_per_m2 && (
                      <>
                        {' '}
                        ·{' '}
                        <span className="text-turquesa-osc cifra font-bold">
                          {porMetro(aviso.price_per_m2, aviso.currency)}
                        </span>
                      </>
                    )}
                  </p>

                  <p className="text-tinta-70 mt-2 line-clamp-3 text-[14px]">
                    {aviso.description}
                  </p>

                  <p className="text-tinta-45 mt-2 text-[12.5px]">
                    Enviado el {fecha(aviso.submitted_at ?? aviso.created_at)} ·{' '}
                    <Link href={enlaceDeAviso(aviso)} className="underline">
                      ver la ficha completa
                    </Link>
                  </p>

                  {suyas.length > 0 && (
                    <div className="border-linea mt-4 rounded-xl border p-3">
                      <p className="text-tinta text-[13.5px] font-bold">
                        Las comprobaciones automáticas marcaron esto:
                      </p>
                      <ul className="mt-2 flex flex-col gap-2">
                        {suyas.map((bandera) => (
                          <li key={bandera.id} className="text-[13.5px]">
                            <Insignia tono="maiz">
                              {esBandera(bandera.kind)
                                ? BANDERAS[bandera.kind].etiqueta
                                : bandera.kind}
                            </Insignia>{' '}
                            <span className="text-tinta-60">
                              {esBandera(bandera.kind) ? BANDERAS[bandera.kind].queMirar : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-tinta-45 mt-2 text-[12px]">
                        {LAS_BANDERAS_NO_DECIDEN}
                      </p>
                    </div>
                  )}

                  <div className="border-linea mt-4 border-t pt-4">
                    <DecisionDeModeracion propiedadId={aviso.id} />
                  </div>
                </Tarjeta>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
