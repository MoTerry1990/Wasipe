import type { Metadata } from 'next';
import Link from 'next/link';
import { Tarjeta } from '@/components/ui/tarjeta';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { perfilOpcional } from '@/lib/auth/sesion';
import { FormularioIngreso } from '@/features/cuentas/formulario-ingreso';

export const metadata: Metadata = {
  title: 'Iniciar sesión',
  description: 'Ingresa a tu cuenta de Wasipe.',
  robots: { index: false, follow: false },
};

/** Con sesión abierta, el formulario no tiene sentido: se va al panel. */
export default async function Ingresar() {
  const perfil = await perfilOpcional();
  if (perfil) {
    redirect(perfil.onboarded_at ? '/panel' : '/bienvenida');
  }

  return (
    <Tarjeta className="w-full max-w-[26rem] p-7">
      <h1 className="text-2xl">Iniciar sesión</h1>
      <p className="text-tinta-60 mt-2 mb-6 text-[14.5px]">
        ¿Todavía no tienes cuenta?{' '}
        <Link href="/publicar" className="text-fucsia font-bold hover:underline">
          Publica gratis
        </Link>
      </p>
      <Suspense fallback={null}>
        <FormularioIngreso />
      </Suspense>
    </Tarjeta>
  );
}
