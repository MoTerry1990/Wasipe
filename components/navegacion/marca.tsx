import Link from 'next/link';
import { cn } from '@/lib/cn';

/** El logotipo: casa fucsia + palabra. `translate="no"` para que ningún traductor lo cambie. */
export function Marca({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      translate="no"
      className={cn(
        'font-display flex items-center gap-2 text-[22px] font-extrabold tracking-[-0.04em]',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-5 shrink-0" aria-hidden="true">
        <path
          d="M2 11.5 12 3l10 8.5"
          stroke="#E11D74"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M5 12v8h14v-8"
          stroke="#1B2733"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Wasipe
    </Link>
  );
}
