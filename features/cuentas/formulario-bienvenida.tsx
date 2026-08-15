'use client';

import { useActionState } from 'react';
import { Campo } from '@/components/ui/campo';
import { Aviso } from '@/components/estados/estado-error';
import { BotonEnviar, Opciones, Etiquetas } from '@/features/cuentas/campos';
import { completarBienvenida, type Estado } from '@/features/cuentas/acciones';
import { TIPOS_DE_CUENTA } from '@/lib/auth/roles';
import { DISTRITOS_POPULARES } from '@/config/sitio';

const INICIAL: Estado = {};

const CONTACTO = [
  { valor: 'whatsapp', titulo: 'WhatsApp', detalle: 'Lo más rápido, y casi todos lo usan.' },
  { valor: 'phone', titulo: 'Llamada', detalle: 'Prefiero que me llamen.' },
  { valor: 'email', titulo: 'Correo', detalle: 'Sin apuro, respondo cuando puedo.' },
] as const;

const INTENCION = [
  { valor: 'buy', titulo: 'Quiero comprar' },
  { valor: 'rent', titulo: 'Quiero alquilar' },
  { valor: 'sell', titulo: 'Quiero vender' },
  { valor: 'rent_out', titulo: 'Quiero poner en alquiler' },
  { valor: 'invest', titulo: 'Estoy viendo para invertir' },
] as const;

/**
 * Bienvenida: seis preguntas, una sola pantalla.
 *
 * Se pide lo mínimo para que el panel tenga sentido desde el primer día
 * y para poder mandar alertas útiles. Nada de esto se vuelve a preguntar
 * después, y todo se puede cambiar luego en Configuración.
 */
export function FormularioBienvenida({
  nombre,
  distritos = [],
}: {
  nombre: string;
  distritos?: readonly string[];
}) {
  const [estado, accion] = useActionState(completarBienvenida, INICIAL);

  return (
    <form action={accion} className="flex flex-col gap-7" noValidate>
      {estado.mensaje && <Aviso tono="mal">{estado.mensaje}</Aviso>}

      <Opciones
        nombre="rol"
        leyenda="¿Qué te trae a Wasipe?"
        error={estado.errores?.rol}
        opciones={TIPOS_DE_CUENTA.map((t) => ({
          valor: t.rol,
          titulo: t.titulo,
          detalle: t.detalle,
        }))}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="¿Cómo te llamas?"
          name="nombre"
          defaultValue={nombre}
          autoComplete="name"
          error={estado.errores?.nombre}
          required
        />
        <Campo
          etiqueta="Celular"
          name="celular"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="987654321"
          pista="Nueve dígitos, empieza con 9."
          error={estado.errores?.celular}
          required
        />
      </div>

      <Opciones
        nombre="contacto"
        leyenda="¿Cómo prefieres que te contacten?"
        valorInicial="whatsapp"
        columnas={2}
        error={estado.errores?.contacto}
        opciones={CONTACTO}
      />

      <Opciones
        nombre="intencion"
        leyenda="¿Qué estás buscando ahora?"
        columnas={2}
        error={estado.errores?.intencion}
        opciones={INTENCION}
      />

      <Etiquetas
        nombre="distritos"
        leyenda="Distritos que te interesan"
        ayuda="Opcional. Con esto te avisamos cuando aparece algo nuevo por ahí."
        opciones={DISTRITOS_POPULARES.map((d) => d.nombre)}
        seleccionadas={distritos}
        error={estado.errores?.distritos}
      />

      <BotonEnviar enCurso="Guardando…">Entrar a mi panel</BotonEnviar>
    </form>
  );
}
