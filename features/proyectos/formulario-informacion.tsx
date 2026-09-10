'use client';

import { useActionState } from 'react';
import { Tarjeta } from '@/components/ui/tarjeta';
import { Campo, AreaDeTexto, Seleccion, Guardar, Aviso } from './campos';
import { ETAPAS, ETIQUETA_ETAPA } from '@/lib/validacion/proyecto';
import type { Estado } from './acciones';
import type { Proyecto } from '@/types/base-datos';

const ETAPA_OPCIONES = ETAPAS.map((e) => ({ valor: e, texto: ETIQUETA_ETAPA[e] }));

/**
 * La información general del proyecto.
 *
 * El mismo formulario sirve para crear y para editar: son los mismos
 * campos y las mismas reglas, y tener dos copias garantiza que un día
 * se validen distinto.
 *
 * Los campos van sin `required` del navegador a propósito. La validación
 * la hace Zod en el servidor, que es la que de verdad protege, y dejar
 * que el navegador bloquee el envío haría que el usuario nunca viera
 * esos mensajes —hasta el día que algo llegue por otro camino y el
 * mensaje que aparezca sea el crudo de la base.
 */
export function FormularioInformacion({
  accion,
  proyecto,
  etiquetaBoton = 'Guardar cambios',
}: {
  accion: (previo: Estado, datos: FormData) => Promise<Estado>;
  proyecto?: Proyecto;
  etiquetaBoton?: string;
}) {
  const [estado, enviar] = useActionState(accion, { ok: false });
  const e = estado.errores ?? {};

  // La fecha se guarda como día 1 del mes y se muestra como mes: nadie
  // promete un día exacto tres años antes de entregar.
  const mes = proyecto?.delivery_estimate ? proyecto.delivery_estimate.slice(0, 7) : undefined;

  return (
    <form action={enviar} className="flex flex-col gap-5">
      {proyecto && <input type="hidden" name="codigo" value={proyecto.code} />}

      <Tarjeta className="flex flex-col gap-4 p-5 sm:p-6">
        <h2 className="text-lg">Sobre el proyecto</h2>

        <Campo
          nombre="name"
          etiqueta="Nombre del proyecto"
          requerido
          valor={proyecto?.name}
          error={e.name}
          maxLength={140}
          placeholder="Torre Los Álamos"
        />

        <AreaDeTexto
          nombre="description"
          etiqueta="Descripción"
          valor={proyecto?.description}
          error={e.description}
          maxLength={4000}
          placeholder="Qué tiene el proyecto, cómo son las áreas comunes, qué lo distingue."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Seleccion
            nombre="stage"
            etiqueta="Etapa"
            opciones={ETAPA_OPCIONES}
            valor={proyecto?.stage ?? 'preventa'}
            error={e.stage}
          />
          <Campo
            nombre="delivery_estimate"
            etiqueta="Entrega estimada"
            tipo="month"
            valor={mes}
            error={e.delivery_estimate}
            ayuda="Se muestra como mes y año."
          />
        </div>
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-4 p-5 sm:p-6">
        <h2 className="text-lg">Dónde está</h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo nombre="department" etiqueta="Departamento" requerido valor={proyecto?.department} error={e.department} />
          <Campo nombre="province" etiqueta="Provincia" requerido valor={proyecto?.province} error={e.province} />
          <Campo nombre="district" etiqueta="Distrito" requerido valor={proyecto?.district} error={e.district} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            nombre="address"
            etiqueta="Dirección"
            valor={proyecto?.address}
            error={e.address}
            maxLength={240}
            ayuda="Un proyecto se promociona con su dirección: acá sí va completa."
          />
          <Campo
            nombre="ubigeo"
            etiqueta="Ubigeo"
            valor={proyecto?.ubigeo}
            error={e.ubigeo}
            inputMode="numeric"
            maxLength={6}
            ayuda="Seis dígitos, si lo tienes a mano."
          />
        </div>
      </Tarjeta>

      <div className="flex flex-wrap items-center gap-3">
        <Guardar>{etiquetaBoton}</Guardar>
        <Aviso estado={estado} />
      </div>
    </form>
  );
}
