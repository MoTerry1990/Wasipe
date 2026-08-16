import Link from 'next/link';
import { migas as migasJsonLd, type Miga } from '@/lib/seo/estructurados';
import { aJsonSeguro } from '@/lib/seo/json-seguro';

/**
 * El rastro de migas.
 *
 * Dibuja la navegación **y** emite el JSON-LD desde la misma lista. Son
 * dos cosas que tienen que decir lo mismo, y tenerlas en archivos
 * distintos garantiza que algún día no lo digan.
 *
 * El último paso no es un enlace: enlazar a la página en la que ya estás
 * es ruido para quien navega con teclado, que tiene que pasar por encima
 * de un enlace que no lo lleva a ninguna parte.
 */
export function Migas({ pasos }: { pasos: readonly Miga[] }) {
  if (pasos.length === 0) return null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: aJsonSeguro(migasJsonLd(pasos)) }}
      />

      <nav aria-label="Dónde estás" className="text-tinta-45 text-[13.5px]">
        <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {pasos.map((paso, i) => (
            <li key={`${paso.texto}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden="true" className="text-tinta-40">
                  ›
                </span>
              )}
              {paso.href ? (
                <Link href={paso.href} className="hover:text-fucsia">
                  {paso.texto}
                </Link>
              ) : (
                <span className="text-tinta-60" aria-current="page">
                  {paso.texto}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}

/**
 * Los datos estructurados sueltos, para lo que no son migas.
 *
 * Un solo sitio donde se escribe el `<script>`, así que si mañana hay que
 * cambiar cómo se serializa, se cambia acá y no en ocho páginas.
 */
export function DatosEstructurados({ datos }: { datos: object | readonly object[] }) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: aJsonSeguro(datos) }} />
  );
}
