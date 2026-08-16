'use server';

import { clienteServidor } from '@/lib/supabase/servidor';
import { clienteAdministrador } from '@/lib/supabase/administrador';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import { requiereCuentaLista } from '@/lib/auth/sesion';
import { puedePublicar } from '@/lib/auth/roles';
import { proveedorDeIA } from '@/lib/ia/registro';
import { FallaDeProveedor, IA_NO_DISPONIBLE } from '@/lib/ia/proveedor';
import {
  OPERACIONES,
  LIMITE_POR_HORA,
  armarPeticion,
  esOperacion,
  huellaDelPedido,
  interpretar,
  datosSuficientes,
  sugerenciaUtil,
} from '@/lib/ia/asistente';
import type { BorradorDeAviso } from '@/lib/validacion/aviso';
import type { RespuestaDelAsistente } from '@/features/wasi-ai/tipos';

/**
 * Acciones del asistente de avisos.
 *
 * Todo pasa por el servidor: la clave del proveedor nunca sale de acá y
 * ningún resultado se guarda en el aviso por su cuenta. La acción
 * devuelve una propuesta; aplicarla es un segundo paso que la persona
 * tiene que dar a mano.
 *
 * El ciclo completo de un pedido:
 *   1. iniciar_trabajo_ia()  — cupo, saldo e idempotencia, en la base.
 *   2. proveedor.generarTexto() — la única llamada a una empresa de IA.
 *   3. terminar_trabajo_ia() o fallar_trabajo_ia() — resultado y cobro.
 *
 * El paso 3 corre con la clave de servicio porque escribe el resultado y
 * el costo: ninguna sesión de navegador puede hacerlo, ni siquiera sobre
 * sus propios trabajos. Eso lo impide un disparador de la base.
 */

function no(mensaje: string): RespuestaDelAsistente {
  return { ok: false, mensaje };
}

/**
 * Pide un texto a Wasi AI.
 *
 * Nunca lanza: cualquier falla vuelve como un mensaje en castellano que
 * se puede mostrar tal cual. Publicar a mano tiene que seguir siendo
 * posible aunque la IA esté caída.
 */
export async function pedirTexto(
  operacionCruda: string,
  datos: BorradorDeAviso,
  propiedadId?: string | null,
): Promise<RespuestaDelAsistente> {
  const perfil = await requiereCuentaLista('/publicar');
  if (!puedePublicar(perfil.role)) {
    return no('Tu tipo de cuenta no publica avisos.');
  }

  if (!esOperacion(operacionCruda)) {
    return no('Ese pedido no existe.');
  }
  const operacion = operacionCruda;

  if (!supabaseConfigurado()) return no(IA_NO_DISPONIBLE);

  if (!datosSuficientes(datos)) {
    return no(
      'Completa al menos la operación, el tipo, el distrito y el área total. Con eso Wasi AI ya puede escribir.',
    );
  }
  if (operacion === 'mejorar' && (datos.descripcion ?? '').trim().length < 40) {
    return no('Escribe primero unas líneas y Wasi AI las ordena.');
  }

  const proveedor = proveedorDeIA();
  if (!proveedor.disponible()) return no(IA_NO_DISPONIBLE);

  // ------------------------------------------------------------------
  // 1. Abrir el trabajo
  // ------------------------------------------------------------------
  const supabase = await clienteServidor();
  // La función devuelve una fila de `ai_jobs` completa, no un conjunto:
  // PostgREST la entrega como objeto, así que no lleva `.single()`.
  const { data: trabajo, error: errorInicio } = await supabase.rpc('iniciar_trabajo_ia', {
    p_kind: 'listing_draft',
    p_operation: operacion,
    p_input: { operacion, datos: recorteSeguro(datos) },
    p_idempotency_key: huellaDelPedido(operacion, datos),
    p_property_id: propiedadId ?? null,
    p_costo: OPERACIONES[operacion].costo,
    p_limite_hora: LIMITE_POR_HORA,
  });

  if (errorInicio || !trabajo) {
    // El límite por hora y el saldo llegan como excepción de Postgres con
    // el mensaje ya escrito en castellano: se muestra ese, no uno genérico.
    return no(errorInicio?.message || IA_NO_DISPONIBLE);
  }

  // Pedido repetido que ya había terminado: se devuelve lo de antes sin
  // volver a llamar al proveedor ni volver a cobrar.
  if (trabajo.status === 'succeeded' && trabajo.output) {
    const guardado = interpretar(
      operacion,
      String((trabajo.output as { texto?: string }).texto ?? ''),
    );
    if (sugerenciaUtil(guardado)) {
      return { ok: true, trabajoId: trabajo.id, operacion, sugerencia: guardado };
    }
  }
  if (trabajo.status !== 'running') {
    return no('Ese pedido ya se procesó. Cambia algún dato y vuelve a intentarlo.');
  }

  // ------------------------------------------------------------------
  // 2. El proveedor
  // ------------------------------------------------------------------
  const servicio = clienteAdministrador();
  const empezo = Date.now();

  try {
    const respuesta = await proveedor.generarTexto(armarPeticion(operacion, datos));
    const sugerencia = interpretar(operacion, respuesta.texto);

    if (!sugerenciaUtil(sugerencia)) {
      throw new FallaDeProveedor(
        'Wasi AI no pudo escribir algo aprovechable esta vez. Vuelve a intentarlo.',
        'respuesta demasiado corta o vacía',
      );
    }

    // ----------------------------------------------------------------
    // 3a. Salió bien: se guarda y recién ahí se cobra.
    // ----------------------------------------------------------------
    await servicio.rpc('terminar_trabajo_ia', {
      p_job_id: trabajo.id,
      p_output: { texto: respuesta.texto, tokens: respuesta.tokens ?? null },
      p_provider: respuesta.proveedor,
      p_model: respuesta.modelo,
      p_costo: OPERACIONES[operacion].costo,
      p_duration_ms: Date.now() - empezo,
    });

    return { ok: true, trabajoId: trabajo.id, operacion, sugerencia };
  } catch (error) {
    // ----------------------------------------------------------------
    // 3b. Salió mal: se anota el motivo y no se cobra ni un crédito.
    // ----------------------------------------------------------------
    const falla =
      error instanceof FallaDeProveedor
        ? error
        : new FallaDeProveedor(
            IA_NO_DISPONIBLE,
            error instanceof Error ? error.message : 'error desconocido',
          );

    await servicio.rpc('fallar_trabajo_ia', {
      p_job_id: trabajo.id,
      p_error: falla.detalle,
      p_provider: proveedor.nombre,
      p_duration_ms: Date.now() - empezo,
    });

    return no(falla.message);
  }
}

/**
 * La persona confirma que va a usar el texto.
 *
 * Wasipe no aplica nada solo: esta función deja constancia de la
 * confirmación y el asistente escribe el texto en el borrador. Si la
 * llamada falla, el texto igual se usa —ya lo aceptó— y lo único que se
 * pierde es la trazabilidad.
 */
export async function aceptarSugerencia(trabajoId: string): Promise<{ ok: boolean }> {
  await requiereCuentaLista('/publicar');
  if (!supabaseConfigurado()) return { ok: false };

  const supabase = await clienteServidor();
  const { error } = await supabase.rpc('aceptar_trabajo_ia', { p_job_id: trabajoId });
  return { ok: !error };
}

/** La persona no quiere el texto. Queda anotado para no volver a proponerlo. */
export async function descartarSugerencia(trabajoId: string): Promise<{ ok: boolean }> {
  await requiereCuentaLista('/publicar');
  if (!supabaseConfigurado()) return { ok: false };

  const supabase = await clienteServidor();
  const { error } = await supabase.rpc('descartar_trabajo_ia', { p_job_id: trabajoId });
  return { ok: !error };
}

/**
 * Qué del borrador se guarda como entrada del trabajo.
 *
 * La dirección exacta, el celular y las fotos no entran: no hacen falta
 * para redactar y son datos personales que quedarían archivados en
 * `ai_jobs.input` sin ninguna razón (Ley 29733, minimización).
 */
const FUERA = ['direccion', 'referencia', 'celular', 'fotos', 'video'] as const;

function recorteSeguro(datos: BorradorDeAviso) {
  const resto: Record<string, unknown> = { ...datos };
  for (const campo of FUERA) delete resto[campo];
  // El borrador ya es JSON puro —viene de un formulario— así que este
  // paso no convierte nada: solo se lo dice al compilador.
  return JSON.parse(JSON.stringify(resto)) as Record<string, never>;
}
