import type { Metadata } from 'next';
import { Tarjeta } from '@/components/ui/tarjeta';
import { FormularioNuevaClave } from '@/features/cuentas/formulario-recuperacion';

export const metadata: Metadata = {
  title: 'Contraseña nueva',
  robots: { index: false, follow: false },
};

/**
 * Segundo paso de la recuperación.
 *
 * Se llega desde el enlace del correo, que el Route Handler de
 * /auth/callback ya canjeó por una sesión. Sin esa sesión el formulario
 * responde que el enlace venció, en vez de fallar en silencio.
 */
export default function NuevaClave() {
  return (
    <Tarjeta className="w-full max-w-[26rem] p-7">
      <h1 className="text-2xl">Crea una contraseña nueva</h1>
      <p className="text-tinta-60 mt-2 mb-6 text-[14.5px]">
        Elige una que recuerdes. Una frase corta funciona mejor que una palabra rara.
      </p>
      <FormularioNuevaClave />
    </Tarjeta>
  );
}
