/**
 * Une clases de Tailwind ignorando falsos y vacíos.
 *
 * Sin dependencias: `clsx` y `tailwind-merge` resuelven más casos, pero
 * para lo que hace falta acá esto alcanza y no suma peso al bundle.
 */
export function cn(...clases: (string | false | null | undefined)[]): string {
  return clases.filter(Boolean).join(' ');
}
