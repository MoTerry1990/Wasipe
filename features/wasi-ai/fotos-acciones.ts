'use server';

import { revalidatePath } from 'next/cache';
import { clienteServidor } from '@/lib/supabase/servidor';
import { clienteAdministrador } from '@/lib/supabase/administrador';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import { requiereCuentaLista } from '@/lib/auth/sesion';
import { proveedorDeImagen } from '@/lib/ia/registro';
import { FallaDeProveedor, ImagenRechazada, IMAGEN_NO_DISPONIBLE } from '@/lib/ia/proveedor';
import {
  EDICIONES,
  LIMITE_FOTOS_POR_HORA,
  PESO_MAXIMO_ENVIO,
  armarPeticionDeImagen,
  esEdicion,
  etiquetaDe,
  huellaDeEdicion,
  rutaDeEdicion,
} from '@/lib/ia/imagenes';
import type { RespuestaDeFoto } from '@/features/wasi-ai/fotos-tipos';

/**
 * Mejora de fotos y amoblamiento virtual.
 *
 * El ciclo es el mismo del asistente de texto, con dos diferencias que
 * importan:
 *
 *   · La foto original NUNCA se toca. La propuesta se sube como archivo
 *     aparte, en la subcarpeta `ia/`, y solo se convierte en foto del
 *     aviso si la persona la confirma. Descartarla borra ese archivo.
 *   · Los proveedores de imagen fallan más que los de texto, así que el
 *     trabajo se puede reintentar. Cada intento fallido sigue sin cobrar.
 *
 * Todo corre en el servidor: la clave del proveedor no sale de acá y la
 * imagen editada se sube con la clave de servicio, no desde el navegador.
 */

const CUBETA = 'avisos';

type Negativa = Extract<RespuestaDeFoto, { ok: false }>;

function no(mensaje: string, extra: Omit<Negativa, 'ok' | 'mensaje'> = {}): RespuestaDeFoto {
  return { ok: false, mensaje, ...extra };
}

// ---------------------------------------------------------------------
// Pedir una mejora
// ---------------------------------------------------------------------

export async function pedirEdicionDeFoto(
  mediaId: string,
  edicionCruda: string,
  opcion?: string,
): Promise<RespuestaDeFoto> {
  await requiereCuentaLista('/panel/mis-propiedades');
  if (!supabaseConfigurado()) return no(IMAGEN_NO_DISPONIBLE);

  if (!esEdicion(edicionCruda)) return no('Esa mejora no existe.');
  const edicion = edicionCruda;
  const config = EDICIONES[edicion];

  const proveedor = proveedorDeImagen();
  if (!proveedor.disponible()) return no(IMAGEN_NO_DISPONIBLE);
  if (!proveedor.soporta(edicion)) {
    return no(`«${config.etiqueta}» no está disponible con el proveedor configurado.`);
  }

  const supabase = await clienteServidor();

  // La RLS ya limita a las fotos de avisos que esta persona administra.
  const { data: foto } = await supabase
    .from('property_media')
    .select('id, property_id, url, storage_path, ai_edited')
    .eq('id', mediaId)
    .maybeSingle();

  if (!foto) return no('No encontramos esa foto.');
  if (foto.ai_edited) {
    return no('Se parte siempre de tu foto original, no de una ya mejorada.');
  }

  // ------------------------------------------------------------------
  // 1. Abrir el trabajo
  // ------------------------------------------------------------------
  const { data: trabajo, error: errorInicio } = await supabase.rpc('iniciar_trabajo_ia', {
    p_kind: config.familia,
    p_operation: edicion,
    p_input: { media_id: mediaId, edicion, opcion: opcion ?? null },
    p_idempotency_key: huellaDeEdicion(mediaId, edicion, opcion),
    p_property_id: foto.property_id,
    p_costo: config.costo,
    p_limite_hora: LIMITE_FOTOS_POR_HORA,
  });

  if (errorInicio || !trabajo) return no(errorInicio?.message || IMAGEN_NO_DISPONIBLE);

  // Pedido repetido que ya terminó: se devuelve lo de antes sin volver a
  // llamar al proveedor ni volver a cobrar.
  const guardado = trabajo.output as { propuesta?: string } | null;
  if (trabajo.status === 'succeeded' && guardado?.propuesta) {
    return {
      ok: true,
      propuesta: {
        trabajoId: trabajo.id,
        edicion,
        original: foto.url,
        propuesta: guardado.propuesta,
        etiqueta: etiquetaDe(edicion),
        intentosRestantes: 0,
      },
    };
  }

  if (trabajo.status === 'failed') {
    const reabierto = await reabrir(trabajo.id);
    if (!reabierto) {
      return no(
        'Ya lo intentamos varias veces y no salió. Publica la foto tal como está o prueba con otra mejora.',
        { trabajoId: trabajo.id },
      );
    }
  } else if (trabajo.status !== 'running') {
    return no('Ese pedido ya se procesó. Prueba con otra mejora.');
  }

  return await procesar({
    trabajoId: trabajo.id,
    mediaId: foto.id,
    carpeta: foto.property_id,
    rutaOrigen: foto.storage_path,
    urlOrigen: foto.url,
    edicion,
    opcion,
  });
}

/** Vuelve a intentar un trabajo que falló. No cobra: el cobro es al terminar. */
export async function reintentarEdicionDeFoto(trabajoId: string): Promise<RespuestaDeFoto> {
  await requiereCuentaLista('/panel/mis-propiedades');
  if (!supabaseConfigurado()) return no(IMAGEN_NO_DISPONIBLE);

  const supabase = await clienteServidor();
  const { data: trabajo } = await supabase
    .from('ai_jobs')
    .select('id, input, property_id, status')
    .eq('id', trabajoId)
    .maybeSingle();

  if (!trabajo) return no('No encontramos ese pedido.');

  const entrada = trabajo.input as { media_id?: string; edicion?: string; opcion?: string };
  if (!entrada?.media_id || !entrada.edicion || !esEdicion(entrada.edicion)) {
    return no('No pudimos repetir ese pedido.');
  }

  const reabierto = await reabrir(trabajoId);
  if (!reabierto) {
    return no(
      'Ya lo intentamos varias veces y no salió. Publica la foto tal como está o prueba con otra mejora.',
    );
  }

  const { data: foto } = await supabase
    .from('property_media')
    .select('id, property_id, url, storage_path')
    .eq('id', entrada.media_id)
    .maybeSingle();

  if (!foto) return no('No encontramos esa foto.');

  return await procesar({
    trabajoId,
    mediaId: foto.id,
    carpeta: foto.property_id,
    rutaOrigen: foto.storage_path,
    urlOrigen: foto.url,
    edicion: entrada.edicion,
    opcion: entrada.opcion,
  });
}

// ---------------------------------------------------------------------
// Confirmar o descartar
// ---------------------------------------------------------------------

/**
 * La persona confirma que quiere esta versión en su aviso.
 *
 * Dos pasos, y los dos hacen falta: primero queda la constancia de la
 * confirmación, y recién con esa constancia la base deja adjuntar la
 * imagen. Sin aceptar, `adjuntar_foto_editada()` se niega.
 *
 * La foto original sigue exactamente donde estaba: esto agrega una foto,
 * no reemplaza ninguna.
 */
export async function aplicarEdicionDeFoto(
  trabajoId: string,
): Promise<{ ok: boolean; mensaje?: string }> {
  await requiereCuentaLista('/panel/mis-propiedades');
  if (!supabaseConfigurado()) return { ok: false, mensaje: IMAGEN_NO_DISPONIBLE };

  const supabase = await clienteServidor();

  const { data: trabajo } = await supabase
    .from('ai_jobs')
    .select('id, output, operation, property_id')
    .eq('id', trabajoId)
    .maybeSingle();

  const salida = trabajo?.output as {
    propuesta?: string;
    ruta?: string;
    original_media_id?: string;
    ancho?: number;
    alto?: number;
    bytes?: number;
  } | null;

  if (!trabajo || !salida?.propuesta || !salida.ruta || !salida.original_media_id) {
    return { ok: false, mensaje: 'No encontramos esa propuesta.' };
  }
  if (!trabajo.operation || !esEdicion(trabajo.operation)) {
    return { ok: false, mensaje: 'No pudimos aplicar esa mejora.' };
  }

  const { error: errorAceptar } = await supabase.rpc('aceptar_trabajo_ia', {
    p_job_id: trabajoId,
  });
  if (errorAceptar) {
    return { ok: false, mensaje: 'Ese resultado ya no se puede aplicar.' };
  }

  const { error } = await supabase.rpc('adjuntar_foto_editada', {
    p_job_id: trabajoId,
    p_original_media_id: salida.original_media_id,
    p_url: salida.propuesta,
    p_storage_path: salida.ruta,
    p_edit_kind: trabajo.operation,
    p_width: salida.ancho ?? null,
    p_height: salida.alto ?? null,
    p_bytes: salida.bytes ?? null,
  });

  if (error) return { ok: false, mensaje: 'No pudimos agregarla al aviso.' };

  revalidatePath('/panel/mis-propiedades');
  return { ok: true };
}

/**
 * La persona no la quiere.
 *
 * Se anota el descarte y se borra el archivo que se había subido para
 * mostrar la comparación. La foto original ni se entera.
 */
export async function descartarEdicionDeFoto(trabajoId: string): Promise<{ ok: boolean }> {
  await requiereCuentaLista('/panel/mis-propiedades');
  if (!supabaseConfigurado()) return { ok: false };

  const supabase = await clienteServidor();
  const { data: trabajo } = await supabase
    .from('ai_jobs')
    .select('id, output')
    .eq('id', trabajoId)
    .maybeSingle();

  const { error } = await supabase.rpc('descartar_trabajo_ia', { p_job_id: trabajoId });

  const ruta = (trabajo?.output as { ruta?: string } | null)?.ruta;
  if (ruta) {
    try {
      await clienteAdministrador().storage.from(CUBETA).remove([ruta]);
    } catch {
      // Un archivo huérfano en `ia/` no se ve en ningún lado; la
      // limpieza programada lo recoge. Perder el descarte sí importaría.
    }
  }

  return { ok: !error };
}

// ---------------------------------------------------------------------
// El trabajo sucio
// ---------------------------------------------------------------------

type Encargo = {
  trabajoId: string;
  mediaId: string;
  carpeta: string;
  rutaOrigen: string | null;
  urlOrigen: string;
  edicion: Parameters<typeof etiquetaDe>[0];
  opcion?: string;
};

async function procesar(encargo: Encargo): Promise<RespuestaDeFoto> {
  const servicio = clienteAdministrador();
  const proveedor = proveedorDeImagen();
  const config = EDICIONES[encargo.edicion];
  const empezo = Date.now();

  try {
    const entrada = await bajarOriginal(encargo.rutaOrigen, encargo.urlOrigen);

    const respuesta = await proveedor.editarImagen(
      armarPeticionDeImagen(encargo.edicion, entrada, encargo.opcion),
    );

    // La propuesta se sube a `ia/`, nunca encima de nada. Si la persona
    // la descarta, este archivo se borra y no queda rastro en el aviso.
    const bytes = Buffer.from(respuesta.imagen.datos, 'base64');
    const extension = respuesta.imagen.tipo.split('/')[1]?.replace('jpeg', 'jpg') || 'webp';
    const ruta = rutaDeEdicion(encargo.carpeta, Date.now(), extension);

    const { error: fallo } = await servicio.storage.from(CUBETA).upload(ruta, bytes, {
      contentType: respuesta.imagen.tipo,
      upsert: false,
    });
    if (fallo) {
      throw new FallaDeProveedor(
        'No pudimos guardar la foto mejorada. Vuelve a intentarlo.',
        `storage: ${fallo.message}`,
      );
    }

    const {
      data: { publicUrl },
    } = servicio.storage.from(CUBETA).getPublicUrl(ruta);

    await servicio.rpc('terminar_trabajo_ia', {
      p_job_id: encargo.trabajoId,
      p_output: {
        propuesta: publicUrl,
        ruta,
        original_media_id: encargo.mediaId,
        bytes: bytes.byteLength,
        etiqueta: etiquetaDe(encargo.edicion),
      },
      p_provider: respuesta.proveedor,
      p_model: respuesta.modelo,
      p_costo: config.costo,
      p_duration_ms: Date.now() - empezo,
    });

    if (respuesta.costoMicros !== undefined) {
      await servicio
        .from('ai_jobs')
        .update({ provider_cost_micros: respuesta.costoMicros })
        .eq('id', encargo.trabajoId);
    }

    return {
      ok: true,
      propuesta: {
        trabajoId: encargo.trabajoId,
        edicion: encargo.edicion,
        original: encargo.urlOrigen,
        propuesta: publicUrl,
        etiqueta: etiquetaDe(encargo.edicion),
        intentosRestantes: 0,
      },
    };
  } catch (error) {
    const falla =
      error instanceof FallaDeProveedor
        ? error
        : new FallaDeProveedor(
            IMAGEN_NO_DISPONIBLE,
            error instanceof Error ? error.message : 'error desconocido',
          );

    const { data: cerrado } = await servicio.rpc('fallar_trabajo_ia', {
      p_job_id: encargo.trabajoId,
      p_error: falla.detalle,
      p_provider: proveedor.nombre,
      p_duration_ms: Date.now() - empezo,
    });

    const quedan = cerrado ? Math.max(cerrado.max_attempts - cerrado.attempts, 0) : 0;

    return no(falla.message, {
      trabajoId: encargo.trabajoId,
      // Una negativa de moderación del proveedor no se reintenta: diría
      // exactamente lo mismo la segunda vez.
      sePuedeReintentar:
        !(error instanceof ImagenRechazada) && falla.reintentable && quedan > 0,
    });
  }
}

/** Reabre un trabajo fallido. false cuando ya no quedan intentos. */
async function reabrir(trabajoId: string): Promise<boolean> {
  const { data } = await clienteAdministrador().rpc('reintentar_trabajo_ia', {
    p_job_id: trabajoId,
  });
  return Boolean(data);
}

/**
 * Baja la foto de storage para mandársela al proveedor.
 *
 * Se prefiere el archivo de la cubeta a la URL pública: es una llamada
 * menos y no depende de que la CDN esté al día. La URL queda de reserva
 * para fotos viejas que no guardaron su ruta.
 */
async function bajarOriginal(
  ruta: string | null,
  url: string,
): Promise<{ datos: string; tipo: string }> {
  let cuerpo: ArrayBuffer;
  let tipo = 'image/webp';

  if (ruta) {
    const { data, error } = await clienteAdministrador().storage.from(CUBETA).download(ruta);
    if (error || !data) {
      throw new FallaDeProveedor(
        'No pudimos leer tu foto. Vuelve a intentarlo.',
        `descarga: ${error?.message ?? 'sin datos'}`,
      );
    }
    cuerpo = await data.arrayBuffer();
    tipo = data.type || tipo;
  } else {
    const respuesta = await fetch(url);
    if (!respuesta.ok) {
      throw new FallaDeProveedor(
        'No pudimos leer tu foto. Vuelve a intentarlo.',
        `descarga http ${respuesta.status}`,
      );
    }
    cuerpo = await respuesta.arrayBuffer();
    tipo = respuesta.headers.get('content-type') || tipo;
  }

  if (cuerpo.byteLength > PESO_MAXIMO_ENVIO) {
    throw new FallaDeProveedor(
      'Esa foto pesa demasiado para mejorarla. Súbela con menos resolución.',
      `peso ${cuerpo.byteLength}`,
      false,
    );
  }

  return { datos: Buffer.from(cuerpo).toString('base64'), tipo };
}
