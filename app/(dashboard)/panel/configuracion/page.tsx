import { requiereSeccion } from '@/lib/auth/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import { Tarjeta } from '@/components/ui/tarjeta';
import { ROL } from '@/lib/etiquetas';
import { FormularioPerfil, SubirAvatar } from '@/features/cuentas/formulario-perfil';
import { BotonSalir } from '@/features/cuentas/boton-salir';

export const metadata = { title: 'Configuración' };

export default async function Configuracion() {
  const perfil = await requiereSeccion('/panel/configuracion');
  const supabase = await clienteServidor();

  const { data: distritos } = await supabase
    .from('profile_districts')
    .select('district')
    .eq('user_id', perfil.id)
    .order('district');

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl">Configuración</h1>
      <p className="text-tinta-60 mt-2">
        Tu cuenta está registrada como <strong>{ROL[perfil.role]}</strong>.
      </p>

      <Tarjeta className="mt-7 p-6">
        <h2 className="mb-4 text-lg">Foto de perfil</h2>
        <SubirAvatar perfil={perfil} />
      </Tarjeta>

      <Tarjeta className="mt-4 p-6">
        <h2 className="mb-5 text-lg">Tus datos</h2>
        <FormularioPerfil perfil={perfil} />
      </Tarjeta>

      <Tarjeta className="mt-4 p-6">
        <h2 className="text-lg">Distritos que te interesan</h2>
        {distritos && distritos.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {distritos.map((d) => (
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
            Todavía no elegiste ninguno. Los podrás cambiar desde Alertas.
          </p>
        )}
      </Tarjeta>

      <Tarjeta className="mt-4 p-6">
        <h2 className="text-lg">Sesión</h2>
        <p className="text-tinta-60 mt-1.5 mb-4 text-[14.5px]">
          Cierra tu sesión en este dispositivo.
        </p>
        <BotonSalir />
      </Tarjeta>
    </div>
  );
}
