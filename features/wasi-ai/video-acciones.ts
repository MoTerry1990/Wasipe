'use server';

import { revalidatePath } from 'next/cache';
import { clienteServidor } from '@/lib/supabase/servidor';
import { clienteAdministrador } from '@/lib/supabase/administrador';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import { requiereCuentaLista } from '@/lib/auth/sesion';
import { proveedorDeVideo } from '@/lib/ia/registro';
import { FallaDeProveedor, VIDEO_NO_DISPONIBLE } from '@/lib/ia/proveedor';
import {
  DIAS_DE_VIGENCIA,
  FORMATOS,
  FOTOS_MINIMAS_VIDEO,
  LIMITE_VIDEOS_POR_HORA,
  PLANTILLAS,
  armarGuion,
  esFormato,
  esPlantilla,
  huellaDeVideo,
  puedeMarcarInmobiliaria,
  rutaDeVideo,
  type DatosDelVideo,
} from '@/lib/ia/video';
import type { RespuestaDeVideo, RespuestaDeVistaPrevia } from '@/features/wasi-ai/video-tipos';

/**
 * Video automático del aviso.
 *
 * Renderizar tarda minutos, así que el ciclo tiene una forma distinta a
 * la del texto y la de las fotos:
 *
 *   1. vistaPreviaDeVideo() — no toca al proveedor ni gasta un crédito.
 *      El guion es determinista, así que lo que se ve acá es exactamente
 *      lo que se va a renderizar.
 *   2. pedirVideo() — aparta los créditos y encola en el proveedor.
 *   3. progresoDeVideo() — se llama cada pocos segundos. Cuando el
 *      proveedor termina, se baja el archivo, se guarda en la cubeta
 *      privada y recién ahí la reserva se convierte en cobro.
 *   4. Si falla o se cancela, los créditos se devuelven enteros.
 *
 * El archivo vive en una cubeta PRIVADA. No hay URL que reenviar: la
 * descarga sale con un enlace firmado y de vida corta, y solo para quien
 * administra el aviso.
 */

const CUBETA = 'videos';
const VIDA_DEL_ENLACE = 300; // 5 minutos: alcanza para bajar, no para repartir

function noVista(mensaje: string): RespuestaDeVistaPrevia {
  return { ok: false, mensaje };
}
function noVideo(mensaje: string): RespuestaDeVideo {
  return { ok: false, mensaje };
}

// ---------------------------------------------------------------------
// Los datos del aviso
// ---------------------------------------------------------------------

/**
 * Junta lo que el video va a decir.
 *
 * Las fotos que entran son las **aprobadas**: las originales de la
 * persona, y de las hechas con Wasi AI solo las que moderación ya
 * revisó. Una edición sin revisar no se comparte por WhatsApp: el video
 * sale del control de Wasipe en el primer reenvío.
 */
async function juntarDatos(
  propiedadId: string,
): Promise<{ datos: DatosDelVideo; propiedad: { id: string; code: string } } | null> {
  const supabase = await clienteServidor();

  // La RLS limita a los avisos que esta persona administra.
  const { data: aviso } = await supabase
    .from('properties')
    .select(
      'id, code, title, district, province, operation, property_type, currency, price, total_area, bedrooms, bathrooms, parking, owner_id, agency_id',
    )
    .eq('id', propiedadId)
    .maybeSingle();

  if (!aviso) return null;

  const { data: medios } = await supabase
    .from('property_media')
    .select('url, ai_edited, ai_label, review_status, is_cover, sort_order')
    .eq('property_id', aviso.id)
    .eq('kind', 'photo')
    .order('sort_order', { ascending: true });

  const fotos = (medios ?? [])
    .filter((m) => !m.ai_edited || m.review_status === 'cleared')
    .sort((a, b) => (a.is_cover === b.is_cover ? 0 : a.is_cover ? -1 : 1))
    .map((m) => ({ url: m.url, etiqueta: m.ai_label }));

  const { data: perfil } = await supabase
    .from('profiles')
    .select('full_name, whatsapp')
    .eq('id', aviso.owner_id)
    .maybeSingle();

  // La marca de la inmobiliaria depende del plan: no todos la incluyen.
  let inmobiliaria: DatosDelVideo['inmobiliaria'] = null;
  if (aviso.agency_id) {
    const { data: agencia } = await supabase
      .from('agencies')
      .select('name, logo_url')
      .eq('id', aviso.agency_id)
      .maybeSingle();

    const { data: suscripcion } = await supabase
      .from('subscriptions')
      .select('plan_code, status')
      .eq('agency_id', aviso.agency_id)
      .in('status', ['trialing', 'active'])
      .maybeSingle();

    if (agencia && puedeMarcarInmobiliaria(suscripcion?.plan_code)) {
      inmobiliaria = { nombre: agencia.name, logo: agencia.logo_url };
    }
  }

  return {
    propiedad: { id: aviso.id, code: aviso.code },
    datos: {
      titulo: aviso.title,
      distrito: aviso.district,
      provincia: aviso.province,
      operacion: aviso.operation,
      tipo: aviso.property_type,
      moneda: aviso.currency,
      precio: Number(aviso.price),
      areaTotal: Number(aviso.total_area),
      dormitorios: aviso.bedrooms,
      banos: aviso.bathrooms,
      cocheras: aviso.parking,
      fotos,
      contacto: { nombre: perfil?.full_name ?? 'Wasipe', whatsapp: perfil?.whatsapp },
      inmobiliaria,
    },
  };
}

// ---------------------------------------------------------------------
// 1. Vista previa — gratis
// ---------------------------------------------------------------------

/**
 * Lo que se va a renderizar, sin renderizar nada.
 *
 * No llama al proveedor y no gasta un crédito. Como `armarGuion()` es
 * determinista, la vista previa no es una aproximación: es el mismo
 * guion que va a recibir el proveedor.
 */
export async function vistaPreviaDeVideo(
  propiedadId: string,
  formatoCrudo: string,
  plantillaCruda: string,
  narracion?: boolean,
): Promise<RespuestaDeVistaPrevia> {
  const perfil = await requiereCuentaLista('/panel/mis-propiedades');
  if (!supabaseConfigurado()) return noVista(VIDEO_NO_DISPONIBLE);

  if (!esFormato(formatoCrudo)) return noVista('Ese formato no existe.');
  if (!esPlantilla(plantillaCruda)) return noVista('Esa plantilla no existe.');

  const cargado = await juntarDatos(propiedadId);
  if (!cargado) return noVista('No encontramos ese aviso.');

  if (cargado.datos.fotos.length < FOTOS_MINIMAS_VIDEO) {
    return noVista(
      `Necesitas al menos ${FOTOS_MINIMAS_VIDEO} fotos aprobadas para armar un video.`,
    );
  }

  const supabase = await clienteServidor();
  const { data: saldo } = await supabase.rpc('saldo_de_creditos', { p_user: perfil.id });

  return {
    ok: true,
    vista: {
      guion: armarGuion(cargado.datos, {
        formato: formatoCrudo,
        plantilla: plantillaCruda,
        narracion,
      }),
      formato: formatoCrudo,
      plantilla: plantillaCruda,
      costo: PLANTILLAS[plantillaCruda].costo,
      saldo: Number(saldo ?? 0),
      fotos: cargado.datos.fotos.length,
    },
  };
}

// ---------------------------------------------------------------------
// 2. Pedirlo — acá sí se apartan los créditos
// ---------------------------------------------------------------------

export async function pedirVideo(
  propiedadId: string,
  formatoCrudo: string,
  plantillaCruda: string,
  narracion?: boolean,
): Promise<RespuestaDeVideo> {
  await requiereCuentaLista('/panel/mis-propiedades');
  if (!supabaseConfigurado()) return noVideo(VIDEO_NO_DISPONIBLE);

  if (!esFormato(formatoCrudo)) return noVideo('Ese formato no existe.');
  if (!esPlantilla(plantillaCruda)) return noVideo('Esa plantilla no existe.');

  const proveedor = proveedorDeVideo();
  if (!proveedor.disponible()) return noVideo(VIDEO_NO_DISPONIBLE);
  if (!proveedor.soporta(formatoCrudo, plantillaCruda)) {
    return noVideo('Esa combinación de formato y plantilla no está disponible.');
  }

  const cargado = await juntarDatos(propiedadId);
  if (!cargado) return noVideo('No encontramos ese aviso.');
  if (cargado.datos.fotos.length < FOTOS_MINIMAS_VIDEO) {
    return noVideo(
      `Necesitas al menos ${FOTOS_MINIMAS_VIDEO} fotos aprobadas para armar un video.`,
    );
  }

  const plantilla = PLANTILLAS[plantillaCruda];
  const formato = FORMATOS[formatoCrudo];
  const guion = armarGuion(cargado.datos, {
    formato: formatoCrudo,
    plantilla: plantillaCruda,
    narracion,
  });

  const supabase = await clienteServidor();
  const { data: trabajo, error: errorInicio } = await supabase.rpc('iniciar_trabajo_ia', {
    p_kind: 'video_tour',
    p_operation: `${formatoCrudo}:${plantillaCruda}`,
    p_input: { formato: formatoCrudo, plantilla: plantillaCruda, guion },
    p_idempotency_key: huellaDeVideo(
      propiedadId,
      formatoCrudo,
      plantillaCruda,
      Boolean(narracion ?? plantilla.narracionPorDefecto),
    ),
    p_property_id: propiedadId,
    // El costo NO se pasa acá: se aparta aparte, con reservar_creditos_ia.
    p_costo: 0,
    p_limite_hora: LIMITE_VIDEOS_POR_HORA,
  });

  if (errorInicio || !trabajo) return noVideo(errorInicio?.message || VIDEO_NO_DISPONIBLE);

  // Pedido repetido que ya terminó: se devuelve el video de antes.
  if (trabajo.status === 'succeeded') {
    return await estadoActual(trabajo.id);
  }
  if (trabajo.status !== 'running') {
    return noVideo('Ese video ya se procesó. Prueba con otro formato o plantilla.');
  }

  const servicio = clienteAdministrador();

  // ------------------------------------------------------------------
  // Reserva. Si no alcanza el saldo, no se encola nada.
  // ------------------------------------------------------------------
  const { error: errorReserva } = await servicio.rpc('reservar_creditos_ia', {
    p_job_id: trabajo.id,
    p_creditos: plantilla.costo,
  });

  if (errorReserva) {
    await servicio.rpc('fallar_trabajo_ia', {
      p_job_id: trabajo.id,
      p_error: 'saldo insuficiente',
      p_provider: proveedor.nombre,
    });
    return noVideo(errorReserva.message || 'No te alcanzan los créditos para este video.');
  }

  try {
    const { referencia } = await proveedor.encolar({
      guion,
      formato: formatoCrudo,
      plantilla: plantillaCruda,
      ancho: formato.ancho,
      alto: formato.alto,
      idempotencia: huellaDeVideo(
        propiedadId,
        formatoCrudo,
        plantillaCruda,
        Boolean(narracion ?? plantilla.narracionPorDefecto),
      ),
    });

    await servicio.rpc('avanzar_trabajo_ia', {
      p_job_id: trabajo.id,
      p_progreso: 5,
      p_provider_ref: referencia,
    });

    await servicio.from('property_videos').insert({
      property_id: propiedadId,
      ai_job_id: trabajo.id,
      created_by: trabajo.user_id,
      format: formatoCrudo,
      template: plantillaCruda,
      status: 'rendering',
      // Lo que el video dice, congelado. `undefined` no es JSON válido,
      // así que los campos vacíos van explícitos en null.
      facts: {
        titulo: cargado.datos.titulo,
        distrito: cargado.datos.distrito,
        precio: cargado.datos.precio,
        moneda: cargado.datos.moneda,
        area_total: cargado.datos.areaTotal,
        dormitorios: cargado.datos.dormitorios ?? null,
        banos: cargado.datos.banos ?? null,
      },
      narration: guion.narracion || null,
      music_track: guion.musica || null,
      captions: guion.subtitulos.length > 0,
      provider: proveedor.nombre,
      provider_ref: referencia,
    });

    return {
      ok: true,
      video: {
        trabajoId: trabajo.id,
        videoId: null,
        estado: 'renderizando',
        progreso: 5,
      },
    };
  } catch (error) {
    return await abandonar(trabajo.id, error, proveedor.nombre);
  }
}

// ---------------------------------------------------------------------
// 3. Cómo va
// ---------------------------------------------------------------------

export async function progresoDeVideo(trabajoId: string): Promise<RespuestaDeVideo> {
  await requiereCuentaLista('/panel/mis-propiedades');
  if (!supabaseConfigurado()) return noVideo(VIDEO_NO_DISPONIBLE);

  const supabase = await clienteServidor();
  const { data: trabajo } = await supabase
    .from('ai_jobs')
    .select('id, status, progress, provider_ref, property_id, operation')
    .eq('id', trabajoId)
    .maybeSingle();

  if (!trabajo) return noVideo('No encontramos ese video.');
  if (trabajo.status !== 'running') return await estadoActual(trabajoId);
  if (!trabajo.provider_ref) return noVideo('No encontramos el render en el proveedor.');

  const proveedor = proveedorDeVideo();
  const servicio = clienteAdministrador();

  try {
    const estado = await proveedor.consultar(trabajo.provider_ref);

    if (estado.estado === 'trabajando') {
      await servicio.rpc('avanzar_trabajo_ia', {
        p_job_id: trabajoId,
        p_progreso: estado.progreso,
      });
      return {
        ok: true,
        video: {
          trabajoId,
          videoId: null,
          estado: 'renderizando',
          progreso: Math.max(estado.progreso, trabajo.progress),
        },
      };
    }

    if (estado.estado === 'falla') {
      return await abandonar(
        trabajoId,
        new FallaDeProveedor(
          'El video no se pudo terminar. Te devolvimos los créditos.',
          estado.detalle,
          estado.reintentable,
        ),
        proveedor.nombre,
      );
    }

    // ----------------------------------------------------------------
    // Listo: se baja el archivo y se guarda en la cubeta privada.
    // ----------------------------------------------------------------
    const guardado = await guardar(trabajo.property_id!, estado.video.url, estado.video.tipo);
    const portada = estado.portada
      ? await guardar(trabajo.property_id!, estado.portada.url, estado.portada.tipo)
      : null;

    await servicio.rpc('terminar_trabajo_reservado', {
      p_job_id: trabajoId,
      p_output: { ruta: guardado.ruta, bytes: guardado.bytes },
      p_provider: proveedor.nombre,
      p_model: trabajo.operation ?? 'video',
      p_duration_ms: estado.duracionMs ?? null,
      p_provider_cost_micros: estado.costoMicros ?? null,
    });

    const vence = new Date(Date.now() + DIAS_DE_VIGENCIA * 86_400_000).toISOString();

    await servicio
      .from('property_videos')
      .update({
        status: 'ready',
        storage_path: guardado.ruta,
        poster_path: portada?.ruta ?? null,
        bytes: guardado.bytes,
        duration_ms: estado.duracionMs ?? null,
        provider_cost_micros: estado.costoMicros ?? null,
        expires_at: vence,
        finished_at: new Date().toISOString(),
      })
      .eq('ai_job_id', trabajoId);

    revalidatePath('/panel/mis-propiedades');
    return await estadoActual(trabajoId);
  } catch (error) {
    return await abandonar(trabajoId, error, proveedor.nombre);
  }
}

// ---------------------------------------------------------------------
// 4. Cancelar
// ---------------------------------------------------------------------

/** La persona se arrepintió. Los créditos vuelven enteros. */
export async function cancelarVideo(trabajoId: string): Promise<RespuestaDeVideo> {
  await requiereCuentaLista('/panel/mis-propiedades');
  if (!supabaseConfigurado()) return noVideo(VIDEO_NO_DISPONIBLE);

  const supabase = await clienteServidor();
  const { data: trabajo } = await supabase
    .from('ai_jobs')
    .select('id, provider_ref')
    .eq('id', trabajoId)
    .maybeSingle();

  const { error } = await supabase.rpc('cancelar_trabajo_ia', { p_job_id: trabajoId });
  if (error) return noVideo('No pudimos cancelar ese video.');

  const proveedor = proveedorDeVideo();
  if (trabajo?.provider_ref && proveedor.cancelar) {
    // Que el proveedor no sepa cancelar no cambia nada de este lado: el
    // trabajo ya está cancelado y los créditos ya volvieron.
    await proveedor.cancelar(trabajo.provider_ref);
  }

  return {
    ok: true,
    video: { trabajoId, videoId: null, estado: 'cancelado', progreso: 0 },
  };
}

// ---------------------------------------------------------------------
// 5. Descargar
// ---------------------------------------------------------------------

/**
 * Enlace de descarga, firmado y de vida corta.
 *
 * La autorización la decide la base —`registrar_descarga_de_video()`
 * devuelve la ruta solo si el video está listo, no venció y quien pide
 * administra el aviso—. Si no corresponde, no hay enlace que firmar.
 */
export async function enlaceDeDescarga(
  videoId: string,
): Promise<{ ok: boolean; url?: string; mensaje?: string }> {
  await requiereCuentaLista('/panel/mis-propiedades');
  if (!supabaseConfigurado()) return { ok: false, mensaje: VIDEO_NO_DISPONIBLE };

  const supabase = await clienteServidor();
  const { data: ruta, error } = await supabase.rpc('registrar_descarga_de_video', {
    p_video_id: videoId,
  });

  if (error || !ruta) {
    return {
      ok: false,
      mensaje: 'Ese video ya no está disponible para descargar.',
    };
  }

  const { data, error: errorFirma } = await clienteAdministrador()
    .storage.from(CUBETA)
    .createSignedUrl(ruta, VIDA_DEL_ENLACE, { download: true });

  if (errorFirma || !data?.signedUrl) {
    return { ok: false, mensaje: 'No pudimos preparar la descarga. Vuelve a intentarlo.' };
  }

  return { ok: true, url: data.signedUrl };
}

// ---------------------------------------------------------------------
// El trabajo sucio
// ---------------------------------------------------------------------

/** Estado actual mirando la base, sin preguntarle al proveedor. */
async function estadoActual(trabajoId: string): Promise<RespuestaDeVideo> {
  const supabase = await clienteServidor();

  const { data: trabajo } = await supabase
    .from('ai_jobs')
    .select('id, status, progress, error')
    .eq('id', trabajoId)
    .maybeSingle();

  if (!trabajo) return noVideo('No encontramos ese video.');

  const { data: video } = await supabase
    .from('property_videos')
    .select('id, status, duration_ms, expires_at')
    .eq('ai_job_id', trabajoId)
    .maybeSingle();

  const mapa = {
    queued: 'encolado',
    running: 'renderizando',
    succeeded: 'listo',
    failed: 'falla',
    canceled: 'cancelado',
  } as const;

  return {
    ok: true,
    video: {
      trabajoId,
      videoId: video?.id ?? null,
      estado: mapa[trabajo.status],
      progreso: trabajo.progress,
      mensaje: trabajo.status === 'failed' ? 'El video no se pudo terminar.' : undefined,
      duracionMs: video?.duration_ms ?? undefined,
      venceEl: video?.expires_at ?? undefined,
      sePuedeReintentar: trabajo.status === 'failed',
    },
  };
}

/**
 * Algo salió mal: se devuelven los créditos y se cierra el trabajo.
 *
 * El orden importa. Primero la devolución, porque es lo que le duele a
 * la persona; recién después el estado. Si el proceso se cortara entre
 * las dos, quedaría un trabajo abierto sin reserva, que es mucho mejor
 * que un trabajo cerrado con el crédito perdido.
 */
async function abandonar(
  trabajoId: string,
  error: unknown,
  proveedor: string,
): Promise<RespuestaDeVideo> {
  const servicio = clienteAdministrador();

  const falla =
    error instanceof FallaDeProveedor
      ? error
      : new FallaDeProveedor(
          VIDEO_NO_DISPONIBLE,
          error instanceof Error ? error.message : 'error desconocido',
        );

  await servicio.rpc('devolver_creditos_ia', { p_job_id: trabajoId, p_motivo: 'falla' });

  const { data: cerrado } = await servicio.rpc('fallar_trabajo_ia', {
    p_job_id: trabajoId,
    p_error: falla.detalle,
    p_provider: proveedor,
  });

  await servicio
    .from('property_videos')
    .update({
      status: 'failed',
      error: falla.detalle,
      finished_at: new Date().toISOString(),
    })
    .eq('ai_job_id', trabajoId);

  const quedan = cerrado ? Math.max(cerrado.max_attempts - cerrado.attempts, 0) : 0;

  return {
    ok: true,
    video: {
      trabajoId,
      videoId: null,
      estado: 'falla',
      progreso: 0,
      mensaje: `${falla.message} Te devolvimos los créditos.`,
      sePuedeReintentar: falla.reintentable && quedan > 0,
    },
  };
}

/** Baja el archivo del proveedor y lo guarda en la cubeta privada. */
async function guardar(
  carpeta: string,
  url: string,
  tipo: string,
): Promise<{ ruta: string; bytes: number }> {
  const respuesta = await fetch(url);
  if (!respuesta.ok) {
    throw new FallaDeProveedor(
      'El video quedó, pero no pudimos bajarlo. Vuelve a intentarlo.',
      `descarga http ${respuesta.status}`,
    );
  }

  const cuerpo = Buffer.from(await respuesta.arrayBuffer());
  const extension = tipo.startsWith('image/') ? 'webp' : tipo.includes('webm') ? 'webm' : 'mp4';
  const ruta = rutaDeVideo(carpeta, Date.now(), extension);

  const { error } = await clienteAdministrador()
    .storage.from(CUBETA)
    .upload(ruta, cuerpo, { contentType: tipo, upsert: false });

  if (error) {
    throw new FallaDeProveedor(
      'No pudimos guardar el video. Vuelve a intentarlo.',
      `storage: ${error.message}`,
    );
  }

  return { ruta, bytes: cuerpo.byteLength };
}
