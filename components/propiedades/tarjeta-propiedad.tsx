import Link from 'next/link';
import Image from 'next/image';
import { Insignia } from '@/components/ui/tarjeta';
import { precioMostrado, porMetroMostrado } from '@/lib/moneda';
import { metros } from '@/lib/formato';
import { TIPO_INMUEBLE, OPERACION } from '@/lib/etiquetas';
import type { AvisoDePortada } from '@/lib/consultas/portada';
import type { Moneda } from '@/types/base-datos';

/**
 * Tarjeta de aviso.
 *
 * Tres decisiones que la separan de la competencia:
 *
 *  · El precio por m² va siempre, al lado del precio. Es el único número
 *    que permite comparar dos departamentos distintos.
 *  · La foto tiene relación de aspecto fija. Sin eso, cada imagen que
 *    carga empuja el contenido hacia abajo y la página baila mientras se
 *    lee (eso es el CLS).
 *  · Si la imagen fue retocada con IA, lo dice encima de la imagen.
 */
export function TarjetaPropiedad({
  aviso,
  moneda,
  tipoDeCambio,
  prioridad = false,
  etiqueta,
}: {
  aviso: AvisoDePortada;
  moneda: Moneda;
  tipoDeCambio: number;
  /** true solo para las primeras tarjetas visibles sin desplazar. */
  prioridad?: boolean;
  etiqueta?: React.ReactNode;
}) {
  const precio = precioMostrado(aviso, moneda, tipoDeCambio);
  const area = aviso.built_area ?? aviso.total_area;

  const rasgos = [
    aviso.bedrooms !== null ? `${aviso.bedrooms} dorm.` : null,
    aviso.bathrooms !== null ? `${aviso.bathrooms} baños` : null,
    aviso.parking ? `${aviso.parking} cochera${aviso.parking > 1 ? 's' : ''}` : null,
    metros(area),
  ].filter(Boolean);

  return (
    <article className="border-linea hover:border-fucsia hover:shadow-marca group h-full overflow-hidden rounded-2xl border bg-white transition-[transform,border-color,box-shadow] hover:-translate-y-0.5">
      <Link href={`/aviso/${aviso.id}`} className="block">
        {/* 4:3 fijo: el hueco existe antes de que la foto llegue. */}
        <div className="bg-niebla relative aspect-[4/3] w-full overflow-hidden">
          {aviso.portada ? (
            <Image
              src={aviso.portada.url}
              alt={
                aviso.portada.alt ??
                `${TIPO_INMUEBLE[aviso.property_type]} en ${aviso.district}`
              }
              fill
              // Una columna en móvil, dos en tableta, tres en escritorio.
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              priority={prioridad}
              loading={prioridad ? undefined : 'lazy'}
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="text-tinta-40 grid h-full place-items-center text-[13px]">
              Sin fotos todavía
            </div>
          )}

          <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
            {etiqueta}
            {aviso.verification_status === 'verified' && (
              <Insignia tono="verde">Verificado</Insignia>
            )}
          </div>

          {aviso.portada?.ai_label && (
            // Transparencia obligatoria: la etiqueta la genera la base y
            // acá solo se muestra. Nunca se omite.
            <span className="absolute right-2.5 bottom-2.5 rounded-full bg-black/60 px-2.5 py-1 text-[11.5px] font-semibold text-white">
              {aviso.portada.ai_label}
            </span>
          )}
        </div>

        <div className="p-4">
          <p className="cifra text-tinta text-[20px] leading-tight font-extrabold">
            {precio.texto}
          </p>

          {aviso.price_per_m2 !== null && (
            <p className="cifra text-turquesa-osc mt-0.5 text-[13.5px] font-bold">
              {porMetroMostrado(aviso.price_per_m2, aviso.currency, moneda, tipoDeCambio)}
            </p>
          )}

          {precio.convertido && (
            <p className="text-tinta-45 mt-0.5 text-[12.5px]">{precio.original}</p>
          )}

          <h3 className="font-texto text-tinta mt-2 line-clamp-2 text-[15px] leading-snug font-bold">
            {aviso.title}
          </h3>

          <p className="text-tinta-60 mt-1 text-[13.5px]">
            {TIPO_INMUEBLE[aviso.property_type]} en {aviso.district} ·{' '}
            {OPERACION[aviso.operation]}
          </p>

          <p className="text-tinta-60 border-linea mt-3 border-t pt-2.5 text-[13px]">
            {rasgos.join(' · ')}
          </p>
        </div>
      </Link>
    </article>
  );
}
