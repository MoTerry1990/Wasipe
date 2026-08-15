import type { Metadata } from 'next';
import Link from 'next/link';
import { Tarjeta } from '@/components/ui/tarjeta';
import { FormularioRecuperacion } from '@/features/cuentas/formulario-recuperacion';

export const metadata: Metadata = {
  title: 'Recuperar contraseña',
  robots: { index: false, follow: false },
};

export default function Recuperar() {
  return (
    <Tarjeta className="w-full max-w-[26rem] p-7">
      <h1 className="text-2xl">Recuperar contraseña</h1>
      <p className="text-tinta-60 mt-2 mb-6 text-[14.5px]">
        Escribe el correo de tu cuenta y te mandamos un enlace para crear una contraseña nueva.
      </p>
      <FormularioRecuperacion />
      <p className="mt-5 text-center text-[13.5px]">
        <Link href="/ingresar" className="text-tinta-60 hover:text-fucsia font-semibold">
          Volver a iniciar sesión
        </Link>
      </p>
    </Tarjeta>
  );
}
