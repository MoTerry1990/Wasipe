'use client';

import { useState } from 'react';
import { Campo } from '@/components/ui/campo';
import { Boton } from '@/components/ui/boton';
import { Aviso } from '@/components/estados/estado-error';

/**
 * Formulario de ingreso.
 *
 * La autenticación llega en el Sprint 4 con Supabase Auth. Hasta entonces
 * el formulario valida en el cliente y avisa con claridad en vez de
 * fingir un envío que no ocurre.
 */
export function FormularioIngreso() {
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [enviado, setEnviado] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setEnviado(true);
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      {enviado && (
        <Aviso>
          El ingreso todavía no está disponible en esta versión. Lo activamos en el próximo
          sprint, junto con las cuentas.
        </Aviso>
      )}

      <Campo
        etiqueta="Correo"
        type="email"
        name="correo"
        autoComplete="email"
        required
        placeholder="tucorreo@ejemplo.com"
        value={correo}
        onChange={(e) => setCorreo(e.target.value)}
      />

      <Campo
        etiqueta="Contraseña"
        type="password"
        name="clave"
        autoComplete="current-password"
        required
        value={clave}
        onChange={(e) => setClave(e.target.value)}
      />

      <Boton type="submit" tamano="lg" full>
        Iniciar sesión
      </Boton>
    </form>
  );
}
