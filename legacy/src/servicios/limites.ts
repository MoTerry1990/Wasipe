import { una } from '../db/cliente.ts';
import { topeDePlan } from '../lib/errores.ts';

/**
 * Fuente única de verdad de las cuotas del plan.
 *
 * Siempre en backend. Ocultar un botón en la UI no es control de acceso.
 */

export type Limites = {
  slug: string;
  nombre: string;
  tope_avisos: number | null; // null = sin tope
  tope_fotos: number;
  tope_asientos: number;
  cuota_indice_mes: number | null;
  destacados_mes: number;
  dias_vigencia_aviso: number;
  telefono_visible: boolean;
};

/**
 * Plan gratuito. Ver COMPETENCIA.md §5.1: son 2 avisos, no 1.
 * Con 1 aviso, el dueño de dos propiedades tiene que elegir y se va.
 */
export const GRATIS: Limites = {
  slug: 'gratis',
  nombre: 'Gratis',
  tope_avisos: 2,
  tope_fotos: 8,
  tope_asientos: 1,
  cuota_indice_mes: 5,
  destacados_mes: 0,
  dias_vigencia_aviso: 90,
  telefono_visible: false,
};

/** Plan vigente del usuario (o de su agencia). Cae a Gratis si no hay. */
export async function limitesDe(usuarioId: string, agenciaId?: string | null): Promise<Limites> {
  const fila = await una<Limites & { fin: string }>(
    `SELECT p.slug, p.nombre, p.tope_avisos, p.tope_fotos, p.tope_asientos,
            p.cuota_indice_mes, p.destacados_mes, p.dias_vigencia_aviso,
            COALESCE(p.telefono_visible, true) AS telefono_visible, s.fin
     FROM suscripciones s JOIN planes p ON p.id = s.plan_id
     WHERE s.estado IN ('activa','prueba','morosa')
       AND ( s.usuario_id = $1 OR ($2::uuid IS NOT NULL AND s.agencia_id = $2::uuid) )
     ORDER BY p.tope_avisos DESC NULLS FIRST
     LIMIT 1`,
    [usuarioId, agenciaId ?? null],
  );
  return fila ?? GRATIS;
}

/* ------------------------------ avisos ------------------------------ */

export async function verificarPuedePublicar(usuarioId: string, agenciaId?: string | null) {
  const limites = await limitesDe(usuarioId, agenciaId);
  if (limites.tope_avisos === null) return limites;

  const r = await una<{ n: number }>(
    `SELECT count(*)::int AS n FROM propiedades
     WHERE usuario_id = $1 AND estado = 'activo' AND eliminado_en IS NULL`,
    [usuarioId],
  );
  const usados = r?.n ?? 0;

  if (usados >= limites.tope_avisos) {
    throw topeDePlan(
      limites.slug === 'gratis'
        ? `Con el plan gratis puedes tener ${limites.tope_avisos} avisos publicados. Pasa a un plan para publicar más.`
        : `Llegaste a los ${limites.tope_avisos} avisos de tu plan ${limites.nombre}.`,
      siguientePlan(limites.slug),
    );
  }
  return limites;
}

/* ------------------------------- fotos ------------------------------ */

export async function verificarPuedeSubirFotos(
  usuarioId: string,
  propiedadId: string,
  cantidad: number,
  agenciaId?: string | null,
) {
  const limites = await limitesDe(usuarioId, agenciaId);

  const r = await una<{ n: number }>(
    `SELECT count(*)::int AS n FROM medios WHERE propiedad_id = $1 AND tipo = 'foto'`,
    [propiedadId],
  );
  const ya = r?.n ?? 0;

  if (ya + cantidad > limites.tope_fotos) {
    const quedan = Math.max(0, limites.tope_fotos - ya);
    throw topeDePlan(
      quedan === 0
        ? `Tu plan ${limites.nombre} permite ${limites.tope_fotos} fotos por aviso y ya las usaste.`
        : `Tu plan permite ${limites.tope_fotos} fotos por aviso. Puedes subir ${quedan} más.`,
      siguientePlan(limites.slug),
    );
  }
  return { limites, restantes: limites.tope_fotos - ya - cantidad };
}

/* ------------------------------ índice ------------------------------ */

export async function consumirCuotaIndice(usuarioId: string, agenciaId?: string | null) {
  const limites = await limitesDe(usuarioId, agenciaId);
  if (limites.cuota_indice_mes === null) return { tope: null, usadas: null, restantes: null };

  const fila = await una<{ conteo: number }>(
    `INSERT INTO consultas_indice (usuario_id, periodo, conteo)
     VALUES ($1, to_char(now(),'YYYY-MM'), 1)
     ON CONFLICT (usuario_id, periodo) DO UPDATE SET conteo = consultas_indice.conteo + 1
     RETURNING conteo`,
    [usuarioId],
  );
  const usadas = fila?.conteo ?? 1;

  if (usadas > limites.cuota_indice_mes) {
    throw topeDePlan(
      `Usaste tus ${limites.cuota_indice_mes} consultas al índice de este mes.`,
      siguientePlan(limites.slug),
    );
  }
  return {
    tope: limites.cuota_indice_mes,
    usadas,
    restantes: limites.cuota_indice_mes - usadas,
  };
}

/** Qué plan proponer cuando alguien topa. */
function siguientePlan(actual: string): string {
  const escalera: Record<string, string> = {
    gratis: 'agente-inicial',
    'dueno-plus': 'agente-inicial',
    'agente-inicial': 'agente',
    agente: 'agente-pro',
    'agente-pro': 'inmobiliaria',
    inmobiliaria: 'inmobiliaria-plus',
    'inmobiliaria-plus': 'corporativa',
  };
  return escalera[actual] ?? 'agente';
}
