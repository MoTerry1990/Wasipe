import 'server-only';

import { randomUUID } from 'node:crypto';
import { clienteAdministrador } from '@/lib/supabase/administrador';
import { correo } from '@/lib/notificaciones/correo';
import { armarCorreo } from '@/lib/alertas/mensaje';
import type { Operacion, TipoInmueble } from '@/types/base-datos';

/**
 * La tarea que hace que las alertas avisen.
 *
 * `saved_searches` tenía `alert_frequency`, `last_run_at` y
 * `last_notified_at` desde el esquema inicial y nada los recorría: las
 * alertas se guardaban y no avisaban nunca.
 *
 * Corre con la clave de servicio, porque no hay sesión: la dispara un
 * cron, no una persona. Eso obliga a poner acá, explícitas, las dos cosas
 * que en el resto de la aplicación pone RLS —de quién es cada búsqueda y
 * qué avisos son públicos—, y a no olvidarse de ninguna.
 */

/** Cada cuánto vuelve a mirarse una búsqueda, en horas. */
const CADA: Record<string, number> = {
  // «Al instante» no existe con un cron diario, y decir que sí sería
  // mentir en la interfaz. Se trata como diaria hasta que haya una
  // frecuencia de verdad; queda dicho en el reporte del sprint.
  instant: 24,
  daily: 24,
  weekly: 24 * 7,
};

/**
 * Cuántos correos como máximo por persona y por día.
 *
 * Tres cosas a la vez: no saturar a nadie, no gastar la cuota del día que
 * haya un proveedor real, y que un error de la tarea no se convierta en
 * cien correos antes de que alguien lo note.
 */
export const MAXIMO_POR_DIA = 3;

/** Cuántos avisos entran en un correo antes de resumir. */
const AVISOS_POR_CORREO = 8;

export type Resumen = {
  revisadas: number;
  conNovedades: number;
  avisosNotificados: number;
  correos: number;
  omitidasPorLimite: number;
  entregaReal: boolean;
};

type BusquedaGuardada = {
  id: string;
  user_id: string;
  name: string;
  operation: Operacion | null;
  filters: Record<string, unknown>;
  alert_frequency: string;
  last_run_at: string | null;
  last_notified_at: string | null;
  created_at: string;
};

/** Aplica los filtros guardados sobre los avisos publicados. */
function conFiltros(
  consulta: ReturnType<typeof armarConsulta>,
  filtros: Record<string, unknown>,
) {
  const texto = (clave: string) => {
    const v = filtros[clave];
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
  };
  const numero = (clave: string) => {
    const v = Number(filtros[clave]);
    return Number.isFinite(v) ? v : null;
  };

  let c = consulta;

  const distrito = texto('distrito');
  if (distrito) c = c.ilike('district', distrito);

  const provincia = texto('provincia');
  if (provincia) c = c.ilike('province', provincia);

  const zona = texto('zona');
  if (zona) c = c.ilike('urbanization', `%${zona}%`);

  // El tipo se guarda como el valor del enum, no como su slug: la
  // búsqueda ya lo tradujo antes de guardarla.
  const tipo = texto('tipo');
  if (tipo) c = c.eq('property_type', tipo as TipoInmueble);

  const min = numero('precioMin');
  if (min !== null) c = c.gte('price_usd', min);

  const max = numero('precioMax');
  if (max !== null) c = c.lte('price_usd', max);

  const dorm = numero('dorm');
  if (dorm !== null) c = c.gte('bedrooms', dorm);

  return c;
}

function armarConsulta() {
  const supabase = clienteAdministrador();
  return supabase
    .from('properties')
    .select(
      'id, code, title, district, operation, property_type, currency, price, published_at',
    );
}

/**
 * Recorre las alertas vencidas y avisa de lo nuevo.
 *
 * Idempotente: lo que hace que correr dos veces no mande dos correos no
 * es una comprobación de este código, sino la restricción única de
 * `notificaciones_de_alerta`. Un `if` se puede mover de sitio; una
 * restricción de la base, no.
 */
export async function ejecutarAlertas(ahora = new Date()): Promise<Resumen> {
  const supabase = clienteAdministrador();
  const proveedor = correo();

  const resumen: Resumen = {
    revisadas: 0,
    conNovedades: 0,
    avisosNotificados: 0,
    correos: 0,
    omitidasPorLimite: 0,
    entregaReal: proveedor.entregaDeVerdad,
  };

  const { data: busquedas } = await supabase
    .from('saved_searches')
    .select(
      'id, user_id, name, operation, filters, alert_frequency, last_run_at, last_notified_at, created_at',
    )
    .eq('is_active', true)
    .neq('alert_frequency', 'never')
    .returns<BusquedaGuardada[]>();

  for (const busqueda of busquedas ?? []) {
    const horas = CADA[busqueda.alert_frequency] ?? 24;
    const vencida =
      !busqueda.last_run_at ||
      ahora.getTime() - new Date(busqueda.last_run_at).getTime() >= horas * 3600_000;

    if (!vencida) continue;
    resumen.revisadas++;

    // Se marca la corrida antes de decidir si hay algo que mandar: una
    // búsqueda sin novedades también se revisó, y si esto fuera después
    // del envío, una que falla se reintentaría en bucle.
    await supabase
      .from('saved_searches')
      .update({ last_run_at: ahora.toISOString() })
      .eq('id', busqueda.id);

    const desde = busqueda.last_notified_at ?? busqueda.created_at ?? null;

    let consulta = armarConsulta()
      .eq('publication_status', 'published')
      .eq('status', 'available');

    if (busqueda.operation) consulta = consulta.eq('operation', busqueda.operation);
    if (desde) consulta = consulta.gt('published_at', desde);

    const { data: candidatos } = await conFiltros(consulta, busqueda.filters ?? {})
      .order('published_at', { ascending: false })
      .limit(50);

    if (!candidatos || candidatos.length === 0) continue;

    // Lo ya avisado por ESTA búsqueda no vuelve a contar. La restricción
    // única lo impediría igual; consultarlo antes evita escribir filas
    // que van a rebotar y componer un correo vacío.
    const { data: yaAvisados } = await supabase
      .from('notificaciones_de_alerta')
      .select('property_id')
      .eq('busqueda_id', busqueda.id);

    const conocidos = new Set((yaAvisados ?? []).map((f) => f.property_id));
    const nuevos = candidatos.filter((a) => !conocidos.has(a.id));

    if (nuevos.length === 0) continue;
    resumen.conNovedades++;

    // El límite por persona se mira contra lo enviado en las últimas 24
    // horas, no contra un contador en memoria: la tarea puede correr
    // varias veces y desde varios sitios.
    const hace24h = new Date(ahora.getTime() - 24 * 3600_000).toISOString();
    const { data: recientes } = await supabase
      .from('notificaciones_de_alerta')
      .select('envio_id')
      .eq('user_id', busqueda.user_id)
      .gte('created_at', hace24h);

    const enviosRecientes = new Set((recientes ?? []).map((f) => f.envio_id)).size;
    if (enviosRecientes >= MAXIMO_POR_DIA) {
      resumen.omitidasPorLimite++;
      continue;
    }

    const { data: usuario } = await supabase.auth.admin.getUserById(busqueda.user_id);
    const destino = usuario?.user?.email;
    if (!destino) continue;

    const mensaje = armarCorreo({
      nombreDeLaBusqueda: busqueda.name,
      avisos: nuevos.slice(0, AVISOS_POR_CORREO),
      total: nuevos.length,
      para: destino,
    });

    const envio = await proveedor.enviar(mensaje);
    const envioId = randomUUID();

    const filas = nuevos.slice(0, AVISOS_POR_CORREO).map((aviso) => ({
      busqueda_id: busqueda.id,
      user_id: busqueda.user_id,
      property_id: aviso.id,
      envio_id: envioId,
      estado: (envio.ok ? envio.estado : 'fallido') as 'registrado' | 'enviado' | 'fallido',
      proveedor: envio.proveedor,
      error: envio.ok ? null : envio.motivo,
      cuerpo: mensaje.cuerpo,
      asunto: mensaje.asunto,
    }));

    const { error } = await supabase.from('notificaciones_de_alerta').insert(filas);

    // Si la escritura falla, NO se toca `last_notified_at`: es preferible
    // volver a avisar de un aviso que dejar a alguien sin enterarse.
    if (error) continue;

    resumen.correos++;
    resumen.avisosNotificados += filas.length;

    await supabase
      .from('saved_searches')
      .update({ last_notified_at: ahora.toISOString() })
      .eq('id', busqueda.id);
  }

  return resumen;
}
