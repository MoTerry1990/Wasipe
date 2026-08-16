import Link from 'next/link';
import { requiereSeccionDeAdmin } from '@/lib/auth/personal';
import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import { EstadoVacio } from '@/components/estados/estado-vacio';
import { PuestosDePersona } from '@/features/admin/formularios';
import { PUESTOS, type PuestoDeWasipe } from '@/lib/admin/permisos';
import { ROL } from '@/lib/etiquetas';
import { fecha } from '@/lib/formato';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Personas y personal', robots: { index: false } };

/**
 * Cuentas y personal.
 *
 * Se muestra el nombre, el rol de mercado y desde cuándo. **No** se
 * muestran el teléfono ni el correo: soporte los necesita cuando atiende
 * un caso puntual, no en una lista de doscientas personas. Un listado que
 * los trae los deja en el HTML de cualquiera que abra la pantalla.
 *
 * Nombrar personal es solo de administración general, y la política de la
 * base dice lo mismo: aunque alguien llamara a la tabla directo, no pasa.
 */
export default async function Usuarios({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { puestos } = await requiereSeccionDeAdmin('usuarios');
  const { q } = await searchParams;
  const busqueda = (q ?? '').trim().slice(0, 60);

  const puedeNombrar = puestos.includes('super_admin');

  if (!supabaseConfigurado()) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl">Personas y personal</h1>
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

  let consulta = supabase
    .from('profiles')
    .select('id, full_name, role, is_active, created_at')
    .order('created_at', { ascending: false })
    .limit(40);

  if (busqueda) consulta = consulta.ilike('full_name', `%${busqueda}%`);

  const { data: personas } = await consulta;
  const lista = personas ?? [];

  const { data: equipo } = await supabase.from('staff_members').select('user_id, role');

  const puestosPorPersona = new Map<string, PuestoDeWasipe[]>();
  for (const fila of equipo ?? []) {
    puestosPorPersona.set(fila.user_id, [
      ...(puestosPorPersona.get(fila.user_id) ?? []),
      fila.role,
    ]);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/panel/admin" className="text-tinta-60 text-[14px] underline">
        ← Administración
      </Link>

      <h1 className="mt-3 text-3xl">Personas y personal</h1>
      <p className="text-tinta-60 mt-2">
        No mostramos teléfonos ni correos en esta lista: soporte los necesita cuando atiende un
        caso, no cuando mira doscientas cuentas.
      </p>

      <form className="mt-5 flex gap-2" action="/panel/admin/usuarios">
        <label className="sr-only" htmlFor="q">
          Buscar por nombre
        </label>
        <input
          id="q"
          name="q"
          defaultValue={busqueda}
          placeholder="Buscar por nombre"
          className="border-linea bg-niebla text-tinta focus:border-fucsia w-full rounded-xl border-[1.5px] px-3.5 py-2.5 text-[14.5px] focus:bg-white focus:outline-none"
        />
        <button
          type="submit"
          className="bg-tinta rounded-xl px-4 py-2.5 text-[14.5px] font-bold text-white"
        >
          Buscar
        </button>
      </form>

      {lista.length === 0 ? (
        <div className="mt-7">
          <EstadoVacio
            titulo="No encontramos a nadie"
            descripcion="Prueba con otra parte del nombre."
            accion={{ texto: 'Ver todas', href: '/panel/admin/usuarios' }}
          />
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-2.5">
          {lista.map((persona) => {
            const suyos = puestosPorPersona.get(persona.id) ?? [];

            return (
              <li key={persona.id}>
                <Tarjeta className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-tinta text-[15px] font-bold">{persona.full_name}</p>
                    <Insignia tono="neutro">{ROL[persona.role]}</Insignia>
                    {!persona.is_active && <Insignia tono="fucsia">Cuenta inactiva</Insignia>}
                    {suyos.map((puesto) => (
                      <Insignia key={puesto} tono="verde">
                        {PUESTOS[puesto].etiqueta}
                      </Insignia>
                    ))}
                  </div>
                  <p className="text-tinta-45 mt-0.5 text-[13px]">
                    En Wasipe desde el {fecha(persona.created_at)}
                  </p>

                  {puedeNombrar && (
                    <div className="border-linea mt-3 border-t pt-3">
                      <PuestosDePersona usuarioId={persona.id} actuales={suyos} />
                    </div>
                  )}
                </Tarjeta>
              </li>
            );
          })}
        </ul>
      )}

      {!puedeNombrar && (
        <p className="text-tinta-45 mt-5 text-[13px]">
          Nombrar o quitar puestos es de administración general.
        </p>
      )}
    </div>
  );
}
