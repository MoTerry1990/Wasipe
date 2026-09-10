import Link from 'next/link';
import { clienteServidor } from '@/lib/supabase/servidor';
import { membresiaActual, MENSAJE_VARIAS } from '@/lib/proyectos/permisos';
import { Boton } from '@/components/ui/boton';
import { EstadoVacio } from '@/components/estados/estado-vacio';
import { EstadoDeProyecto } from '@/features/proyectos/estado';
import { ETIQUETA_ETAPA } from '@/lib/validacion/proyecto';
import { fechaCorta } from '@/lib/formato';
import type { Proyecto } from '@/types/base-datos';

export const metadata = { title: 'Proyectos' };

/**
 * Los proyectos de la inmobiliaria.
 *
 * Un `agent` los ve todos, incluidos los borradores: necesita conocerlos
 * para responder consultas. Lo que no puede es tocarlos, y esta pantalla
 * no le muestra ningún botón que no vaya a funcionar.
 *
 * Que el botón esté oculto **no es la autorización**: cada acción
 * revalida el permiso por su cuenta. Esto es solo cortesía.
 */
export default async function PanelProyectos() {
  const resultado = await membresiaActual('/panel/proyectos');

  if (resultado.tipo !== 'una') {
    // Los dos casos que no son «una» se explican distinto: quien no
    // pertenece a ninguna inmobiliaria tiene que registrarla; quien
    // pertenece a varias se queda esperando el selector. Mostrar el mismo
    // texto para los dos mandaría a la mitad a hacer algo que no
    // corresponde.
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl">Proyectos</h1>
        <div className="mt-7">
          {resultado.tipo === 'ninguna' ? (
            <EstadoVacio
              titulo="Los proyectos son de una inmobiliaria"
              descripcion="Para publicar un proyecto en preventa o en construcción hay que registrar la inmobiliaria y ser parte de su equipo."
              accion={{ texto: 'Ir a configuración', href: '/panel/configuracion' }}
            />
          ) : (
            <EstadoVacio
              titulo="Perteneces a más de una inmobiliaria"
              descripcion={MENSAJE_VARIAS}
              accion={{ texto: 'Volver al panel', href: '/panel' }}
            />
          )}
        </div>
      </div>
    );
  }

  const membresia = resultado.membresia;

  const supabase = await clienteServidor();
  // La RLS de `projects` ya limita esto a la inmobiliaria de quien mira;
  // el filtro explícito está igual, porque una consulta que depende solo
  // de RLS es una que se rompe en silencio si la política cambia.
  const { data } = await supabase
    .from('projects')
    .select('*')
    .eq('agency_id', membresia.agencyId)
    .order('created_at', { ascending: false });

  const proyectos = (data ?? []) as Proyecto[];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl">Proyectos</h1>
          <p className="text-tinta-60 mt-2">
            Departamentos en preventa y en construcción, con sus tipologías y precios.
          </p>
        </div>
        {membresia.administra && <Boton href="/panel/proyectos/nuevo">Nuevo proyecto</Boton>}
      </div>

      {!membresia.administra && (
        <p className="text-tinta-60 mt-4 text-[14.5px]">
          Estás como corredor: puedes ver los proyectos de tu inmobiliaria, pero editarlos es cosa
          de quien la administra.
        </p>
      )}

      <div className="mt-7">
        {proyectos.length === 0 ? (
          <EstadoVacio
            titulo="Todavía no hay ningún proyecto"
            descripcion={
              membresia.administra
                ? 'Crea el primero. Se guarda como borrador y lo puedes completar cuando quieras.'
                : 'Cuando quien administra la inmobiliaria cree uno, va a aparecer acá.'
            }
            accion={
              membresia.administra
                ? { texto: 'Crear un proyecto', href: '/panel/proyectos/nuevo' }
                : { texto: 'Volver al panel', href: '/panel' }
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {proyectos.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/panel/proyectos/${p.code}`}
                  className="border-linea hover:border-fucsia block rounded-2xl border bg-white p-5 transition-colors"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-tinta text-[16.5px] font-bold">{p.name}</p>
                      <p className="text-tinta-60 mt-0.5 text-[14px]">
                        {p.district}, {p.province} · {ETIQUETA_ETAPA[p.stage]}
                      </p>
                    </div>
                    <div className="flex min-w-0 flex-col items-end gap-1">
                      <EstadoDeProyecto estado={p.publication_status} />
                      <span className="cifra text-tinta-45 text-[13px]">{p.code}</span>
                    </div>
                  </div>
                  <p className="text-tinta-45 mt-3 text-[13px]">
                    Creado el {fechaCorta(p.created_at)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
