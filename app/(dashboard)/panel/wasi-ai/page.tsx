import { requiereSeccion } from '@/lib/auth/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import { EnConstruccion } from '@/components/estados/estado-vacio';
import { TRABAJO_IA, AVISO_ESTIMACION, ETIQUETA_IA } from '@/lib/etiquetas';
import { fecha } from '@/lib/formato';

export const metadata = { title: 'Wasi AI' };

export default async function WasiAiPanel() {
  await requiereSeccion('/panel/wasi-ai');
  const supabase = await clienteServidor();

  const { data: trabajos } = await supabase
    .from('ai_jobs')
    .select('id, kind, status, cost_credits, accepted_at, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl">Wasi AI</h1>
      <p className="text-tinta-60 mt-2">
        Redacción del aviso, mejora de fotos, amoblado virtual y estimación de precio.
      </p>

      <div className="mt-7">
        <EnConstruccion
          titulo="Wasi AI se conecta en el próximo sprint"
          descripcion="La base ya guarda cada pedido, su costo en créditos y si lo aceptaste. Falta enchufar los modelos."
          mientrasTanto={{ texto: 'Ver qué hará Wasi AI', href: '/wasi-ai' }}
        />
      </div>

      <Tarjeta className="mt-6 p-6">
        <h2 className="text-lg">Cómo lo vamos a hacer</h2>
        <ul className="text-tinta-70 mt-3 flex flex-col gap-2.5 text-[14.5px]">
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
                      {TRABAJO_IA[trabajo.kind]}
                    </p>
                    <p className="text-tinta-45 text-[13px]">{fecha(trabajo.created_at)}</p>
                  </div>
                  <Insignia tono={trabajo.accepted_at ? 'verde' : 'neutro'}>
                    {trabajo.accepted_at ? 'Aplicado' : 'Sin aplicar'}
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
