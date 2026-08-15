import { requiereSeccion } from '@/lib/auth/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import { EstadoVacio, EnConstruccion } from '@/components/estados/estado-vacio';
import { ESTADO_VERIFICACION, ROL } from '@/lib/etiquetas';
import { fechaCorta } from '@/lib/formato';
import { SubirLogo } from '@/features/inmobiliarias/subir-logo';

export const metadata = { title: 'Inmobiliaria' };

/**
 * Base del panel de inmobiliaria.
 *
 * Por ahora: datos de la empresa, logo y equipo. La asignación de avisos
 * entre corredores y los informes por corredor vienen después; lo que sí
 * queda armado es el modelo de permisos, que es lo difícil de cambiar
 * más adelante.
 */
export default async function PanelInmobiliaria() {
  const perfil = await requiereSeccion('/panel/inmobiliaria');
  const supabase = await clienteServidor();

  // La RLS de agencies deja ver las inmobiliarias de las que la persona
  // es miembro. Se pide la que administra.
  const { data: membresias } = await supabase
    .from('agency_members')
    .select('role, can_publish, joined_at, agencies (*)')
    .eq('user_id', perfil.id);

  const primera = membresias?.[0];
  const agencia = primera?.agencies as unknown as {
    id: string;
    name: string;
    slug: string;
    ruc: string | null;
    logo_url: string | null;
    phone: string | null;
    email: string | null;
    description: string | null;
    verification_status: 'unverified' | 'in_progress' | 'verified' | 'rejected';
  } | null;

  if (!agencia) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl">Inmobiliaria</h1>
        <div className="mt-7">
          <EstadoVacio
            titulo="Todavía no registraste tu inmobiliaria"
            descripcion="Al registrarla puedes sumar a tu equipo de corredores y que los avisos salgan a nombre de la empresa."
            accion={{ texto: 'Ir a configuración', href: '/panel/configuracion' }}
          />
        </div>
      </div>
    );
  }

  const { data: equipo } = await supabase
    .from('agency_members')
    .select('user_id, role, can_publish, joined_at')
    .eq('agency_id', agencia.id);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl">{agencia.name}</h1>
        <Insignia tono={agencia.verification_status === 'verified' ? 'verde' : 'neutro'}>
          {ESTADO_VERIFICACION[agencia.verification_status]}
        </Insignia>
      </div>

      <Tarjeta className="mt-7 p-6">
        <h2 className="mb-4 text-lg">Logo</h2>
        <SubirLogo agencia={agencia.id} logo={agencia.logo_url} nombre={agencia.name} />
      </Tarjeta>

      <Tarjeta className="mt-4 p-6">
        <h2 className="mb-3 text-lg">Datos de la empresa</h2>
        <dl className="grid gap-3 text-[14.5px] sm:grid-cols-2">
          <div>
            <dt className="text-tinta-45">RUC</dt>
            <dd className="cifra text-tinta font-bold">{agencia.ruc ?? 'Sin registrar'}</dd>
          </div>
          <div>
            <dt className="text-tinta-45">Teléfono</dt>
            <dd className="cifra text-tinta font-bold">{agencia.phone ?? 'Sin registrar'}</dd>
          </div>
          <div>
            <dt className="text-tinta-45">Correo</dt>
            <dd className="text-tinta font-bold">{agencia.email ?? 'Sin registrar'}</dd>
          </div>
          <div>
            <dt className="text-tinta-45">Dirección en Wasipe</dt>
            <dd className="text-tinta font-bold">wasipe.pe/{agencia.slug}</dd>
          </div>
        </dl>
      </Tarjeta>

      <Tarjeta className="mt-4 p-6">
        <h2 className="mb-3 text-lg">Equipo</h2>
        <ul className="flex flex-col gap-2">
          {(equipo ?? []).map((miembro) => (
            <li
              key={miembro.user_id}
              className="border-linea flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-[14.5px] last:border-0 last:pb-0"
            >
              <span className="text-tinta font-semibold">
                {miembro.user_id === perfil.id
                  ? `${perfil.full_name} (tú)`
                  : 'Corredor del equipo'}
              </span>
              <span className="text-tinta-60">
                {ROL[miembro.role]} · desde {fechaCorta(miembro.joined_at)}
                {miembro.can_publish ? ' · puede publicar' : ' · solo consulta'}
              </span>
            </li>
          ))}
        </ul>
      </Tarjeta>

      <div className="mt-8">
        <EnConstruccion
          titulo="Falta la parte de gestión del equipo"
          descripcion="Invitar corredores, repartir avisos entre ellos y ver el rendimiento de cada uno llega en un sprint próximo."
          mientrasTanto={{ texto: 'Volver al resumen', href: '/panel' }}
        />
      </div>
    </div>
  );
}
