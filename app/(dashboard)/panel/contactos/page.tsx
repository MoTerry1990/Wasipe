import { requiereSeccion } from '@/lib/auth/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import { EstadoVacio } from '@/components/estados/estado-vacio';
import { fecha } from '@/lib/formato';
import { ESTADO_CONSULTA } from '@/lib/etiquetas';

export const metadata = { title: 'Contactos' };

/**
 * Bandeja de consultas.
 *
 * Es la sección que la competencia esconde detrás de un plan pago. Acá
 * la persona ve el mensaje completo y el teléfono de quien escribió, sin
 * pagar nada: sin eso, publicar un aviso no sirve de nada.
 */
export default async function Contactos() {
  await requiereSeccion('/panel/contactos');
  const supabase = await clienteServidor();

  // La RLS de inquiries entrega solo las consultas que esta persona
  // recibió o envió. No hace falta filtrar por dueño.
  const { data: consultas } = await supabase
    .from('inquiries')
    .select(
      'id, sender_name, sender_email, sender_phone, message, status, created_at, properties (title, code)',
    )
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl">Contactos</h1>
      <p className="text-tinta-60 mt-2">
        Quienes escribieron por tus avisos, con su número a la vista.
      </p>

      {!consultas || consultas.length === 0 ? (
        <div className="mt-7">
          <EstadoVacio
            titulo="Todavía no te escribió nadie"
            descripcion="Las consultas de tus avisos aparecen acá con el nombre, el teléfono y el mensaje completo."
            accion={{ texto: 'Ver mis avisos', href: '/panel/mis-propiedades' }}
          />
        </div>
      ) : (
        <ul className="mt-7 flex flex-col gap-3">
          {consultas.map((consulta) => {
            const aviso = consulta.properties as unknown as {
              title: string;
              code: string;
            } | null;

            return (
              <li key={consulta.id}>
                <Tarjeta className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-tinta text-[16px] font-bold">{consulta.sender_name}</p>
                      {aviso && (
                        <p className="text-tinta-60 text-[13.5px]">
                          Por {aviso.title} · <span className="cifra">{aviso.code}</span>
                        </p>
                      )}
                    </div>
                    <Insignia tono={consulta.status === 'new' ? 'fucsia' : 'neutro'}>
                      {ESTADO_CONSULTA[consulta.status]}
                    </Insignia>
                  </div>

                  <p className="text-tinta-70 mt-3 text-[15px]">{consulta.message}</p>

                  <div className="border-linea mt-4 flex flex-wrap items-center gap-3 border-t pt-3 text-[14px]">
                    {consulta.sender_phone && (
                      <a
                        href={`https://wa.me/51${consulta.sender_phone}`}
                        className="text-turquesa-osc font-bold hover:underline"
                      >
                        WhatsApp {consulta.sender_phone}
                      </a>
                    )}
                    {consulta.sender_email && (
                      <a
                        href={`mailto:${consulta.sender_email}`}
                        className="text-tinta-60 hover:text-fucsia font-semibold"
                      >
                        {consulta.sender_email}
                      </a>
                    )}
                    <span className="text-tinta-45 ml-auto text-[13px]">
                      {fecha(consulta.created_at)}
                    </span>
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
