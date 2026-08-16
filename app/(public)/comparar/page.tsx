import type { Metadata } from 'next';
import { Contenedor } from '@/components/ui/contenedor';
import { EstadoVacio } from '@/components/estados/estado-vacio';
import { TablaComparativa } from '@/features/avisos/tabla-comparativa';
import { avisosParaComparar } from '@/lib/consultas/comparar';
import { MAXIMO_A_COMPARAR } from '@/lib/ia/comparar';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Comparar propiedades',
  description:
    'Compara hasta cuatro propiedades lado a lado: precio, área, precio por m², mantenimiento, ambientes y promedio del distrito.',
  alternates: { canonical: '/comparar' },
  // No se indexa: cada combinación de cuatro avisos es una dirección
  // distinta y ninguna es contenido. `robots.txt` además la bloquea, pero
  // esto es lo que vale si alguien la enlaza desde afuera.
  robots: { index: false, follow: true },
};

/**
 * Comparar hasta cuatro avisos.
 *
 * Los códigos llegan por la URL, así que una comparación se puede pasar
 * por WhatsApp igual que una búsqueda. Los datos salen de
 * `comparar_avisos()`: un código inventado no devuelve nada, y no hay
 * ningún camino por el que esta página pueda mostrar una propiedad que
 * no esté publicada en la base.
 */
export default async function Comparar({
  searchParams,
}: {
  searchParams: Promise<{ avisos?: string }>;
}) {
  const { avisos: parametro } = await searchParams;
  const codigos = (parametro ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  const avisos = await avisosParaComparar(codigos);

  return (
    <Contenedor className="py-8 sm:py-12">
      <h1 className="text-[clamp(1.6rem,4vw,2.25rem)]">Comparar propiedades</h1>
      <p className="text-tinta-60 mt-2 max-w-[62ch]">
        Hasta {MAXIMO_A_COMPARAR} a la vez, con el precio por m² y el promedio del distrito al
        lado. Los valores son los del aviso: si algo no está cargado, acá tampoco aparece.
      </p>

      {avisos.length === 0 ? (
        <div className="mt-8">
          <EstadoVacio
            titulo="Todavía no elegiste nada para comparar"
            descripcion={
              codigos.length > 0
                ? 'Los avisos que pediste ya no están publicados o no existen. Elige otros desde la búsqueda con el botón «Comparar».'
                : 'Desde cualquier aviso, toca «Comparar» y vuelve acá. Puedes juntar hasta cuatro.'
            }
            accion={{ texto: 'Ver propiedades en venta', href: '/comprar' }}
          />
        </div>
      ) : avisos.length === 1 ? (
        <div className="mt-8">
          <EstadoVacio
            titulo="Falta con qué comparar"
            descripcion="Con un solo aviso no hay comparación. Agrega al menos uno más desde la búsqueda."
            accion={{ texto: 'Buscar más propiedades', href: '/comprar' }}
          />
        </div>
      ) : (
        <div className="mt-7">
          <TablaComparativa avisos={avisos} />
        </div>
      )}
    </Contenedor>
  );
}
