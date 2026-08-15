'use client';

import { useFormStatus } from 'react-dom';
import { Boton } from '@/components/ui/boton';
import { cerrarSesion } from '@/features/cuentas/acciones';

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" variante="secundario" disabled={pending}>
      {pending ? 'Cerrando…' : 'Cerrar sesión'}
    </Boton>
  );
}

/**
 * Cerrar sesión va en un formulario, no en un enlace.
 *
 * Con un enlace, cualquier sitio podría cerrarle la sesión a la persona
 * incrustando un <img src="/salir">, y además el precargado del
 * navegador la dejaría afuera sola.
 */
export function BotonSalir() {
  return (
    <form action={cerrarSesion}>
      <Enviar />
    </form>
  );
}
