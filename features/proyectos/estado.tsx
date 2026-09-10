import { Insignia } from '@/components/ui/tarjeta';
import type { EstadoPublicacion } from '@/types/base-datos';

/**
 * El estado de un proyecto, dicho como lo entiende quien publica.
 *
 * Vive acá y no en la página porque lo usan la lista y el editor, y
 * porque el día que 25D agregue la revisión, el vocabulario tiene que
 * cambiar en un solo lugar.
 */
const COMO_SE_DICE: Record<EstadoPublicacion, { texto: string; tono: 'verde' | 'fucsia' | 'maiz' | 'neutro' }> = {
  draft: { texto: 'Borrador', tono: 'neutro' },
  in_review: { texto: 'En revisión', tono: 'maiz' },
  published: { texto: 'Publicado', tono: 'verde' },
  rejected: { texto: 'Rechazado', tono: 'fucsia' },
  paused: { texto: 'Pausado', tono: 'neutro' },
  expired: { texto: 'Vencido', tono: 'neutro' },
  archived: { texto: 'Archivado', tono: 'neutro' },
};

export function EstadoDeProyecto({ estado }: { estado: EstadoPublicacion }) {
  const c = COMO_SE_DICE[estado] ?? { texto: estado, tono: 'neutro' as const };
  return <Insignia tono={c.tono}>{c.texto}</Insignia>;
}
