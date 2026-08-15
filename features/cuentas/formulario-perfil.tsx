'use client';

import { useActionState, useRef, useState } from 'react';
import { Campo } from '@/components/ui/campo';
import { Aviso } from '@/components/estados/estado-error';
import { BotonEnviar, Opciones } from '@/features/cuentas/campos';
import { guardarPerfil, subirAvatar, type Estado } from '@/features/cuentas/acciones';
import { revisarImagen, TIPOS_AVATAR, PESO_MAXIMO } from '@/lib/validacion/cuenta';
import type { Perfil } from '@/types/base-datos';

const INICIAL: Estado = {};

const CONTACTO = [
  { valor: 'whatsapp', titulo: 'WhatsApp' },
  { valor: 'phone', titulo: 'Llamada' },
  { valor: 'email', titulo: 'Correo' },
] as const;

export function FormularioPerfil({ perfil }: { perfil: Perfil }) {
  const [estado, accion] = useActionState(guardarPerfil, INICIAL);

  return (
    <form action={accion} className="flex flex-col gap-5" noValidate>
      {estado.mensaje && <Aviso tono={estado.ok ? 'bien' : 'mal'}>{estado.mensaje}</Aviso>}

      <Campo
        etiqueta="Nombre y apellido"
        name="nombre"
        defaultValue={perfil.full_name}
        autoComplete="name"
        error={estado.errores?.nombre}
        required
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Celular"
          name="celular"
          type="tel"
          inputMode="numeric"
          defaultValue={perfil.phone ?? ''}
          placeholder="987654321"
          error={estado.errores?.celular}
        />
        <Campo
          etiqueta="WhatsApp"
          name="whatsapp"
          type="tel"
          inputMode="numeric"
          defaultValue={perfil.whatsapp ?? ''}
          placeholder="987654321"
          pista="Puede ser el mismo número."
          error={estado.errores?.whatsapp}
        />
      </div>

      <Opciones
        nombre="contacto"
        leyenda="¿Cómo prefieres que te contacten?"
        valorInicial={perfil.preferred_contact}
        columnas={2}
        error={estado.errores?.contacto}
        opciones={CONTACTO}
      />

      <div>
        <label htmlFor="bio" className="text-tinta mb-1.5 block text-[14.5px] font-bold">
          Sobre ti
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={4}
          defaultValue={perfil.bio ?? ''}
          maxLength={600}
          placeholder="Cuéntale a quien mire tus avisos quién eres y desde cuándo estás en esto."
          className="border-linea bg-niebla text-tinta placeholder:text-tinta-40 focus:border-fucsia w-full rounded-xl border-[1.5px] px-3.5 py-3 text-base transition-colors focus:bg-white focus:outline-none"
        />
        {estado.errores?.bio && (
          <p className="text-fucsia-osc mt-1.5 text-[13.5px] font-semibold" role="alert">
            {estado.errores.bio}
          </p>
        )}
      </div>

      <div className="sm:max-w-56">
        <BotonEnviar enCurso="Guardando…">Guardar cambios</BotonEnviar>
      </div>
    </form>
  );
}

/**
 * Foto de perfil.
 *
 * La revisión de peso y de tipo se hace acá para dar una respuesta
 * inmediata, y otra vez en el servidor, que es la que cuenta. La cubeta
 * de Supabase tiene además su propio límite declarado.
 */
export function SubirAvatar({ perfil }: { perfil: Perfil }) {
  const [estado, accion] = useActionState(subirAvatar, INICIAL);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const formulario = useRef<HTMLFormElement>(null);

  function alElegir(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;

    const revision = revisarImagen(archivo, TIPOS_AVATAR);
    if (!revision.ok) {
      setErrorLocal(revision.error);
      setVistaPrevia(null);
      evento.target.value = '';
      return;
    }

    setErrorLocal(null);
    setVistaPrevia(URL.createObjectURL(archivo));
    formulario.current?.requestSubmit();
  }

  const imagen = vistaPrevia ?? perfil.avatar_url;
  const mensaje = errorLocal ?? estado.mensaje;

  return (
    <form ref={formulario} action={accion} className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <div className="bg-niebla ring-linea size-20 shrink-0 overflow-hidden rounded-full ring-1">
          {imagen ? (
            // Puede venir de Supabase Storage o de un blob local recién
            // elegido, así que se usa <img> y no next/image.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagen} alt="" className="size-full object-cover" />
          ) : (
            <span className="text-tinta-40 grid size-full place-items-center text-2xl font-bold">
              {perfil.full_name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div>
          <label className="border-linea text-tinta hover:border-tinta-40 inline-flex cursor-pointer items-center rounded-xl border-[1.5px] bg-white px-4 py-2.5 text-[15px] font-bold transition-colors">
            Cambiar foto
            <input
              type="file"
              name="avatar"
              accept={TIPOS_AVATAR.join(',')}
              onChange={alElegir}
              className="sr-only"
            />
          </label>
          <p className="text-tinta-45 mt-1.5 text-[13px]">
            JPG, PNG o WEBP. Hasta {Math.round(PESO_MAXIMO / 1024 / 1024)} MB.
          </p>
        </div>
      </div>

      {mensaje && <Aviso tono={estado.ok && !errorLocal ? 'bien' : 'mal'}>{mensaje}</Aviso>}
    </form>
  );
}
