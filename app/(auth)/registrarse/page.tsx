import type { Metadata } from 'next';
import Link from 'next/link';
import { Tarjeta } from '@/components/ui/tarjeta';
import { redirect } from 'next/navigation';
import { perfilOpcional } from '@/lib/auth/sesion';
import { FormularioRegistro } from '@/features/cuentas/formulario-registro';

export const metadata: Metadata = {
  title: 'Crear cuenta',
  description: 'Crea tu cuenta en Wasipe. Publicar tu primer aviso es gratis.',
  robots: { index: false, follow: false },
};

export default async function Registrarse() {
  const perfil = await perfilOpcional();
  if (perfil) {
    redirect(perfil.onboarded_at ? '/panel' : '/bienvenida');
  }

  return (
    <Tarjeta className="w-full max-w-[26rem] p-7">
      <h1 className="text-2xl">Crear cuenta</h1>
      <p className="text-tinta-60 mt-2 mb-6 text-[14.5px]">
        ¿Ya tienes una?{' '}
        <Link href="/ingresar" className="text-fucsia font-bold hover:underline">
          Iniciar sesión
        </Link>
      </p>
      <FormularioRegistro />
    </Tarjeta>
  );
}
