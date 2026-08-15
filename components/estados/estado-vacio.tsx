import { Boton } from '@/components/ui/boton';
import { cn } from '@/lib/cn';

/**
 * Estado vacío.
 *
 * Un vacío bien resuelto explica por qué no hay nada y ofrece la salida.
 * "No hay resultados" a secas deja al usuario sin saber qué hacer.
 */
export function EstadoVacio({
  titulo,
  descripcion,
  accion,
  icono,
  className,
}: {
  titulo: string;
  descripcion?: string;
  accion?: { texto: string; href: string };
  icono?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-marca border-[1.5px] border-dashed border-linea',
        'bg-white px-6 py-14 text-center',
        className,
      )}
    >
      {icono && <div className="mb-4 text-tinta-40">{icono}</div>}
      <h3 className="text-xl">{titulo}</h3>
      {descripcion && <p className="mt-2 max-w-[42ch] text-tinta-60">{descripcion}</p>}
      {accion && (
        <Boton href={accion.href} className="mt-6">
          {accion.texto}
        </Boton>
      )}
    </div>
  );
}

/**
 * Vacío para una sección que todavía no se construyó.
 *
 * Se distingue del vacío normal a propósito: acá no falta contenido,
 * falta la funcionalidad. Decirlo claro es más honesto que fingir que
 * la sección existe pero está sin datos.
 */
export function EnConstruccion({
  titulo,
  descripcion,
  mientrasTanto,
}: {
  titulo: string;
  descripcion: string;
  mientrasTanto?: { texto: string; href: string };
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center rounded-marca border border-linea bg-white px-6 py-16 text-center">
      <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-fucsia-suave px-3.5 py-1.5 text-[12.5px] font-bold text-fucsia">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" />
          <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
        Muy pronto
      </span>
      <h1 className="text-[clamp(1.5rem,4vw,2rem)]">{titulo}</h1>
      <p className="mt-3 max-w-[46ch] text-tinta-60">{descripcion}</p>
      {mientrasTanto && (
        <Boton href={mientrasTanto.href} variante="secundario" className="mt-7">
          {mientrasTanto.texto}
        </Boton>
      )}
    </div>
  );
}
