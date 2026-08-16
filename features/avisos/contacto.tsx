'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Campo } from '@/components/ui/campo';
import { Aviso } from '@/components/estados/estado-error';
import { BotonEnviar } from '@/features/cuentas/campos';
import {
  enviarConsulta,
  pedirVisita,
  verTelefono,
  anotarEvento,
} from '@/features/avisos/acciones';
import type { Estado } from '@/features/cuentas/acciones';
import type { Telefono } from '@/lib/avisos/telefono';
import { CAMPO_TRAMPA } from '@/lib/validacion/contacto';
import { cn } from '@/lib/cn';

const INICIAL: Estado = {};

/**
 * Campos que ningún humano ve.
 *
 * El primero es la trampa: un campo real, escondido con CSS y fuera del
 * orden de tabulación. Una persona no lo ve; un robot que completa todo
 * lo que encuentra, sí.
 *
 * El segundo es la marca de tiempo de cuando se dibujó el formulario. Si
 * el envío llega en menos de tres segundos, no lo escribió nadie.
 *
 * Las dos cosas juntas frenan casi todo el correo basura sin ponerle a
 * nadie un captcha delante, que es justo lo que hace que una consulta se
 * abandone a mitad de camino.
 */
function CamposOcultos({ aviso }: { aviso: string }) {
  const marca = useRef<HTMLInputElement>(null);

  // La marca de tiempo se escribe en un efecto y no durante el render:
  // leer el reloj mientras se dibuja hace que el servidor y el navegador
  // produzcan HTML distinto.
  useEffect(() => {
    if (marca.current) marca.current.value = String(Date.now());
  }, []);

  return (
    <>
      <input type="hidden" name="aviso" value={aviso} />
      <input ref={marca} type="hidden" name="abiertoEn" defaultValue="" />
      <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden opacity-0">
        <label htmlFor={CAMPO_TRAMPA}>Apellido materno (dejar vacío)</label>
        <input
          id={CAMPO_TRAMPA}
          name={CAMPO_TRAMPA}
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
    </>
  );
}

function CamposDeContacto({ estado }: { estado: Estado }) {
  return (
    <>
      <Campo
        etiqueta="Tu nombre"
        name="nombre"
        autoComplete="name"
        placeholder="Rosa Quispe"
        error={estado.errores?.nombre}
        required
      />
      <Campo
        etiqueta="Tu celular"
        name="celular"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        placeholder="987654321"
        pista="Es a donde te van a responder."
        error={estado.errores?.celular}
        required
      />
      <Campo
        etiqueta="Tu correo (opcional)"
        name="correo"
        type="email"
        autoComplete="email"
        placeholder="tucorreo@ejemplo.com"
        error={estado.errores?.correo}
      />
    </>
  );
}

/** Consulta o pedido de visita, en dos pestañas. */
export function Contacto({ aviso, titulo }: { aviso: string; titulo: string }) {
  const [pestana, setPestana] = useState<'consulta' | 'visita'>('consulta');
  const [consulta, accionConsulta] = useActionState(enviarConsulta, INICIAL);
  const [visita, accionVisita] = useActionState(pedirVisita, INICIAL);

  const estado = pestana === 'consulta' ? consulta : visita;

  // Cuando el mensaje sale, el formulario se reemplaza por la
  // confirmación: dejar los campos ahí invita a mandarlo de nuevo.
  if (estado.ok && estado.mensaje) {
    return <Aviso tono="bien">{estado.mensaje}</Aviso>;
  }

  return (
    <div>
      <div role="tablist" aria-label="Cómo contactar" className="mb-4 flex gap-1">
        {(
          [
            ['consulta', 'Hacer una consulta'],
            ['visita', 'Pedir una visita'],
          ] as const
        ).map(([cual, texto]) => (
          <button
            key={cual}
            type="button"
            role="tab"
            aria-selected={pestana === cual}
            onClick={() => setPestana(cual)}
            className={cn(
              'rounded-xl px-3.5 py-2 text-[14.5px] font-bold transition-colors',
              pestana === cual
                ? 'bg-fucsia-suave text-fucsia-osc'
                : 'text-tinta-60 hover:text-tinta',
            )}
          >
            {texto}
          </button>
        ))}
      </div>

      {pestana === 'consulta' ? (
        <form action={accionConsulta} className="flex flex-col gap-3.5" noValidate>
          <CamposOcultos aviso={aviso} />
          {estado.mensaje && <Aviso tono="mal">{estado.mensaje}</Aviso>}
          <CamposDeContacto estado={consulta} />

          <div>
            <label
              htmlFor="mensaje"
              className="text-tinta mb-1.5 block text-[14.5px] font-bold"
            >
              Tu mensaje
            </label>
            <textarea
              id="mensaje"
              name="mensaje"
              rows={4}
              required
              defaultValue={`Hola, vi el aviso "${titulo}" en Wasipe y me interesa. ¿Sigue disponible?`}
              className="border-linea bg-niebla text-tinta focus:border-fucsia w-full rounded-xl border-[1.5px] px-3.5 py-3 text-[15px] focus:bg-white focus:outline-none"
            />
            {consulta.errores?.mensaje && (
              <p className="text-fucsia-osc mt-1.5 text-[13.5px] font-semibold" role="alert">
                {consulta.errores.mensaje}
              </p>
            )}
          </div>

          <BotonEnviar enCurso="Enviando…">Enviar consulta</BotonEnviar>
        </form>
      ) : (
        <form action={accionVisita} className="flex flex-col gap-3.5" noValidate>
          <CamposOcultos aviso={aviso} />
          {estado.mensaje && <Aviso tono="mal">{estado.mensaje}</Aviso>}
          <CamposDeContacto estado={visita} />

          <Campo
            etiqueta="¿Qué día te queda bien?"
            name="fecha"
            type="date"
            error={visita.errores?.fecha}
            required
          />

          <div>
            <label
              htmlFor="mensaje-visita"
              className="text-tinta mb-1.5 block text-[14.5px] font-bold"
            >
              Algo más que quieras contarle
            </label>
            <textarea
              id="mensaje-visita"
              name="mensaje"
              rows={3}
              required
              defaultValue="Hola, me gustaría coordinar una visita. ¿Qué horario te acomoda?"
              className="border-linea bg-niebla text-tinta focus:border-fucsia w-full rounded-xl border-[1.5px] px-3.5 py-3 text-[15px] focus:bg-white focus:outline-none"
            />
            {visita.errores?.mensaje && (
              <p className="text-fucsia-osc mt-1.5 text-[13.5px] font-semibold" role="alert">
                {visita.errores.mensaje}
              </p>
            )}
          </div>

          <BotonEnviar enCurso="Enviando…">Pedir la visita</BotonEnviar>
        </form>
      )}

      <p className="text-tinta-45 mt-3 text-[12.5px]">
        Tu número se lo damos solo a quien publica este aviso. No lo vendemos ni lo compartimos
        con nadie más.
      </p>
    </div>
  );
}

/**
 * Ver el teléfono.
 *
 * El número no está en el HTML de la página: se pide al servidor cuando
 * alguien toca el botón. Así no se puede raspar el portal para armar una
 * lista de teléfonos, y quien publica se entera de cuánta gente quiso
 * llamarlo de verdad.
 */
export function VerTelefono({ aviso }: { aviso: string }) {
  const [resultado, setResultado] = useState<Telefono | null>(null);
  const [cargando, setCargando] = useState(false);

  async function pedir() {
    setCargando(true);
    setResultado(await verTelefono(aviso));
    setCargando(false);
  }

  if (resultado?.ok) {
    return (
      <div className="border-linea flex flex-col gap-2 rounded-xl border bg-white p-4">
        <p className="text-tinta-60 text-[13.5px]">Contacto de {resultado.nombre}</p>
        {resultado.telefono ? (
          <a
            href={`tel:+51${resultado.telefono}`}
            className="cifra text-tinta text-xl font-extrabold"
          >
            {resultado.telefono}
          </a>
        ) : (
          <p className="text-tinta-60 text-[14.5px]">
            No dejó un teléfono. Escríbele por el formulario.
          </p>
        )}

        {resultado.whatsapp && (
          <a
            href={`https://wa.me/51${resultado.whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void anotarEvento(aviso, 'whatsapp')}
            className="bg-turquesa hover:bg-turquesa-osc mt-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[15px] font-bold text-white transition-colors"
          >
            Escribir por WhatsApp
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={pedir}
        disabled={cargando}
        className="border-linea text-tinta hover:border-tinta-40 w-full rounded-xl border-[1.5px] bg-white px-4 py-3 text-[15px] font-bold transition-colors disabled:opacity-60"
      >
        {cargando ? 'Un momento…' : 'Ver teléfono'}
      </button>
      {resultado && !resultado.ok && <Aviso tono="mal">{resultado.mensaje}</Aviso>}
    </div>
  );
}
