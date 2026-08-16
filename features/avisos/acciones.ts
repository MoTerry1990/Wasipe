'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { ZodError } from 'zod';
import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import { asegurarSesion } from '@/lib/avisos/sesion-anonima';
import {
  esquemaConsulta,
  esquemaVisita,
  esquemaDenuncia,
  revisarTrampa,
  CAMPO_TRAMPA,
  RESPUESTA_A_ROBOT,
} from '@/lib/validacion/contacto';
import type { Estado } from '@/features/cuentas/acciones';
import { COOKIE_FAVORITOS } from '@/lib/avisos/favoritos-cookie';
import type { Telefono } from '@/lib/avisos/telefono';

/**
 * Acciones de la ficha del aviso.
 *
 * Todo lo que escribe pasa por tres puertas, en este orden:
 *
 *   1. La trampa y el tiempo mínimo, que no molestan a ninguna persona.
 *   2. La validación, con los mismos esquemas que usa el navegador.
 *   3. El cupo por sesión, contado en la base porque en Vercel cada
 *      petición puede caer en un proceso distinto y un contador en
 *      memoria no serviría de nada.
 */

function porCampo(error: ZodError): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const issue of error.issues) {
    const campo = issue.path[0];
    if (typeof campo === 'string' && !salida[campo]) salida[campo] = issue.message;
  }
  return salida;
}

/** Consume un cupo. Ante cualquier duda, deja pasar: no se bloquea a nadie por un error nuestro. */
async function hayCupo(bucket: string, clave: string, limite: number, ventana = 3600) {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc('consumir_cupo', {
      p_bucket: bucket,
      p_clave: clave,
      p_limite: limite,
      p_ventana_segundos: ventana,
    });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}

const SIN_CONEXION: Estado = {
  ok: false,
  mensaje: 'No pudimos enviar tu mensaje en este momento. Vuelve a intentarlo en un rato.',
};

// ---------------------------------------------------------------------
// Consultas y visitas
// ---------------------------------------------------------------------

async function enviarContacto(tipo: 'message' | 'visit', datos: FormData): Promise<Estado> {
  const trampa = revisarTrampa({
    trampa: datos.get(CAMPO_TRAMPA),
    abiertoEn: datos.get('abiertoEn'),
  });

  // A un robot se le responde que todo salió bien: decirle que lo
  // detectamos es regalarle lo que necesita para ajustar su script.
  if (!trampa.paso) return { ok: true, mensaje: RESPUESTA_A_ROBOT };

  const crudo = {
    aviso: String(datos.get('aviso') ?? ''),
    nombre: datos.get('nombre'),
    celular: datos.get('celular'),
    correo: datos.get('correo') ?? '',
    mensaje: datos.get('mensaje'),
    ...(tipo === 'visit' ? { fecha: datos.get('fecha') } : {}),
  };

  const revision =
    tipo === 'visit' ? esquemaVisita.safeParse(crudo) : esquemaConsulta.safeParse(crudo);

  if (!revision.success) {
    return { ok: false, errores: porCampo(revision.error) };
  }

  if (!supabaseConfigurado()) return SIN_CONEXION;

  const sesion = await asegurarSesion();

  // Cinco consultas por hora alcanzan de sobra para quien está buscando
  // casa en serio, y cortan a quien envía en masa.
  if (!(await hayCupo('contacto', sesion, 5, 3600))) {
    return {
      ok: false,
      mensaje:
        'Enviaste varias consultas seguidas. Espera un rato antes de mandar otra; las anteriores ya le llegaron.',
    };
  }

  // Una sola vez por aviso: el segundo envío al mismo anuncio casi
  // siempre es un doble clic o una recarga.
  if (!(await hayCupo('contacto-aviso', `${sesion}:${revision.data.aviso}`, 1, 3600))) {
    return {
      ok: true,
      mensaje: 'Ya le habías escrito por este aviso. Tu mensaje anterior le llegó bien.',
    };
  }

  // El esquema ya comprobó que la fecha existe y es válida para una
  // visita; acá solo se pasa al formato que guarda la base.
  const fechaCruda: unknown = 'fecha' in revision.data ? revision.data.fecha : null;
  const fechaDeVisita =
    typeof fechaCruda === 'string' ? new Date(fechaCruda).toISOString() : null;

  try {
    const supabase = await clienteServidor();
    const { data: usuario } = await supabase.auth.getUser();

    const { error } = await supabase.from('inquiries').insert({
      property_id: revision.data.aviso,
      // owner_id no se manda: lo pone un trigger de la base a partir del
      // aviso. Mandarlo desde acá sería confiar en el cliente.
      sender_id: usuario.user?.id ?? null,
      sender_name: revision.data.nombre,
      sender_phone: revision.data.celular,
      sender_email: revision.data.correo || null,
      message: revision.data.mensaje,
      kind: tipo,
      preferred_visit_at: fechaDeVisita,
    });

    if (error) return SIN_CONEXION;

    await supabase.rpc('registrar_evento', {
      p_property_id: revision.data.aviso,
      p_kind: tipo === 'visit' ? 'visit_request' : 'contact_form',
      p_session_hash: sesion,
      p_source: 'ficha',
    });

    return {
      ok: true,
      mensaje:
        tipo === 'visit'
          ? 'Listo, enviamos tu pedido de visita con la fecha que propusiste.'
          : 'Listo, enviamos tu mensaje. Te va a responder al número que dejaste.',
    };
  } catch {
    return SIN_CONEXION;
  }
}

export async function enviarConsulta(_previo: Estado, datos: FormData): Promise<Estado> {
  return enviarContacto('message', datos);
}

export async function pedirVisita(_previo: Estado, datos: FormData): Promise<Estado> {
  return enviarContacto('visit', datos);
}

// ---------------------------------------------------------------------
// Teléfono
// ---------------------------------------------------------------------

/**
 * Devuelve el teléfono de quien publica.
 *
 * El número NO viaja en el HTML de la ficha: sale recién acá, cuando
 * alguien lo pide. Así no se puede raspar el portal para armar una lista
 * de teléfonos, y de paso quien publica se entera de cuánta gente quiso
 * llamarlo.
 */
export async function verTelefono(propertyId: string): Promise<Telefono> {
  if (!supabaseConfigurado()) {
    return { ok: false, mensaje: 'No pudimos mostrar el número en este momento.' };
  }

  const sesion = await asegurarSesion();

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc('telefono_de_contacto', {
      p_property_id: propertyId,
      p_session_hash: sesion,
    });

    if (error) {
      return { ok: false, mensaje: 'Demasiadas consultas seguidas. Espera un momento.' };
    }

    const fila = Array.isArray(data) ? data[0] : null;
    if (!fila) {
      return { ok: false, mensaje: 'Este aviso ya no está disponible.' };
    }

    return {
      ok: true,
      telefono: fila.telefono ?? null,
      whatsapp: fila.whatsapp ?? null,
      nombre: fila.nombre ?? '',
    };
  } catch {
    return { ok: false, mensaje: 'No pudimos mostrar el número en este momento.' };
  }
}

// ---------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------

/** Anota una interacción. Nunca falla hacia afuera: es telemetría, no una función del producto. */
export async function anotarEvento(
  propertyId: string,
  tipo: 'whatsapp' | 'share' | 'compare' | 'favorite',
): Promise<void> {
  if (!supabaseConfigurado()) return;

  try {
    const sesion = await asegurarSesion();
    const supabase = await clienteServidor();
    await supabase.rpc('registrar_evento', {
      p_property_id: propertyId,
      p_kind: tipo,
      p_session_hash: sesion,
      p_source: 'ficha',
    });
  } catch {
    // En silencio: que no se registre una estadística no puede romperle
    // la página a nadie.
  }
}

// ---------------------------------------------------------------------
// Favoritos
// ---------------------------------------------------------------------

/**
 * Guarda o saca un favorito.
 *
 * Con sesión iniciada va a la base y queda en todos los dispositivos.
 * Sin sesión va a una cookie: se pierde al cambiar de teléfono, pero
 * sobrevive a la recarga, que es lo que la gente espera. Obligar a
 * registrarse para guardar el primer favorito espanta a la mitad.
 */
export async function alternarFavorito(propertyId: string): Promise<{ guardado: boolean }> {
  const almacen = await cookies();

  if (supabaseConfigurado()) {
    try {
      const supabase = await clienteServidor();
      const { data: usuario } = await supabase.auth.getUser();

      if (usuario.user) {
        const { data: existente } = await supabase
          .from('favorites')
          .select('property_id')
          .eq('property_id', propertyId)
          .maybeSingle();

        if (existente) {
          await supabase.from('favorites').delete().eq('property_id', propertyId);
          revalidatePath('/panel/favoritos');
          return { guardado: false };
        }

        await supabase
          .from('favorites')
          .insert({ user_id: usuario.user.id, property_id: propertyId });

        await supabase.rpc('registrar_evento', {
          p_property_id: propertyId,
          p_kind: 'favorite',
          p_session_hash: await asegurarSesion(),
          p_source: 'ficha',
        });

        revalidatePath('/panel/favoritos');
        return { guardado: true };
      }
    } catch {
      // Se cae a la cookie: perder el favorito por un problema nuestro
      // sería peor que guardarlo solo en este dispositivo.
    }
  }

  const actuales = (almacen.get(COOKIE_FAVORITOS)?.value ?? '')
    .split(',')
    .filter((v) => v.trim() !== '');

  const guardado = !actuales.includes(propertyId);
  const siguientes = guardado
    ? [...actuales, propertyId].slice(-100)
    : actuales.filter((v) => v !== propertyId);

  almacen.set(COOKIE_FAVORITOS, siguientes.join(','), {
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
  });

  return { guardado };
}

// ---------------------------------------------------------------------
// Denuncias
// ---------------------------------------------------------------------

export async function denunciarAviso(_previo: Estado, datos: FormData): Promise<Estado> {
  const revision = esquemaDenuncia.safeParse({
    aviso: String(datos.get('aviso') ?? ''),
    motivo: datos.get('motivo'),
    detalle: datos.get('detalle') ?? '',
  });

  if (!revision.success) {
    return { ok: false, errores: porCampo(revision.error) };
  }

  if (!supabaseConfigurado()) return SIN_CONEXION;

  const sesion = await asegurarSesion();

  if (!(await hayCupo('denuncia', sesion, 10, 3600))) {
    return { ok: false, mensaje: 'Recibimos varias denuncias tuyas seguidas. Espera un rato.' };
  }

  try {
    const supabase = await clienteServidor();
    const { data: usuario } = await supabase.auth.getUser();

    if (!usuario.user) {
      return {
        ok: false,
        mensaje: 'Para denunciar un aviso necesitas una cuenta. Es gratis y toma un minuto.',
      };
    }

    const { error } = await supabase.from('reports').insert({
      property_id: revision.data.aviso,
      reporter_id: usuario.user.id,
      reason: revision.data.motivo,
      detail: revision.data.detalle || null,
    });

    // La denuncia repetida se toma como recibida: el índice único la
    // rechaza y no hace falta contarle eso a quien denuncia.
    if (error && !error.message.includes('duplicate')) return SIN_CONEXION;

    return {
      ok: true,
      mensaje: 'Gracias. Vamos a revisar el aviso; si corresponde, lo damos de baja.',
    };
  } catch {
    return SIN_CONEXION;
  }
}
