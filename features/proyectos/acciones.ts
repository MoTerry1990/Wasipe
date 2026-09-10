'use server';
// NOTA DE ALCANCE: este sprint edita borradores y nada más. Cada acción
// de escritura comprueba el estado EN LA BASE con `exigeBorrador()`, no
// en la pantalla: la pantalla puede estar vieja, y una acción de servidor
// se puede llamar sin pantalla ninguna. Enviar a revisión, aprobar y
// publicar llegan en 25D.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { clienteServidor } from '@/lib/supabase/servidor';
import { exigeAdministrarProyectos, exigeBorrador, SinPermiso } from '@/lib/proyectos/permisos';
import { informacionDeProyecto, tipologia, slugDe } from '@/lib/validacion/proyecto';

/**
 * Las acciones del panel de proyectos.
 *
 * Tres reglas que valen para todas y que no dependen de la pantalla:
 *
 *  1. **El permiso se revalida acá.** Una acción de servidor es un punto
 *     de entrada de red: se puede llamar sin haber visto ningún botón.
 *  2. **Nada de identidad viene del formulario.** `agency_id` sale de la
 *     membresía, `created_by` de la sesión, `code` lo pone la base, y el
 *     estado y los contadores no se tocan.
 *  3. **RLS es la última barrera, no la única.** Si algo se escapara de
 *     acá, la base lo frena igual; pero el usuario merece un mensaje y no
 *     un error de servidor.
 */

export type Estado = { ok: boolean; mensaje?: string; errores?: Record<string, string> };

const RUTA = '/panel/proyectos';

/** Traduce los errores de Zod a un mapa por campo. */
function errores(e: { issues: { path: PropertyKey[]; message: string }[] }): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const i of e.issues) {
    const campo = String(i.path[0] ?? 'general');
    if (!mapa[campo]) mapa[campo] = i.message;
  }
  return mapa;
}

const deFormulario = (datos: FormData) => Object.fromEntries(datos.entries());

/**
 * Crea el borrador y lleva a su editor.
 *
 * El proyecto nace con lo mínimo para existir. Todo lo demás se completa
 * en el editor, guardando cuando se quiera: alguien que arma un proyecto
 * no lo hace de una sentada, y perder lo escrito por cerrar la pestaña
 * sería la peor manera de empezar.
 */
export async function crearBorrador(_previo: Estado, datos: FormData): Promise<Estado> {
  let codigo: string;

  try {
    const membresia = await exigeAdministrarProyectos('/panel/proyectos/nuevo');
    const revision = informacionDeProyecto.safeParse(deFormulario(datos));
    if (!revision.success) return { ok: false, errores: errores(revision.error) };

    const supabase = await clienteServidor();
    const info = revision.data;

    // El slug tiene que ser único: se le agrega un sufijo corto si hace
    // falta. Se calcula acá y no en la base porque depende del nombre,
    // que la persona puede repetir sin querer entre dos proyectos suyos.
    const base = slugDe(info.name) || 'proyecto';
    const sufijo = Math.random().toString(36).slice(2, 6);

    const { data, error } = await supabase
      .from('projects')
      .insert({
        // Identidad: de la sesión y de la membresía. Nunca del formulario.
        agency_id: membresia.agencyId,
        created_by: membresia.perfilId,
        slug: `${base}-${sufijo}`,
        name: info.name,
        description: info.description ?? null,
        stage: info.stage,
        delivery_estimate: info.delivery_estimate ? `${info.delivery_estimate}-01` : null,
        department: info.department,
        province: info.province,
        district: info.district,
        ubigeo: info.ubigeo ?? null,
        address: info.address ?? null,
      })
      .select('code')
      .single();

    if (error || !data) {
      return { ok: false, mensaje: 'No pudimos crear el proyecto. Reintenta en un momento.' };
    }

    codigo = data.code as string;
    revalidatePath(RUTA);
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, mensaje: e.message };
    throw e;
  }

  // El redirect va fuera del try: Next lo implementa lanzando, y
  // atraparlo acá lo convertiría en un error genérico.
  redirect(`${RUTA}/${codigo}`);
}

/** Guarda la información general de un borrador. */
export async function guardarInformacion(_previo: Estado, datos: FormData): Promise<Estado> {
  try {
    await exigeAdministrarProyectos(RUTA);

    const codigo = String(datos.get('codigo') ?? '');
    if (!codigo) return { ok: false, mensaje: 'Falta indicar de qué proyecto se trata.' };

    const revision = informacionDeProyecto.safeParse(deFormulario(datos));
    if (!revision.success) return { ok: false, errores: errores(revision.error) };

    // Solo borradores. Si ya salió de borrador, no se toca nada.
    const borrador = await exigeBorrador(codigo);
    if (!borrador) return { ok: false, mensaje: 'Este proyecto no es de tu inmobiliaria.' };

    const supabase = await clienteServidor();
    const info = revision.data;

    // La lista de campos es explícita: nunca se expande el cuerpo. Sin
    // esto, agregar un campo al formulario alcanzaría para escribir
    // cualquier columna, `publication_status` incluida.
    const { error, count } = await supabase
      .from('projects')
      .update(
        {
          name: info.name,
          description: info.description ?? null,
          stage: info.stage,
          delivery_estimate: info.delivery_estimate ? `${info.delivery_estimate}-01` : null,
          department: info.department,
          province: info.province,
          district: info.district,
          ubigeo: info.ubigeo ?? null,
          address: info.address ?? null,
        },
        { count: 'exact' },
      )
      .eq('code', codigo);

    if (error) return { ok: false, mensaje: 'No pudimos guardar los cambios.' };

    // RLS no devuelve error cuando un update no alcanza ninguna fila:
    // lo deja pasar sin tocar nada. Sin mirar el conteo, un intento
    // bloqueado se vería como un guardado exitoso.
    if (count === 0) return { ok: false, mensaje: 'Este proyecto no es de tu inmobiliaria.' };

    revalidatePath(`${RUTA}/${codigo}`);
    return { ok: true, mensaje: 'Guardado.' };
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, mensaje: e.message };
    throw e;
  }
}

/** Crea o actualiza una tipología. */
export async function guardarTipologia(_previo: Estado, datos: FormData): Promise<Estado> {
  try {
    await exigeAdministrarProyectos(RUTA);

    const codigo = String(datos.get('codigo') ?? '');
    const id = String(datos.get('id') ?? '');
    if (!codigo) return { ok: false, mensaje: 'Falta indicar de qué proyecto se trata.' };

    const revision = tipologia.safeParse(deFormulario(datos));
    if (!revision.success) return { ok: false, errores: errores(revision.error) };

    // Solo borradores, y solo de la propia inmobiliaria: las dos cosas
    // las resuelve `exigeBorrador()` leyendo el estado de la base.
    const borrador = await exigeBorrador(codigo);
    if (!borrador) return { ok: false, mensaje: 'Este proyecto no es de tu inmobiliaria.' };

    const supabase = await clienteServidor();
    const t = revision.data;
    const fila = {
      project_id: borrador.id,
      name: t.name,
      bedrooms: t.bedrooms,
      bathrooms: t.bathrooms,
      parking: t.parking,
      total_area: t.total_area ?? null,
      built_area: t.built_area ?? null,
      currency: t.currency,
      price_from: t.price_from,
      price_to: t.price_to,
      units_total: t.units_total,
      units_available: t.units_available,
      sort_order: t.sort_order,
    };

    const { error, count } = id
      ? await supabase.from('project_typologies').update(fila, { count: 'exact' }).eq('id', id)
      : await supabase.from('project_typologies').insert(fila, { count: 'exact' });

    if (error) return { ok: false, mensaje: 'No pudimos guardar la tipología.' };
    if (id && count === 0) return { ok: false, mensaje: 'Esa tipología no es de tu inmobiliaria.' };

    revalidatePath(`${RUTA}/${codigo}`);
    return { ok: true, mensaje: id ? 'Tipología actualizada.' : 'Tipología agregada.' };
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, mensaje: e.message };
    throw e;
  }
}

/** Borra una tipología. */
export async function borrarTipologia(_previo: Estado, datos: FormData): Promise<Estado> {
  try {
    await exigeAdministrarProyectos(RUTA);

    const codigo = String(datos.get('codigo') ?? '');
    const id = String(datos.get('id') ?? '');
    if (!codigo || !id) return { ok: false, mensaje: 'Falta indicar qué tipología borrar.' };

    const borrador = await exigeBorrador(codigo);
    if (!borrador) return { ok: false, mensaje: 'Este proyecto no es de tu inmobiliaria.' };

    const supabase = await clienteServidor();
    const { error, count } = await supabase
      .from('project_typologies')
      .delete({ count: 'exact' })
      .eq('id', id)
      // Acotado al proyecto del código: sin esto, un `id` de otra
      // inmobiliaria dependería solo de RLS para no borrarse.
      .eq('project_id', borrador.id);

    if (error) return { ok: false, mensaje: 'No pudimos borrar la tipología.' };
    if (count === 0) return { ok: false, mensaje: 'Esa tipología no es de tu inmobiliaria.' };

    revalidatePath(`${RUTA}/${codigo}`);
    return { ok: true, mensaje: 'Tipología borrada.' };
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, mensaje: e.message };
    throw e;
  }
}

/** Sube o baja una tipología en el orden. */
export async function moverTipologia(_previo: Estado, datos: FormData): Promise<Estado> {
  try {
    await exigeAdministrarProyectos(RUTA);

    const codigo = String(datos.get('codigo') ?? '');
    const id = String(datos.get('id') ?? '');
    const haciaArriba = String(datos.get('direccion') ?? '') === 'arriba';
    if (!codigo || !id) return { ok: false, mensaje: 'Falta indicar qué tipología mover.' };

    const borrador = await exigeBorrador(codigo);
    if (!borrador) return { ok: false, mensaje: 'Este proyecto no es de tu inmobiliaria.' };

    const supabase = await clienteServidor();
    const { data: filas } = await supabase
      .from('project_typologies')
      .select('id, sort_order')
      .eq('project_id', borrador.id)
      .order('sort_order')
      .order('created_at');

    const lista = (filas ?? []).map((f) => String(f.id));
    const i = lista.indexOf(id);
    const j = haciaArriba ? i - 1 : i + 1;
    if (i === -1 || j < 0 || j >= lista.length) return { ok: true };

    // Se reescribe el orden entero en vez de intercambiar dos valores:
    // si dos tipologías comparten `sort_order` —cosa que nada impide—,
    // intercambiar no cambia nada visible y el botón parecería roto.
    const uno = lista[i]!;
    const otro = lista[j]!;
    lista[i] = otro;
    lista[j] = uno;

    for (const [posicion, idFila] of lista.entries()) {
      await supabase
        .from('project_typologies')
        .update({ sort_order: posicion })
        .eq('id', idFila)
        .eq('project_id', borrador.id);
    }

    revalidatePath(`${RUTA}/${codigo}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, mensaje: e.message };
    throw e;
  }
}
