'use client';

import { useActionState, useState, useSyncExternalStore, useTransition } from 'react';
import { Aviso } from '@/components/estados/estado-error';
import { alternarFavorito, anotarEvento, denunciarAviso } from '@/features/avisos/acciones';
import type { Estado } from '@/features/cuentas/acciones';
import { MOTIVO_DENUNCIA } from '@/lib/etiquetas';
import { cn } from '@/lib/cn';

/**
 * Guardar, compartir, comparar y denunciar.
 *
 * Los cuatro son acciones de un toque, así que responden de inmediato en
 * la pantalla y avisan al servidor después. Esperar la respuesta para
 * pintar un corazón hace que la interfaz se sienta pesada.
 */

const COMPARAR = 'wasipe_comparar';

export function BotonFavorito({
  aviso,
  guardadoInicial,
}: {
  aviso: string;
  guardadoInicial: boolean;
}) {
  const [guardado, setGuardado] = useState(guardadoInicial);
  const [enCurso, empezar] = useTransition();

  return (
    <button
      type="button"
      aria-pressed={guardado}
      disabled={enCurso}
      onClick={() => {
        // Se pinta primero y se confirma después: si el servidor dice
        // otra cosa, se corrige.
        setGuardado((v) => !v);
        empezar(async () => {
          const resultado = await alternarFavorito(aviso);
          setGuardado(resultado.guardado);
        });
      }}
      className={cn(
        'inline-flex items-center gap-2 rounded-xl border-[1.5px] px-4 py-2.5 text-[14.5px] font-bold transition-colors',
        guardado
          ? 'border-fucsia bg-fucsia-suave text-fucsia-osc'
          : 'border-linea text-tinta-60 hover:border-tinta-40 bg-white',
      )}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 20.5s-7.5-4.7-7.5-9.8a4.3 4.3 0 0 1 7.5-2.9 4.3 4.3 0 0 1 7.5 2.9c0 5.1-7.5 9.8-7.5 9.8Z"
          fill={guardado ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      {guardado ? 'Guardado' : 'Guardar'}
    </button>
  );
}

/**
 * Compartir.
 *
 * En el celular usa el menú del sistema, que es donde está WhatsApp —por
 * lejos la forma en que se comparte un aviso en el Perú—. En escritorio
 * copia el enlace, que es lo único que se puede hacer sin instalar nada.
 */
export function BotonCompartir({ aviso, titulo }: { aviso: string; titulo: string }) {
  const [copiado, setCopiado] = useState(false);

  async function compartir() {
    const url = window.location.href;
    void anotarEvento(aviso, 'share');

    if (navigator.share) {
      try {
        await navigator.share({ title: titulo, url });
        return;
      } catch {
        // Se canceló el menú del sistema: no es un error.
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <button
      type="button"
      onClick={compartir}
      className="border-linea text-tinta-60 hover:border-tinta-40 inline-flex items-center gap-2 rounded-xl border-[1.5px] bg-white px-4 py-2.5 text-[14.5px] font-bold transition-colors"
    >
      {copiado ? 'Enlace copiado' : 'Compartir'}
    </button>
  );
}

/**
 * Comparar.
 *
 * La lista vive en el navegador porque es una decisión del momento: se
 * arma mirando tres avisos en una tarde y no tiene sentido guardarla en
 * la cuenta de nadie.
 */
/** Avisa a los botones cuando la lista de comparación cambia. */
const oyentes = new Set<() => void>();

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  window.addEventListener('storage', oyente);
  return () => {
    oyentes.delete(oyente);
    window.removeEventListener('storage', oyente);
  };
}

function listaGuardada() {
  return window.localStorage.getItem(COMPARAR) ?? '';
}

export function BotonComparar({ aviso }: { aviso: string }) {
  // useSyncExternalStore lee el almacenamiento sin escribir estado en un
  // efecto: en el servidor devuelve la cadena vacía, así que el HTML es
  // igual para todos y se puede cachear.
  const lista = useSyncExternalStore(suscribir, listaGuardada, () => '');
  const enLista = lista.split(',').includes(aviso);

  function alternar() {
    const guardados = (window.localStorage.getItem(COMPARAR) ?? '')
      .split(',')
      .filter((v) => v !== '');

    const siguiente = guardados.includes(aviso)
      ? guardados.filter((v) => v !== aviso)
      : [...guardados, aviso].slice(-4);

    window.localStorage.setItem(COMPARAR, siguiente.join(','));
    for (const oyente of oyentes) oyente();
    if (siguiente.includes(aviso)) void anotarEvento(aviso, 'compare');
  }

  return (
    <button
      type="button"
      aria-pressed={enLista}
      onClick={alternar}
      className={cn(
        'inline-flex items-center gap-2 rounded-xl border-[1.5px] px-4 py-2.5 text-[14.5px] font-bold transition-colors',
        enLista
          ? 'border-turquesa bg-turquesa-suave text-turquesa-osc'
          : 'border-linea text-tinta-60 hover:border-tinta-40 bg-white',
      )}
    >
      {enLista ? 'En comparación' : 'Comparar'}
    </button>
  );
}

const INICIAL: Estado = {};

export function Denunciar({ aviso }: { aviso: string }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion] = useActionState(denunciarAviso, INICIAL);

  if (estado.ok && estado.mensaje) {
    return <Aviso tono="bien">{estado.mensaje}</Aviso>;
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-tinta-45 hover:text-fucsia text-[13.5px] font-semibold underline-offset-2 hover:underline"
      >
        Denunciar este aviso
      </button>
    );
  }

  return (
    <form action={accion} className="border-linea flex flex-col gap-3 rounded-xl border p-4">
      <input type="hidden" name="aviso" value={aviso} />
      <h3 className="font-texto text-tinta text-[15px] font-bold">¿Qué pasa con este aviso?</h3>

      {estado.mensaje && <Aviso tono="mal">{estado.mensaje}</Aviso>}

      <label className="solo-lectores" htmlFor="motivo-denuncia">
        Motivo
      </label>
      <select
        id="motivo-denuncia"
        name="motivo"
        defaultValue=""
        className="border-linea bg-niebla text-tinta focus:border-fucsia rounded-xl border-[1.5px] px-3 py-2.5 text-[15px] focus:outline-none"
      >
        <option value="" disabled>
          Elige un motivo
        </option>
        {Object.entries(MOTIVO_DENUNCIA).map(([valor, texto]) => (
          <option key={valor} value={valor}>
            {texto}
          </option>
        ))}
      </select>
      {estado.errores?.motivo && (
        <p className="text-fucsia-osc text-[13.5px] font-semibold" role="alert">
          {estado.errores.motivo}
        </p>
      )}

      <label className="solo-lectores" htmlFor="detalle-denuncia">
        Detalle
      </label>
      <textarea
        id="detalle-denuncia"
        name="detalle"
        rows={3}
        placeholder="Cuéntanos qué viste (opcional)"
        className="border-linea bg-niebla text-tinta focus:border-fucsia rounded-xl border-[1.5px] px-3.5 py-2.5 text-[14.5px] focus:outline-none"
      />

      <div className="flex gap-2">
        <button
          type="submit"
          className="bg-fucsia hover:bg-fucsia-osc rounded-xl px-4 py-2.5 text-[14.5px] font-bold text-white transition-colors"
        >
          Enviar denuncia
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-tinta-60 hover:text-tinta px-3 py-2.5 text-[14.5px] font-semibold"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
