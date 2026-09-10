import 'server-only';
import { clienteServidor } from '@/lib/supabase/servidor';
import { requiereCuentaLista } from '@/lib/auth/sesion';
import type { RolEnAgencia, EstadoPublicacion } from '@/types/base-datos';

/**
 * De qué inmobiliaria es quien está mirando, y con qué rol.
 *
 * Esto sale de la membresía real en la base, **nunca del formulario**.
 * Aceptar un `agency_id` enviado por el cliente sería dejar que cualquiera
 * diga de qué empresa es; la RLS lo frenaría, pero el error saldría como
 * una falla del servidor en vez de como un rechazo entendible, y sobre
 * todo dependería de una sola barrera.
 *
 * Ocultar un botón no es autorización. Cada acción de escritura llama a
 * `exigeAdministrarProyectos()` antes de tocar nada.
 */

export type MembresiaDeAgencia = {
  perfilId: string;
  agencyId: string;
  rol: RolEnAgencia;
  /** Solo `agency_admin` escribe. Un `agent` mira. */
  administra: boolean;
};

/**
 * El resultado de buscar la membresía. Son tres casos distintos y no dos.
 *
 * La versión anterior devolvía «la membresía o nada» y tomaba la primera
 * fila cuando había varias. Eso es elegir una empresa **por el orden de
 * una consulta**: sin `order by`, Postgres puede devolverlas en cualquier
 * orden, así que la misma persona podía terminar creando un proyecto a
 * nombre de una inmobiliaria distinta según el día. Un error así no se ve
 * hasta que alguien reclama.
 *
 * Con `varias` la aplicación se detiene y lo dice. El selector viene
 * después; mientras tanto, negarse es mejor que adivinar.
 */
export type ResultadoDeMembresia =
  | { tipo: 'una'; membresia: MembresiaDeAgencia }
  | { tipo: 'ninguna' }
  | { tipo: 'varias'; cuantas: number };

export const MENSAJE_VARIAS =
  'Perteneces a más de una inmobiliaria. Todavía no podemos elegir por ti: escríbenos y dejamos activa la que corresponde.';

export const MENSAJE_NINGUNA = 'Necesitas pertenecer a una inmobiliaria para gestionar proyectos.';

export const MENSAJE_SOLO_ADMIN =
  'Solo quien administra la inmobiliaria puede modificar proyectos.';

export const MENSAJE_SOLO_BORRADOR =
  'Este proyecto ya salió de borrador. Por ahora solo se pueden editar los borradores.';

/**
 * La decisión, separada de la consulta, para poder probar los tres casos.
 *
 * Sin esto, comprobar «qué pasa con dos membresías» exigiría montar dos
 * inmobiliarias en una base de verdad. Acá se le pasan las filas y
 * contesta.
 */
export function decidirMembresia(
  perfilId: string,
  filas: readonly { agency_id: string; role: string }[],
): ResultadoDeMembresia {
  if (filas.length === 0) return { tipo: 'ninguna' };

  // Con más de una NO se elige: se para. Tomar la primera sería elegir
  // por el orden de una consulta, y ese orden no está garantizado.
  if (filas.length > 1) return { tipo: 'varias', cuantas: filas.length };

  const fila = filas[0]!;
  const rol = fila.role as RolEnAgencia;

  return {
    tipo: 'una',
    membresia: {
      perfilId,
      agencyId: fila.agency_id,
      rol,
      administra: rol === 'agency_admin',
    },
  };
}

/**
 * Si a esta persona le corresponde ver «Proyectos» en el menú.
 *
 * Alcanza con pertenecer a una inmobiliaria; **el rol dentro de ella no
 * cambia la respuesta**. Un corredor entra en modo lectura y necesita
 * llegar. Y quien pertenece a varias también lo ve: es la única forma de
 * llegar a la pantalla que le explica por qué todavía no puede elegir.
 *
 * Quien no pertenece a ninguna no lo ve. Mostrárselo sería ofrecerle una
 * puerta que da a una pared.
 */
export function correspondeVerProyectos(resultado: ResultadoDeMembresia): boolean {
  return resultado.tipo !== 'ninguna';
}

/** La entrada del menú, si corresponde. */
export const ENTRADA_DE_PROYECTOS = { href: '/panel/proyectos', texto: 'Proyectos' } as const;

/** La membresía de quien está en sesión, distinguiendo los tres casos. */
export async function membresiaActual(ruta: string): Promise<ResultadoDeMembresia> {
  // `requiereCuentaLista` y no `requiereSeccion`, y la diferencia importa:
  // `requiereSeccion` mira `profiles.role` —el tipo de cuenta— contra la
  // lista del menú, y el tipo de cuenta **no es** el rol dentro de la
  // inmobiliaria. Alguien puede tener cuenta de `owner` y administrar una
  // constructora; gatear por el tipo de cuenta lo expulsaba a `/panel` sin
  // decirle por qué. Quien autoriza acá es la membresía, que es el hecho
  // real, y se comprueba abajo.
  const perfil = await requiereCuentaLista(ruta);
  const supabase = await clienteServidor();

  // Solo cuentan las de inmobiliarias activas: una empresa dada de baja
  // no es una opción, y contarla haría que alguien con una sola empresa
  // real cayera en el caso «varias».
  const { data } = await supabase
    .from('agency_members')
    .select('agency_id, role, agencies!inner(is_active)')
    .eq('user_id', perfil.id)
    .eq('agencies.is_active', true);

  return decidirMembresia(
    perfil.id,
    (data ?? []).map((f) => ({ agency_id: f.agency_id as string, role: f.role as string })),
  );
}

export class SinPermiso extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'SinPermiso';
  }
}

/**
 * Exige poder escribir proyectos. Lanza si no.
 *
 * La usan todas las acciones de escritura, incluso las que solo se
 * alcanzan desde una pantalla que ya comprobó el permiso: una acción de
 * servidor es un punto de entrada de red, y se puede llamar sin pasar por
 * ninguna pantalla.
 */
export async function exigeAdministrarProyectos(ruta: string): Promise<MembresiaDeAgencia> {
  const resultado = await membresiaActual(ruta);

  if (resultado.tipo === 'ninguna') throw new SinPermiso(MENSAJE_NINGUNA);
  if (resultado.tipo === 'varias') throw new SinPermiso(MENSAJE_VARIAS);
  if (!resultado.membresia.administra) throw new SinPermiso(MENSAJE_SOLO_ADMIN);

  return resultado.membresia;
}

/**
 * Este sprint edita **borradores y nada más**.
 *
 * El estado se lee de la base y no se deduce de la pantalla: un proyecto
 * puede haber pasado a revisión en otra pestaña, o la llamada puede no
 * venir de ninguna pantalla. Sin esta comprobación, una acción de
 * servidor sería una puerta lateral para editar un proyecto ya publicado
 * —cambiarle el precio después de aprobado, por ejemplo—.
 *
 * El disparador de la base protege las transiciones de estado, pero no
 * impide editar el nombre de un proyecto publicado: esa regla es de este
 * sprint y vive acá hasta que 25D defina qué se puede tocar después de
 * publicar.
 */
export async function exigeBorrador(codigo: string): Promise<{ id: string } | null> {
  const supabase = await clienteServidor();

  // La RLS decide si esta fila se ve. Si es de otra inmobiliaria, no
  // aparece, y devolver `null` la trata igual que a una inexistente: no
  // se le confirma a nadie que un proyecto ajeno existe.
  const { data } = await supabase
    .from('projects')
    .select('id, publication_status')
    .eq('code', codigo)
    .maybeSingle();

  if (!data) return null;
  if ((data.publication_status as EstadoPublicacion) !== 'draft') {
    throw new SinPermiso(MENSAJE_SOLO_BORRADOR);
  }

  return { id: data.id as string };
}
