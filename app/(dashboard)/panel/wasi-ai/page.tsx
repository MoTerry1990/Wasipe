import Link from 'next/link';
import { requiereSeccion } from '@/lib/auth/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import { EnConstruccion } from '@/components/estados/estado-vacio';
import { TRABAJO_IA, AVISO_ESTIMACION, ETIQUETA_IA } from '@/lib/etiquetas';
import { OPERACIONES, esOperacion } from '@/lib/ia/asistente';
import { iaDisponible } from '@/lib/ia/registro';
import { fecha } from '@/lib/formato';

export const metadata = { title: 'Wasi AI' };

export default async function WasiAiPanel() {
  await requiereSeccion('/panel/wasi-ai');
  const supabase = await clienteServidor();

  const { data: trabajos } = await supabase
    .from('ai_jobs')
    .select('id, kind, operation, status, cost_credits, accepted_at, discarded_at, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  const encendida = iaDisponible();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl">Wasi AI</h1>
      <p className="text-tinta-60 mt-2">
        Redacción del aviso, mejora de fotos, amoblado virtual y estimación de precio.
      </p>

      {encendida ? (
        <Tarjeta className="mt-7 p-6">
          <Insignia tono="verde">Redacción de avisos activa</Insignia>
          <h2 className="mt-3 text-lg">Ya puedes usarla</h2>
          <p className="text-tinta-70 mt-2 text-[14.5px]">
            En el paso «Descripción» del asistente de publicación, Wasi AI te propone títulos y
            te escribe la descripción con los datos que ya cargaste. Nada entra al aviso hasta
            que aprietes «Usar este texto».
          </p>
          <Link
            href="/publicar"
            className="text-turquesa-osc mt-4 inline-block text-[14.5px] font-bold underline"
          >
            Ir a publicar
          </Link>
        </Tarjeta>
      ) : (
        <div className="mt-7">
          <EnConstruccion
            titulo="Wasi AI está apagado en esta instalación"
            descripcion="La redacción de avisos ya está construida; falta configurar el proveedor. Mientras tanto, publicar a mano funciona igual de bien."
            mientrasTanto={{ texto: 'Ver qué hará Wasi AI', href: '/wasi-ai' }}
          />
        </div>
      )}

      <Tarjeta className="mt-6 p-6">
        <h2 className="text-lg">Nuestras reglas</h2>
        <ul className="text-tinta-70 mt-3 flex flex-col gap-2.5 text-[14.5px]">
          <li>
            · Wasi AI redacta solo con lo que tú cargaste. No afirma que la propiedad está
            saneada, que la construcción está en buen estado ni que la zona es segura.
          </li>
          <li>· Ningún texto entra al aviso sin que tú lo aceptes.</li>
          <li>· Tus fotos originales se conservan siempre; la versión editada va aparte.</li>
          <li>
            · Toda imagen modificada lleva su etiqueta a la vista: &laquo;{ETIQUETA_IA}&raquo;.
          </li>
          <li>
            · El amoblado virtual nunca tapa una humedad, una rajadura ni ningún defecto de la
            construcción.
          </li>
          <li>· {AVISO_ESTIMACION}</li>
        </ul>
      </Tarjeta>

      {trabajos && trabajos.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-xl">Tus pedidos</h2>
          <ul className="flex flex-col gap-2">
            {trabajos.map((trabajo) => (
              <li key={trabajo.id}>
                <Tarjeta className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-tinta text-[15px] font-bold">
                      {trabajo.operation && esOperacion(trabajo.operation)
                        ? OPERACIONES[trabajo.operation].etiqueta
                        : TRABAJO_IA[trabajo.kind]}
                    </p>
                    <p className="text-tinta-45 text-[13px]">
                      {fecha(trabajo.created_at)}
                      {trabajo.cost_credits > 0
                        ? ` · ${trabajo.cost_credits} crédito${trabajo.cost_credits === 1 ? '' : 's'}`
                        : ' · sin costo'}
                    </p>
                  </div>
                  <Insignia
                    tono={
                      trabajo.accepted_at
                        ? 'verde'
                        : trabajo.status === 'failed'
                          ? 'fucsia'
                          : 'neutro'
                    }
                  >
                    {trabajo.accepted_at
                      ? 'Aplicado'
                      : trabajo.discarded_at
                        ? 'Descartado'
                        : trabajo.status === 'failed'
                          ? 'No salió'
                          : 'Sin aplicar'}
                  </Insignia>
                </Tarjeta>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
