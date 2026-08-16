'use server';

import { clienteServidor } from '@/lib/supabase/servidor';
import { clienteAdministrador } from '@/lib/supabase/administrador';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import { perfilOpcional, requiereCuentaLista } from '@/lib/auth/sesion';
import { proveedorDeIA } from '@/lib/ia/registro';
import { FallaDeProveedor } from '@/lib/ia/proveedor';
import {
  armarPeticionDeBusqueda,
  combinar,
  explicarFiltros,
  interpretarLocal,
  leerRespuestaDelModelo,
  mensajeDeObjeciones,
  revisarConsulta,
  validarFiltros,
} from '@/lib/ia/conversacion';
import { urlDeFiltros } from '@/lib/busqueda/filtros';
import type { Operacion } from '@/types/base-datos';
import type { RespuestaDeInterpretacion } from '@/features/busqueda/conversacion-tipos';

/**
 * Búsqueda conversacional.
 *
 * Esta acción NO devuelve avisos. Devuelve filtros y una URL; los avisos
 * los trae Postgres cuando el navegador va a esa URL, con las mismas
 * consultas y la misma RLS que la búsqueda de siempre. Un modelo que
 * redacta resultados inventa direcciones y precios que no existen.
 *
 * El parser local corre siempre; el modelo, solo si está configurado y
 * solo para completar lo que el parser dejó vacío. Con o sin IA la
 * función responde, y responde en menos de un segundo.
 */

const LARGO_MAXIMO = 500;
const LIMITE_POR_HORA = 40;

export async function interpretarBusqueda(
  consultaCruda: string,
  operacion: Operacion,
): Promise<RespuestaDeInterpretacion> {
  const consulta = consultaCruda.trim().slice(0, LARGO_MAXIMO);
  if (consulta.length < 3) {
    return { ok: false, mensaje: 'Escribe qué estás buscando.' };
  }

  // 1. Lo que no se traduce a un filtro, pase lo que pase.
  const objeciones = revisarConsulta(consulta);

  // 2. El parser local. Determinista, sin costo y sin latencia.
  const local = interpretarLocal(consulta, operacion);
  let crudo: Record<string, unknown> = { ...local };
  let conModelo = false;

  // 3. El modelo, si lo hay, solo para lo que quedó vacío.
  const proveedor = proveedorDeIA();
  if (proveedor.disponible() && supabaseConfigurado()) {
    const afinado = await afinarConModelo(consulta, operacion);
    if (afinado) {
      crudo = combinar(local, afinado);
      conModelo = true;
    }
  }

  // 4. La misma puerta de validación que la URL. Venga de donde venga.
  const filtros = validarFiltros(crudo, operacion);

  return {
    ok: true,
    interpretacion: {
      consulta,
      filtros,
      chips: explicarFiltros(filtros),
      url: urlDeFiltros(filtros),
      objeciones,
      aviso: mensajeDeObjeciones(objeciones),
      conModelo,
    },
  };
}

/**
 * Le pide al modelo que complete lo que el parser no alcanzó.
 *
 * Devuelve null ante cualquier problema: la búsqueda sigue con lo del
 * parser local. Que la IA esté caída no puede dejar a nadie sin buscar.
 */
async function afinarConModelo(
  consulta: string,
  operacion: Operacion,
): Promise<Record<string, unknown> | null> {
  const proveedor = proveedorDeIA();
  const supabase = await clienteServidor();
  const perfil = await perfilOpcional();

  // Sin sesión no se llama al modelo: `iniciar_trabajo_ia()` exige un
  // usuario, y sin él no habría cómo limitar el uso ni a quién anotarlo.
  if (!perfil) return null;

  const { data: trabajo, error } = await supabase.rpc('iniciar_trabajo_ia', {
    p_kind: 'search_parse',
    p_operation: 'interpretar',
    p_input: { consulta, operacion },
    p_idempotency_key: `busqueda:${operacion}:${consulta.toLowerCase()}`,
    p_property_id: null,
    p_costo: 0,
    p_limite_hora: LIMITE_POR_HORA,
  });

  if (error || !trabajo) return null;

  // Consulta repetida: se devuelve lo de antes sin volver a preguntar.
  const guardado = trabajo.output as { filtros?: Record<string, unknown> } | null;
  if (trabajo.status === 'succeeded' && guardado?.filtros) return guardado.filtros;
  if (trabajo.status !== 'running') return null;

  const servicio = clienteAdministrador();
  const empezo = Date.now();

  try {
    const respuesta = await proveedor.generarTexto(armarPeticionDeBusqueda(consulta));
    const filtros = leerRespuestaDelModelo(respuesta.texto);

    await servicio.rpc('terminar_trabajo_ia', {
      p_job_id: trabajo.id,
      // Ya es JSON puro —salió de JSON.parse— pero el tipo no lo sabe.
      p_output: JSON.parse(JSON.stringify({ filtros })),
      p_provider: respuesta.proveedor,
      p_model: respuesta.modelo,
      p_costo: 0,
      p_duration_ms: Date.now() - empezo,
    });

    return filtros;
  } catch (error) {
    const detalle =
      error instanceof FallaDeProveedor
        ? error.detalle
        : error instanceof Error
          ? error.message
          : 'error desconocido';

    await servicio.rpc('fallar_trabajo_ia', {
      p_job_id: trabajo.id,
      p_error: detalle,
      p_provider: proveedor.nombre,
      p_duration_ms: Date.now() - empezo,
    });

    return null;
  }
}

/**
 * Guarda la búsqueda y su alerta.
 *
 * Se guardan las dos cosas: los filtros, que son lo que se ejecuta, y la
 * frase, que es lo que la persona reconoce. Sin la frase, una alerta de
 * hace tres meses es una lista de parámetros que nadie entiende.
 */
export async function guardarBusquedaConversacional(
  nombre: string,
  consulta: string,
  operacion: Operacion,
  filtros: Record<string, unknown>,
  frecuencia: string,
): Promise<{ ok: boolean; mensaje?: string }> {
  const perfil = await requiereCuentaLista('/comprar');
  if (!supabaseConfigurado()) {
    return { ok: false, mensaje: 'No pudimos guardar en este momento.' };
  }

  const limpio = nombre.trim().slice(0, 80);
  if (limpio.length < 2) return { ok: false, mensaje: 'Ponle un nombre a tu búsqueda.' };

  const frecuencias = ['never', 'instant', 'daily', 'weekly'] as const;
  const alerta = (frecuencias as readonly string[]).includes(frecuencia)
    ? (frecuencia as (typeof frecuencias)[number])
    : 'daily';

  // Se revalida antes de guardar: lo que se archiva tiene que ser tan
  // válido como lo que se ejecuta, y esto se va a correr solo, sin nadie
  // mirando, cada vez que se dispare la alerta.
  const validados = validarFiltros(filtros, operacion);

  const supabase = await clienteServidor();
  const { error } = await supabase.from('saved_searches').insert({
    user_id: perfil.id,
    name: limpio,
    prompt: consulta.trim().slice(0, 500) || null,
    operation: operacion,
    filters: JSON.parse(JSON.stringify(validados)),
    alert_frequency: alerta,
  });

  if (error) return { ok: false, mensaje: 'No pudimos guardar tu búsqueda.' };
  return { ok: true };
}
