import type { Metadata } from 'next';
import Link from 'next/link';
import { Tarjeta } from '@/components/ui/tarjeta';
import { FormularioIngreso } from '@/features/cuentas/formulario-ingreso';

export const metadata: Metadata = {
  title: 'Iniciar sesión',
  description: 'Ingresa a tu cuenta de Wasipe.',
  robots: { index: false, follow: false },
};

export default function Ingresar() {
  return (
    <Tarjeta className="w-full max-w-[26rem] p-7">
      <h1 className="text-2xl">Iniciar sesión</h1>
      <p className="mt-2 mb-6 text-[14.5px] text-tinta-60">
        ¿Todavía no tienes cuenta?{' '}
        <Link href="/publicar" className="font-bold text-fucsia hover:underline">
          Publica gratis
        </Link>
      </p>
      <FormularioIngreso />
    </Tarjeta>
  );
}
