'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Campo } from '@/components/ui/campo';
import { Aviso } from '@/components/estados/estado-error';
import { BotonEnviar } from '@/features/cuentas/campos';
import { registrarse, type Estado } from '@/features/cuentas/acciones';

const INICIAL: Estado = {};

export function FormularioRegistro() {
  const [estado, accion] = useActionState(registrarse, INICIAL);

  // Cuando el registro sale bien pero hace falta confirmar el correo, se
  // reemplaza el formulario por el aviso: dejar los campos ahí invita a
  // volver a enviarlo y a pedir un segundo correo sin necesidad.
  if (estado.ok && estado.mensaje) {
    return (
      <div className="flex flex-col gap-4">
        <Aviso tono="bien">{estado.mensaje}</Aviso>
        <p className="text-tinta-60 text-[14.5px]">
          ¿Te equivocaste de dirección?{' '}
          <Link href="/registrarse" className="text-fucsia font-bold hover:underline">
            Empezar de nuevo
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={accion} className="flex flex-col gap-4" noValidate>
      {estado.mensaje && <Aviso tono="mal">{estado.mensaje}</Aviso>}

      <Campo
        etiqueta="Nombre y apellido"
        name="nombre"
        autoComplete="name"
        placeholder="Rosa Quispe"
        error={estado.errores?.nombre}
        required
      />

      <Campo
        etiqueta="Correo"
        type="email"
        name="correo"
        autoComplete="email"
        placeholder="tucorreo@ejemplo.com"
        pista="Te enviaremos un enlace para confirmar la cuenta."
        error={estado.errores?.correo}
        required
      />

      <Campo
        etiqueta="Contraseña"
        type="password"
        name="clave"
        autoComplete="new-password"
        pista="Mínimo 8 caracteres. Una frase que recuerdes funciona mejor que una palabra rara."
        error={estado.errores?.clave}
        required
      />

      <label className="text-tinta-60 flex items-start gap-2.5 text-[14px]">
        <input
          type="checkbox"
          name="terminos"
          className="mt-0.5 size-4 accent-[var(--color-fucsia)]"
        />
        <span>
          Acepto los términos de uso y la política de privacidad de Wasipe.
          {estado.errores?.terminos && (
            <span className="text-fucsia-osc mt-1 block font-semibold" role="alert">
              {estado.errores.terminos}
            </span>
          )}
        </span>
      </label>

      <BotonEnviar enCurso="Creando tu cuenta…">Crear mi cuenta</BotonEnviar>

      <p className="text-tinta-45 text-center text-[13.5px]">
        Publicar tu primer aviso es gratis y no pedimos tarjeta.
      </p>
    </form>
  );
}
