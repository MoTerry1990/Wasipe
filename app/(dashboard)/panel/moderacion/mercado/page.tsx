import { requiereSeccion } from '@/lib/auth/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import { EstadoVacio } from '@/components/estados/estado-vacio';
import { BotonRecalcular } from '@/features/mercado/boton-recalcular';
import { MUESTRA_MINIMA } from '@/lib/mercado/evaluacion';
import { fecha, numero, porMetro } from '@/lib/formato';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Índice de mercado', robots: { index: false } };

/**
 * Estado del índice de mercado.
 *
 * Lo primero que se ve es cuándo se calculó: un índice de hace tres
 * semanas se ve igual de convincente que uno de hoy, y esa es justamente
 * la trampa que esta pantalla evita.
 */
export default async function MercadoAdmin() {
  await requiereSeccion('/panel/moderacion/mercado');

  if (!supabaseConfigurado()) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl">Índice de mercado</h1>
        <div className="mt-7">
          <EstadoVacio
            titulo="Sin conexión con la base"
            descripcion="Falta enlazar el proyecto de Supabase."
            accion={{ texto: 'Volver al panel', href: '/panel' }}
          />
        </div>
      </div>
    );
  }

  const supabase = await clienteServidor();

  const { data: filas } = await supabase
    .from('market_stats')
    .select('*')
    .eq('period', 'm12')
    .is('property_type', null)
    .order('listings', { ascending: false })
    .limit(30);

  const todas = filas ?? [];
  const conDatos = todas.filter((f) => f.sufficient);
  const calculado = todas[0]?.computed_at ?? null;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl">Índice de mercado</h1>
      <p className="text-tinta-60 mt-2">
        El precio por m² por distrito. Se recalcula entero: se borra y se reescribe, así que
        nunca queda una fila vieja mezclada con una nueva.
      </p>

      <Tarjeta className="mt-6 p-5">
        <div className="flex flex-wrap items-center gap-3">
          {calculado ? (
            <>
              <Insignia tono="verde">Calculado el {fecha(calculado)}</Insignia>
              <span className="text-tinta-60 text-[14px]">
                {numero(conDatos.length)} de {numero(todas.length)} distritos con muestra
                suficiente
              </span>
            </>
          ) : (
            <Insignia tono="maiz">Nunca se calculó</Insignia>
          )}
        </div>

        <div className="mt-4">
          <BotonRecalcular />
        </div>

        <p className="text-tinta-45 mt-3 text-[12.5px]">
          Entran solo los avisos publicados y disponibles. Se descartan los atípicos por vallas
          intercuartílicas, y un distrito con menos de {MUESTRA_MINIMA} avisos queda sin cifra.
        </p>
      </Tarjeta>

      {todas.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-xl">Distritos, del más al menos representado</h2>
          <ul className="flex flex-col gap-2">
            {todas.map((fila) => (
              <li key={`${fila.district}-${fila.operation}`}>
                <Tarjeta className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-tinta text-[15px] font-bold">
                      {fila.district}{' '}
                      <span className="text-tinta-45 font-normal">
                        {fila.operation === 'rent' ? 'alquiler' : 'venta'}
                      </span>
                    </p>
                    <p className="text-tinta-45 text-[13px]">
                      {numero(fila.listings)} avisos
                      {fila.outliers > 0 && ` · ${numero(fila.outliers)} atípicos fuera`}
                    </p>
                  </div>

                  {fila.sufficient && fila.median_usd_per_m2 ? (
                    <p className="cifra text-turquesa-osc font-bold">
                      {porMetro(Number(fila.median_usd_per_m2), 'USD')}
                    </p>
                  ) : (
                    <Insignia tono="neutro">Sin cifra</Insignia>
                  )}
                </Tarjeta>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
