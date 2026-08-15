import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requierePerfil } from '@/lib/auth/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import { Tarjeta } from '@/components/ui/tarjeta';
import { FormularioBienvenida } from '@/features/cuentas/formulario-bienvenida';

/**
 * La salida depende de la sesión, así que nunca se prerenderiza.
 *
 * Sin esto, cuando no hay Supabase configurado Next ve una redirección
 * fija y la deja estática: al conectar la base seguiría sirviendo esa
 * redirección desde la caché.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Bienvenida',
  robots: { index: false, follow: false },
};

/**
 * Bienvenida: se ve una sola vez.
 *
 * Quien ya la terminó va directo al panel. Volver a preguntarle el tipo
 * de cuenta a alguien que ya lo eligió es la clase de detalle que hace
 * sentir un producto descuidado.
 */
export default async function Bienvenida() {
  const perfil = await requierePerfil('/bienvenida');

  if (perfil.onboarded_at) {
    redirect('/panel');
  }

  const supabase = await clienteServidor();
  const { data: distritos } = await supabase
    .from('profile_districts')
    .select('district')
    .eq('user_id', perfil.id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl">Bienvenido a Wasipe</h1>
      <p className="text-tinta-60 mt-2">
        Seis preguntas rápidas para dejarte el panel listo. Todo esto se puede cambiar después.
      </p>

      <Tarjeta className="mt-7 p-6 sm:p-7">
        <FormularioBienvenida
          nombre={perfil.full_name === 'Usuario de Wasipe' ? '' : perfil.full_name}
          distritos={(distritos ?? []).map((d) => d.district)}
        />
      </Tarjeta>
    </div>
  );
}
