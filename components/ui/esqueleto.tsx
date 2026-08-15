import { cn } from '@/lib/cn';

/**
 * Bloque gris que ocupa el sitio del contenido mientras carga.
 *
 * Va con `aria-hidden`: para un lector de pantalla no aporta nada. El
 * contenedor que lo usa debe anunciar la carga con `aria-busy`.
 */
export function Esqueleto({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-lg bg-linea/70', className)}
    />
  );
}

/** Silueta de una tarjeta de aviso, con las mismas proporciones. */
export function EsqueletoAviso() {
  return (
    <div className="overflow-hidden rounded-marca border border-linea bg-white">
      <Esqueleto className="aspect-[4/3] rounded-none" />
      <div className="flex flex-col gap-2 p-4">
        <Esqueleto className="h-5 w-28" />
        <Esqueleto className="h-4 w-full" />
        <Esqueleto className="h-4 w-3/5" />
        <div className="mt-2 flex gap-3 border-t border-linea pt-3">
          <Esqueleto className="h-3 w-14" />
          <Esqueleto className="h-3 w-14" />
          <Esqueleto className="h-3 w-14" />
        </div>
      </div>
    </div>
  );
}

/** Grilla de siluetas mientras llegan los avisos. */
export function EsqueletoGrilla({ cantidad = 8 }: { cantidad?: number }) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="grid grid-cols-[repeat(auto-fill,minmax(255px,1fr))] gap-4"
    >
      <span className="solo-lectores">Cargando propiedades…</span>
      {Array.from({ length: cantidad }, (_, i) => (
        <EsqueletoAviso key={i} />
      ))}
    </div>
  );
}
