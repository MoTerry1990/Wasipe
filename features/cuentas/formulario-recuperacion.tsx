'use client';

import { useActionState } from 'react';
import { Campo } from '@/components/ui/campo';
import { Aviso } from '@/components/estados/estado-error';
import { BotonEnviar } from '@/features/cuentas/campos';
import { pedirRecuperacion, cambiarClave, type Estado } from '@/features/cuentas/acciones';

const INICIAL: Estado = {};

/** Paso 1: pedir el enlace por correo. */
export function FormularioRecuperacion() {
  const [estado, accion] = useActionState(pedirRecuperacion, INICIAL);

  if (estado.ok && estado.mensaje) {
    return <Aviso tono="bien">{estado.mensaje}</Aviso>;
  }

  return (
    <form action={accion} className="flex flex-col gap-4" noValidate>
      {estado.mensaje && <Aviso tono="mal">{estado.mensaje}</Aviso>}

      <Campo
        etiqueta="Correo de tu cuenta"
        type="email"
        name="correo"
        autoComplete="email"
        placeholder="tucorreo@ejemplo.com"
        error={estado.errores?.correo}
        required
      />

      <BotonEnviar enCurso="Enviando…">Enviarme el enlace</BotonEnviar>
    </form>
  );
}

/** Paso 2: escribir la contraseña nueva, ya con la sesión del enlace. */
export function FormularioNuevaClave() {
  const [estado, accion] = useActionState(cambiarClave, INICIAL);

  return (
    <form action={accion} className="flex flex-col gap-4" noValidate>
      {estado.mensaje && <Aviso tono="mal">{estado.mensaje}</Aviso>}

      <Campo
        etiqueta="Contraseña nueva"
        type="password"
        name="clave"
        autoComplete="new-password"
        pista="Mínimo 8 caracteres."
        error={estado.errores?.clave}
        required
      />

      <Campo
        etiqueta="Repítela"
        type="password"
        name="repeticion"
        autoComplete="new-password"
        error={estado.errores?.repeticion}
        required
      />

      <BotonEnviar enCurso="Guardando…">Guardar contraseña</BotonEnviar>
    </form>
  );
}
