'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import { requiereCuentaLista } from '@/lib/auth/sesion';
import { puedePublicar } from '@/lib/auth/roles';
import { TIPO_DESDE_SLUG } from '@/lib/catalogo';
import { esMotivoDeCierre } from '@/lib/etiquetas';
import {
  esquemaDeAviso,
  pasosIncompletos,
  rutaDeFoto,
  type BorradorDeAviso,
} from '@/lib/validacion/aviso';
import { almacenamiento } from '@/lib/almacenamiento/supabase';
import { desplazarPunto, centroDeDistrito } from '@/lib/avisos/desplazar';
import type { Estado } from '@/features/cuentas/acciones';

/**
 * Acciones del asistente de publicación.
 *
 * El borrador vive en la base desde el primer paso, así que recargar la
 * página, cambiar de dispositivo o cerrar el navegador no pierde nada.
 * Guardarlo en el navegador habría sido más simple y habría fallado
 * exactamente cuando más duele: a la mitad de subir las fotos.
 */

const SIN_CONEXION: Estado = {
  ok: false,
  mensaje: 'No pudimos guardar en este momento. Vuelve a intentarlo en un rato.',
};

/** Solo quien puede publicar entra al asistente. */
async function quienPublica() {
  const perfil = await requiereCuentaLista('/publicar');
  if (!puedePublicar(perfil.role)) {
    redirect('/panel?aviso=cuenta-sin-publicacion');
  }
  return perfil;
}

// ---------------------------------------------------------------------
// Borrador
// ---------------------------------------------------------------------

export type GuardadoDeBorrador = { ok: boolean; id?: string; guardadoEn?: string };

/**
 * Guarda el borrador. Se llama sola cada pocos segundos.
 *
 * Devuelve el identificador para que el primer guardado le diga al
 * asistente con qué borrador está trabajando, y la hora, que es lo que
 * se muestra como «guardado hace un momento».
 */
export async function guardarBorrador(
  borradorId: string | null,
  datos: BorradorDeAviso,
  paso: number,
): Promise<GuardadoDeBorrador> {
  const perfil = await quienPublica();
  if (!supabaseConfigurado()) return { ok: false };

  try {
    const supabase = await clienteServidor();

    if (borradorId) {
      const { error } = await supabase
        .from('listing_drafts')
        .update({ datos, paso })
        .eq('id', borradorId);

      if (error) return { ok: false };
      return { ok: true, id: borradorId, guardadoEn: new Date().toISOString() };
    }

    const { data, error } = await supabase
      .from('listing_drafts')
      .insert({ user_id: perfil.id, datos, paso })
      .select('id')
      .single();

    if (error || !data) return { ok: false };
    return { ok: true, id: data.id, guardadoEn: new Date().toISOString() };
  } catch {
    return { ok: false };
  }
}

export async function descartarBorrador(borradorId: string): Promise<void> {
  await quienPublica();
  if (!supabaseConfigurado()) return;

  try {
    const supabase = await clienteServidor();
    await supabase.from('listing_drafts').delete().eq('id', borradorId);
  } catch {
    // Si falla, el borrador queda: es menos grave que perderlo.
  }

  revalidatePath('/publicar');
  redirect('/panel/mis-propiedades');
}

// ---------------------------------------------------------------------
// Envío a revisión
// ---------------------------------------------------------------------

/**
 * Convierte el borrador en un aviso y lo manda a revisión.
 *
 * El aviso nace en `in_review`, nunca en `published`. Eso lo garantiza
 * la política de inserción de la base, no este código: aunque alguien
 * llamara a la API directamente pidiendo 'published', la RLS lo
 * rechaza. Acá se pide `in_review` porque es lo correcto, no porque sea
 * lo único que impide saltarse la moderación.
 */
export async function enviarARevision(
  borradorId: string,
  datos: BorradorDeAviso,
): Promise<Estado> {
  const perfil = await quienPublica();

  const revision = esquemaDeAviso.safeParse(datos);
  if (!revision.success) {
    const faltan = pasosIncompletos(datos);
    return {
      ok: false,
      mensaje: `Todavía falta completar ${faltan.length === 1 ? 'un paso' : `${faltan.length} pasos`}. Revisa los que están marcados.`,
    };
  }

  if (!supabaseConfigurado()) return SIN_CONEXION;

  const aviso = revision.data;
  const tipo = TIPO_DESDE_SLUG[aviso.tipo];
  if (!tipo) return { ok: false, mensaje: 'Ese tipo de propiedad no existe.' };

  // El punto que se publica va desplazado, salvo que quien publica haya
  // elegido mostrar la dirección exacta. El real queda en la tabla
  // aparte, con su propia política de acceso.
  const centro = centroDeDistrito(aviso.distrito);
  const publico = aviso.privacidad === 'exact' ? centro : desplazarPunto(centro, borradorId);

  try {
    const supabase = await clienteServidor();

    const { data: creado, error } = await supabase
      .from('properties')
      .insert({
        owner_id: perfil.id,
        title: aviso.titulo,
        description: aviso.descripcion,
        operation: aviso.operacion,
        property_type: tipo,
        currency: aviso.moneda,
        price: aviso.precio,
        maintenance: aviso.mantenimiento ?? null,
        total_area: aviso.areaTotal,
        built_area: aviso.areaTechada ?? null,
        bedrooms: aviso.dormitorios ?? null,
        bathrooms: aviso.banos ?? null,
        parking: aviso.cocheras ?? null,
        age_years: aviso.antiguedad ?? null,
        furnished: aviso.amoblado,
        pet_policy: aviso.mascotas ?? null,
        address_privacy: aviso.privacidad,
        department: aviso.departamento,
        province: aviso.provincia,
        district: aviso.distrito,
        // La zona publicable, para poder buscar por ella sin tocar la
        // tabla de la dirección exacta. Solo si la privacidad elegida lo
        // permite: quien pidió mostrar únicamente el distrito no queda
        // acotado a unas cuadras por un filtro que se agregó después.
        urbanization:
          aviso.privacidad === 'district_only' ? null : aviso.urbanizacion || null,
        lat: publico.lat,
        lon: publico.lon,
        publication_status: 'in_review',
      })
      .select('id, code')
      .single();

    if (error || !creado) return SIN_CONEXION;

    // La dirección exacta va aparte, con su propia política de acceso.
    await supabase.from('property_locations').insert({
      property_id: creado.id,
      address_line: aviso.direccion,
      urbanization: aviso.urbanizacion || null,
      reference: aviso.referencia || null,
      exact_lat: centro.lat,
      exact_lon: centro.lon,
    });

    if (aviso.caracteristicas.length > 0) {
      await supabase
        .from('property_features')
        .insert(aviso.caracteristicas.map((feature) => ({ property_id: creado.id, feature })));
    }

    if (aviso.fotos.length > 0) {
      await supabase.from('property_media').insert(
        aviso.fotos.map((foto, i) => ({
          property_id: creado.id,
          url: foto.url,
          alt: foto.alt || null,
          sort_order: i,
          is_cover: foto.portada || i === 0,
        })),
      );
    }

    await supabase.from('listing_drafts').delete().eq('id', borradorId);
  } catch {
    return SIN_CONEXION;
  }

  revalidatePath('/panel/mis-propiedades');
  redirect('/panel/mis-propiedades?enviado=1');
}

// ---------------------------------------------------------------------
// Flujos de estado
// ---------------------------------------------------------------------

/**
 * Cambia el estado de un aviso propio.
 *
 * Solo se aceptan las transiciones que la persona puede hacer por su
 * cuenta: pausar, reanudar y archivar. Publicar y rechazar son de
 * moderación, y el trigger de la base los rechaza aunque lleguen por
 * otra vía.
 */
async function cambiarEstado(
  propertyId: string,
  estado: 'paused' | 'published' | 'archived',
  ruta = '/panel/mis-propiedades',
): Promise<Estado> {
  await quienPublica();
  if (!supabaseConfigurado()) return SIN_CONEXION;

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase
      .from('properties')
      .update({ publication_status: estado })
      .eq('id', propertyId);

    if (error) {
      return {
        ok: false,
        mensaje:
          estado === 'published'
            ? 'Este aviso no se puede reanudar: tiene que pasar por revisión.'
            : 'No pudimos cambiar el estado del aviso. Reintenta en un momento.',
      };
    }
  } catch {
    return SIN_CONEXION;
  }

  revalidatePath(ruta);
  return { ok: true };
}

export async function pausarAviso(propertyId: string): Promise<Estado> {
  return cambiarEstado(propertyId, 'paused');
}

/** Reanudar solo funciona sobre un aviso que ya estuvo aprobado. */
export async function reanudarAviso(propertyId: string): Promise<Estado> {
  return cambiarEstado(propertyId, 'published');
}

export async function archivarAviso(propertyId: string): Promise<Estado> {
  return cambiarEstado(propertyId, 'archived');
}

/**
 * Vuelve a mandar a revisión un aviso rechazado o archivado.
 *
 * Se limpia el motivo del rechazo: si quedara, la persona seguiría
 * viendo en su panel por qué se lo rechazaron la vez anterior aunque ya
 * lo haya corregido.
 */
export async function reenviarARevision(propertyId: string): Promise<Estado> {
  await quienPublica();
  if (!supabaseConfigurado()) return SIN_CONEXION;

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase
      .from('properties')
      .update({ publication_status: 'in_review', rejection_reason: null })
      .eq('id', propertyId);

    if (error) return SIN_CONEXION;
  } catch {
    return SIN_CONEXION;
  }

  revalidatePath('/panel/mis-propiedades');
  return { ok: true, mensaje: 'Listo, lo mandamos de nuevo a revisión.' };
}

/**
 * Abre un aviso ya creado para editarlo.
 *
 * Se arma un borrador con lo que ya tiene. El aviso publicado sigue
 * visible mientras se edita: bajarlo apenas alguien toca "editar" sería
 * castigar a quien corrige una falta de ortografía.
 */
export async function editarAviso(propertyId: string): Promise<void> {
  const perfil = await quienPublica();
  if (!supabaseConfigurado()) redirect('/panel/mis-propiedades');

  let destino = '/panel/mis-propiedades';

  try {
    const supabase = await clienteServidor();

    const { data: existente } = await supabase
      .from('listing_drafts')
      .select('id')
      .eq('property_id', propertyId)
      .maybeSingle();

    if (existente) {
      destino = `/publicar?borrador=${existente.id}`;
    } else {
      const { data: aviso } = await supabase
        .from('properties')
        .select(
          '*, property_features (feature), property_media (id, url, alt, is_cover, sort_order)',
        )
        .eq('id', propertyId)
        .single();

      if (aviso) {
        const { data: creado } = await supabase
          .from('listing_drafts')
          .insert({
            user_id: perfil.id,
            property_id: propertyId,
            paso: 0,
            datos: aBorrador(aviso),
          })
          .select('id')
          .single();

        if (creado) destino = `/publicar?borrador=${creado.id}`;
      }
    }
  } catch {
    // Se cae al panel.
  }

  redirect(destino);
}

/** Pasa un aviso guardado a la forma que entiende el asistente. */
function aBorrador(aviso: Record<string, unknown>): BorradorDeAviso {
  const medios = (aviso.property_media ?? []) as {
    id: string;
    url: string;
    alt: string | null;
    is_cover: boolean;
    sort_order: number;
  }[];

  const rasgos = (aviso.property_features ?? []) as { feature: string }[];

  const tipos = Object.entries(TIPO_DESDE_SLUG).find(
    ([, valor]) => valor === aviso.property_type,
  );

  return {
    operacion: aviso.operation as BorradorDeAviso['operacion'],
    tipo: tipos?.[0],
    departamento: aviso.department as string,
    provincia: aviso.province as string,
    distrito: aviso.district as string,
    privacidad: aviso.address_privacy as BorradorDeAviso['privacidad'],
    moneda: aviso.currency as BorradorDeAviso['moneda'],
    precio: Number(aviso.price),
    mantenimiento: aviso.maintenance === null ? undefined : Number(aviso.maintenance),
    areaTotal: Number(aviso.total_area),
    areaTechada: aviso.built_area === null ? undefined : Number(aviso.built_area),
    dormitorios: aviso.bedrooms === null ? undefined : Number(aviso.bedrooms),
    banos: aviso.bathrooms === null ? undefined : Number(aviso.bathrooms),
    cocheras: aviso.parking === null ? undefined : Number(aviso.parking),
    antiguedad: aviso.age_years === null ? undefined : Number(aviso.age_years),
    amoblado: aviso.furnished as BorradorDeAviso['amoblado'],
    mascotas: (aviso.pet_policy ?? undefined) as BorradorDeAviso['mascotas'],
    caracteristicas: rasgos.map((r) => r.feature),
    titulo: aviso.title as string,
    descripcion: aviso.description as string,
    fotos: [...medios]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m) => ({ id: m.id, url: m.url, alt: m.alt ?? '', portada: m.is_cover })),
  };
}

/**
 * Enlace temporal al archivo original de una foto.
 *
 * El original vive en un depósito privado porque lleva los metadatos EXIF
 * con las coordenadas de dónde se tomó. Quien administra el aviso sí
 * tiene derecho a bajárselo —es su foto— y esta es la única forma de
 * entregárselo: un enlace que caduca, no una dirección permanente que se
 * pueda reenviar.
 *
 * **Quién puede no lo decide esta función.** El enlace se pide con la
 * sesión de quien llama, así que lo resuelve la política
 * `el original lo ve quien administra el aviso` de `storage.objects`. Si
 * la persona no administra ese aviso, Supabase no firma nada y acá llega
 * `null`. Escribir la comprobación también acá sería una segunda fuente
 * de verdad que puede quedar desalineada con la primera.
 */
export async function enlaceAlOriginal(
  avisoId: string,
  marca: number,
): Promise<{ ok: true; url: string } | { ok: false; mensaje: string }> {
  await quienPublica();

  if (!supabaseConfigurado()) {
    return { ok: false, mensaje: 'No pudimos preparar la descarga en este momento.' };
  }

  const url = await almacenamiento().urlFirmada(
    'originales',
    rutaDeFoto(avisoId, marca, true),
    // Cinco minutos: alcanza para descargar y no para reenviar.
    300,
  );

  return url
    ? { ok: true, url }
    : { ok: false, mensaje: 'No pudimos preparar la descarga de esa foto.' };
}

// ---------------------------------------------------------------------
// Cerrar un aviso
// ---------------------------------------------------------------------

/**
 * Cierra un aviso: vendido, alquilado o retirado.
 *
 * Sale de los listados públicos en el momento, y no hay que programarlo:
 * la política `el publico ve los avisos publicados` exige
 * `status = 'available'`, así que en cuanto deja de estarlo el aviso
 * desaparece de la búsqueda y de su ficha para todo el que no sea su
 * dueño o moderación.
 *
 * Quién puede cerrarlo lo decide RLS —`cada quien edita sus avisos`— y
 * desde qué estado lo decide el disparador `proteger_estados_aviso`. Acá
 * se valida el motivo, que es lo único que la base no puede saber: que
 * llegue uno de los tres y no una cadena cualquiera.
 */
export async function cerrarAviso(propertyId: string, motivo: string): Promise<Estado> {
  await quienPublica();
  if (!supabaseConfigurado()) return SIN_CONEXION;

  if (!esMotivoDeCierre(motivo)) {
    return { ok: false, mensaje: 'Elige por qué cierras el aviso.' };
  }

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase
      .from('properties')
      .update({ status: motivo })
      .eq('id', propertyId);

    if (error) {
      // El disparador habla en español y dice lo que corresponde; el
      // resto de los errores no tienen por qué llegarle a nadie crudos.
      const suyo = /Solo se puede cerrar/i.test(error.message);
      return {
        ok: false,
        mensaje: suyo
          ? 'Solo puedes cerrar un aviso que esté publicado o pausado.'
          : 'No pudimos cerrar el aviso. Reintenta en un momento.',
      };
    }
  } catch {
    return SIN_CONEXION;
  }

  revalidatePath('/panel/mis-propiedades');
  return { ok: true, mensaje: 'Listo. El aviso ya no aparece en las búsquedas.' };
}

/**
 * Vuelve a ofrecer un aviso cerrado.
 *
 * Una venta se cae, un inquilino se arrepiente. Reabrir no pasa por
 * revisión otra vez: el aviso ya estaba aprobado y su contenido no
 * cambió.
 */
export async function reabrirAviso(propertyId: string): Promise<Estado> {
  await quienPublica();
  if (!supabaseConfigurado()) return SIN_CONEXION;

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase
      .from('properties')
      .update({ status: 'available' })
      .eq('id', propertyId);

    if (error) return { ok: false, mensaje: 'No pudimos reabrir el aviso.' };
  } catch {
    return SIN_CONEXION;
  }

  revalidatePath('/panel/mis-propiedades');
  return { ok: true, mensaje: 'Listo, el aviso vuelve a aparecer.' };
}
