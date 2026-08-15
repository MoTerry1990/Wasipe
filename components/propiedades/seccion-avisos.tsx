import Link from 'next/link';
import { Contenedor } from '@/components/ui/contenedor';
import { EstadoVacio } from '@/components/estados/estado-vacio';
import { Esqueleto } from '@/components/ui/esqueleto';
import { TarjetaPropiedad } from '@/components/propiedades/tarjeta-propiedad';
import type { AvisoDePortada } from '@/lib/consultas/portada';
import type { Moneda } from '@/types/base-datos';

/** Encabezado de sección: título, bajada y el enlace a ver todo. */
export function TituloSeccion({
  titulo,
  descripcion,
  verTodo,
}: {
  titulo: string;
  descripcion?: string;
  verTodo?: { texto: string; href: string };
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div>
        <h2 className="text-[clamp(1.4rem,3.2vw,2rem)]">{titulo}</h2>
        {descripcion && <p className="text-tinta-60 mt-2 max-w-[56ch]">{descripcion}</p>}
      </div>
      {verTodo && (
        <Link
          href={verTodo.href}
          className="text-fucsia font-bold whitespace-nowrap hover:underline"
        >
          {verTodo.texto} →
        </Link>
      )}
    </div>
  );
}

/**
 * Sección de avisos.
 *
 * Cuando no hay nada que mostrar, la sección no desaparece: se explica.
 * Una portada que cambia de alto según lo que respondió la base se siente
 * rota, y además deja al visitante sin entender si es un error suyo.
 */
export function SeccionAvisos({
  id,
  titulo,
  descripcion,
  verTodo,
  avisos,
  moneda,
  tipoDeCambio,
  vacio,
  prioridad = false,
  columnas = 3,
  etiquetaDe,
  className,
}: {
  id?: string;
  titulo: string;
  descripcion?: string;
  verTodo?: { texto: string; href: string };
  avisos: readonly AvisoDePortada[];
  moneda: Moneda;
  tipoDeCambio: number;
  vacio: { titulo: string; descripcion: string; accion?: { texto: string; href: string } };
  prioridad?: boolean;
  columnas?: 2 | 3 | 4;
  etiquetaDe?: (aviso: AvisoDePortada) => React.ReactNode;
  className?: string;
}) {
  const grilla =
    columnas === 4
      ? 'sm:grid-cols-2 lg:grid-cols-4'
      : columnas === 2
        ? 'sm:grid-cols-2'
        : 'sm:grid-cols-2 lg:grid-cols-3';

  return (
    <Contenedor as="section" id={id} className={className ?? 'py-10 sm:py-14'}>
      <TituloSeccion titulo={titulo} descripcion={descripcion} verTodo={verTodo} />

      {avisos.length === 0 ? (
        <EstadoVacio
          titulo={vacio.titulo}
          descripcion={vacio.descripcion}
          accion={vacio.accion ?? { texto: 'Publicar gratis', href: '/publicar' }}
        />
      ) : (
        <div className={`grid gap-4 ${grilla}`}>
          {avisos.map((aviso, i) => (
            <TarjetaPropiedad
              key={aviso.id}
              aviso={aviso}
              moneda={moneda}
              tipoDeCambio={tipoDeCambio}
              // Solo las tres primeras de la primera sección se cargan sin
              // esperar: las demás entran cuando se acercan a la pantalla.
              prioridad={prioridad && i < 3}
              etiqueta={etiquetaDe?.(aviso)}
            />
          ))}
        </div>
      )}
    </Contenedor>
  );
}

/**
 * Lo que se ve mientras la sección carga.
 *
 * Ocupa exactamente el mismo alto que las tarjetas reales. Si fuera más
 * baja, la página daría un salto al llegar los datos.
 */
export function SeccionCargando({ columnas = 3 }: { columnas?: 2 | 3 | 4 }) {
  const grilla =
    columnas === 4
      ? 'sm:grid-cols-2 lg:grid-cols-4'
      : columnas === 2
        ? 'sm:grid-cols-2'
        : 'sm:grid-cols-2 lg:grid-cols-3';

  return (
    <Contenedor as="section" className="py-10 sm:py-14">
      <div className="mb-5">
        <Esqueleto className="h-8 w-64" />
        <Esqueleto className="mt-3 h-4 w-full max-w-[42rem]" />
      </div>
      <div className={`grid gap-4 ${grilla}`} aria-hidden="true">
        {Array.from({ length: columnas }).map((_, i) => (
          <div key={i} className="border-linea overflow-hidden rounded-2xl border bg-white">
            <Esqueleto className="aspect-[4/3] w-full rounded-none" />
            <div className="flex flex-col gap-2 p-4">
              <Esqueleto className="h-6 w-32" />
              <Esqueleto className="h-4 w-24" />
              <Esqueleto className="h-4 w-full" />
              <Esqueleto className="h-4 w-3/4" />
            </div>
          </div>
        ))}
      </div>
      <span className="solo-lectores">Cargando propiedades…</span>
    </Contenedor>
  );
}
