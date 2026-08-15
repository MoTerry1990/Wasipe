'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Campo } from '@/components/ui/campo';
import { Aviso } from '@/components/estados/estado-error';
import { BotonEnviar } from '@/features/cuentas/campos';
import { ingresar, type Estado } from '@/features/cuentas/acciones';

const INICIAL: Estado = {};

export function FormularioIngreso() {
  const [estado, accion] = useActionState(ingresar, INICIAL);
  const parametros = useSearchParams();

  const volver = parametros.get('volver') ?? '';
  const aviso = parametros.get('aviso');

  return (
    <form action={accion} className="flex flex-col gap-4" noValidate>
      {aviso === 'enlace-vencido' && (
        <Aviso tono="mal">
          Ese enlace venció o ya se usó. Pide uno nuevo desde &laquo;Olvidé mi
          contraseña&raquo;.
        </Aviso>
      )}

      {estado.mensaje && <Aviso tono="mal">{estado.mensaje}</Aviso>}

      <input type="hidden" name="volver" value={volver} />

      <Campo
        etiqueta="Correo"
        type="email"
        name="correo"
        autoComplete="email"
        placeholder="tucorreo@ejemplo.com"
        error={estado.errores?.correo}
        required
      />

      <div>
        <Campo
          etiqueta="Contraseña"
          type="password"
          name="clave"
          autoComplete="current-password"
          error={estado.errores?.clave}
          required
        />
        <p className="mt-1.5 text-right text-[13.5px]">
          <Link href="/recuperar" className="text-tinta-60 hover:text-fucsia font-semibold">
            Olvidé mi contraseña
          </Link>
        </p>
      </div>

      <BotonEnviar>Iniciar sesión</BotonEnviar>
    </form>
  );
}
