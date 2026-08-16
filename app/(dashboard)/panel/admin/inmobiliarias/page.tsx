import Link from 'next/link';
import { requiereSeccionDeAdmin } from '@/lib/auth/personal';
import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import { EstadoVacio } from '@/components/estados/estado-vacio';
import { VerificarInmobiliaria } from '@/features/admin/formularios';
import { ESTADO_VERIFICACION } from '@/lib/etiquetas';
import { fecha } from '@/lib/formato';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inmobiliarias', robots: { index: false } };

/**
 * Verificación de inmobiliarias.
 *
 * El sello de verificado es una promesa de Wasipe a quien busca, no un
 * adorno de la inmobiliaria. Por eso rechazar exige escribir qué
 * documentación faltó: es lo que la inmobiliaria va a leer y lo que
 * Wasipe va a tener si reclama.
 */
export default async function Inmobiliarias() {
  await requiereSeccionDeAdmin('inmobiliarias');

  if (!supabaseConfigurado()) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl">Inmobiliarias</h1>
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
  const { data: agencias } = await supabase
    .from('agencies')
    .select('id, name, slug, ruc, verification_status, is_active, created_at')
    .order('verification_status', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(50);

  const lista = agencias ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/panel/admin" className="text-tinta-60 text-[14px] underline">
        ← Administración
      </Link>

      <h1 className="mt-3 text-3xl">Inmobiliarias</h1>
      <p className="text-tinta-60 mt-2">
        El sello de verificado es una promesa de Wasipe a quien busca. Verificar sin haber
        mirado la documentación es prestarle esa promesa a cualquiera.
      </p>

      {lista.length === 0 ? (
        <div className="mt-7">
          <EstadoVacio
            titulo="Todavía no hay inmobiliarias"
            descripcion="Cuando alguien registre una, aparecerá acá para verificarla."
            accion={{ texto: 'Volver a administración', href: '/panel/admin' }}
          />
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-2.5">
          {lista.map((agencia) => (
            <li key={agencia.id}>
              <Tarjeta className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-tinta text-[15px] font-bold">{agencia.name}</p>
                  <Insignia
                    tono={
                      agencia.verification_status === 'verified'
                        ? 'verde'
                        : agencia.verification_status === 'rejected'
                          ? 'fucsia'
                          : 'neutro'
                    }
                  >
                    {ESTADO_VERIFICACION[agencia.verification_status]}
                  </Insignia>
                  {!agencia.is_active && <Insignia tono="neutro">Inactiva</Insignia>}
                </div>
                <p className="text-tinta-45 mt-0.5 text-[13px]">
                  {agencia.ruc ? `RUC ${agencia.ruc} · ` : 'Sin RUC cargado · '}
                  registrada el {fecha(agencia.created_at)}
                </p>

                <div className="border-linea mt-3 border-t pt-3">
                  <VerificarInmobiliaria agenciaId={agencia.id} />
                </div>
              </Tarjeta>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
