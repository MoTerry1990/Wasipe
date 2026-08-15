import { requiereSeccion } from '@/lib/auth/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import { Tarjeta } from '@/components/ui/tarjeta';
import { EstadoVacio, EnConstruccion } from '@/components/estados/estado-vacio';

export const metadata = { title: 'Alertas' };

const FRECUENCIA: Record<string, string> = {
  never: 'Sin aviso',
  instant: 'Apenas aparezca',
  daily: 'Un resumen al día',
  weekly: 'Un resumen a la semana',
};

export default async function Alertas() {
  const perfil = await requiereSeccion('/panel/alertas');
  const supabase = await clienteServidor();

  const [busquedas, distritos] = await Promise.all([
    supabase
      .from('saved_searches')
      .select('id, name, alert_frequency, is_active, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('profile_districts')
      .select('district')
      .eq('user_id', perfil.id)
      .order('district'),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl">Alertas</h1>
      <p className="text-tinta-60 mt-2">
        Guarda una búsqueda y te avisamos cuando aparece algo que encaja.
      </p>

      <Tarjeta className="mt-7 p-6">
        <h2 className="text-lg">Tus distritos</h2>
        {distritos.data && distritos.data.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {distritos.data.map((d) => (
              <li
                key={d.district}
                className="bg-turquesa-suave text-turquesa-osc rounded-full px-3.5 py-1.5 text-[14px] font-semibold"
              >
                {d.district}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-tinta-60 mt-2 text-[14.5px]">
            Todavía no elegiste distritos. Los elegiste en la bienvenida y se pueden cambiar en
            Configuración.
          </p>
        )}
      </Tarjeta>

      <h2 className="mt-8 mb-3 text-xl">Búsquedas guardadas</h2>

      {!busquedas.data || busquedas.data.length === 0 ? (
        <EstadoVacio
          titulo="Todavía no guardaste ninguna búsqueda"
          descripcion="Busca lo que te interesa, ajusta los filtros y guárdala. Te avisamos cuando aparezca algo nuevo."
          accion={{ texto: 'Empezar a buscar', href: '/comprar' }}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {busquedas.data.map((busqueda) => (
            <li key={busqueda.id}>
              <Tarjeta className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <p className="text-tinta text-[16px] font-bold">{busqueda.name}</p>
                  <p className="text-tinta-60 text-[13.5px]">
                    {FRECUENCIA[busqueda.alert_frequency] ?? 'Sin aviso'}
                  </p>
                </div>
                <span className="text-tinta-45 text-[13.5px] font-semibold">
                  {busqueda.is_active ? 'Activa' : 'Pausada'}
                </span>
              </Tarjeta>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8">
        <EnConstruccion
          titulo="El envío de alertas todavía no está encendido"
          descripcion="Las búsquedas se guardan bien, pero los correos de aviso llegan cuando conectemos el proveedor de envío."
          mientrasTanto={{ texto: 'Ver mis favoritos', href: '/panel/favoritos' }}
        />
      </div>
    </div>
  );
}
