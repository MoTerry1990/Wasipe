import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Contenedor } from '@/components/ui/contenedor';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import { TarjetaPropiedad } from '@/components/propiedades/tarjeta-propiedad';
import { Galeria } from '@/features/avisos/galeria';
import { Contacto, VerTelefono } from '@/features/avisos/contacto';
import {
  BotonFavorito,
  BotonCompartir,
  BotonComparar,
  Denunciar,
} from '@/features/avisos/acciones-rapidas';
import { Hipoteca } from '@/features/avisos/hipoteca';
import { MapaDelAviso } from '@/features/avisos/mapa-aviso';
import { fichaPorCodigo, historialDePrecios, parecidas } from '@/lib/consultas/aviso';
import { comparablesDe, estadisticaDe } from '@/lib/consultas/mercado';
import { AnalisisDePrecio } from '@/features/avisos/analisis-de-precio';
import { tipoDeCambio } from '@/lib/consultas/portada';
import { monedaPreferida } from '@/lib/preferencias';
import { esFavorito } from '@/lib/avisos/favoritos';
import { codigoDesdeRuta, enlaceDeAviso } from '@/lib/avisos/enlace';
import { precioMostrado, porMetroMostrado } from '@/lib/moneda';
import { dinero, dineroExacto, metros, fecha, numero } from '@/lib/formato';
import {
  TIPO_INMUEBLE,
  OPERACION,
  AMOBLADO,
  MASCOTAS,
  ESTADO_VERIFICACION,
  ROL,
  nombreDeCaracteristica,
} from '@/lib/etiquetas';
import { SITIO } from '@/config/sitio';
import type { FichaDeAviso } from '@/lib/consultas/aviso';

type Props = { params: Promise<{ aviso: string }> };

/**
 * Ficha del aviso.
 *
 * Dos cosas que NO están en el HTML de esta página, a propósito:
 *
 *  · El teléfono de quien publica. Sale por una acción del servidor
 *    cuando alguien toca «ver teléfono». Si estuviera en el HTML,
 *    cualquiera podría bajarse todos los números del portal con un
 *    script de diez líneas.
 *  · La dirección exacta. Vive en otra tabla con su propia política y la
 *    consulta de esta página ni la pide.
 */

async function cargar(segmento: string): Promise<FichaDeAviso | null> {
  const codigo = codigoDesdeRuta(segmento);
  if (!codigo) return null;
  return fichaPorCodigo(codigo);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { aviso: segmento } = await params;
  const aviso = await cargar(segmento);

  if (!aviso) {
    return { title: 'Aviso no encontrado', robots: { index: false } };
  }

  const portada = aviso.fotos[0];

  return {
    title: aviso.title,
    description: `${TIPO_INMUEBLE[aviso.property_type]} ${OPERACION[aviso.operation].toLowerCase()} en ${aviso.district}. ${dinero(aviso.price, aviso.currency)}${aviso.price_per_m2 ? ` · ${dinero(aviso.price_per_m2, aviso.currency)} por m²` : ''}.`,
    alternates: { canonical: enlaceDeAviso(aviso) },
    openGraph: {
      type: 'website',
      title: aviso.title,
      images: portada ? [{ url: portada.url }] : undefined,
    },
  };
}

/** Dato suelto de la lista de características. */
function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="border-linea border-b py-2.5 last:border-0">
      <dt className="text-tinta-45 text-[13px]">{etiqueta}</dt>
      <dd className="text-tinta text-[15px] font-bold">{valor}</dd>
    </div>
  );
}

export default async function Ficha({ params }: Props) {
  const { aviso: segmento } = await params;
  const aviso = await cargar(segmento);

  if (!aviso) notFound();

  // Si el texto de la dirección quedó viejo —cambió el título o el
  // distrito— se manda a la forma correcta. El código del final es lo
  // único que se lee, así que los enlaces viejos siguen funcionando.
  const canonica = enlaceDeAviso(aviso);
  if (`/propiedad/${segmento}` !== canonica) redirect(canonica);

  const [
    monedaGuardada,
    cambio,
    historial,
    similares,
    guardado,
    mercado,
    alquileres,
    comparables,
  ] = await Promise.all([
    monedaPreferida(),
    tipoDeCambio(),
    historialDePrecios(aviso.id),
    parecidas(aviso),
    esFavorito(aviso.id),
    // El corte del último año y del tipo exacto: comparar un
    // departamento contra el promedio de todos los tipos del distrito
    // mezcla terrenos y casas, y no dice nada.
    estadisticaDe({
      distrito: aviso.district,
      operacion: aviso.operation,
      tipo: aviso.property_type,
      periodo: 'm12',
    }),
    // El de alquiler del mismo distrito, para la rentabilidad bruta.
    estadisticaDe({
      distrito: aviso.district,
      operacion: 'rent',
      tipo: aviso.property_type,
      periodo: 'm12',
    }),
    comparablesDe(aviso.id),
  ]);

  const moneda = monedaGuardada;
  const precio = precioMostrado(aviso, moneda, cambio);
  const area = aviso.built_area ?? aviso.total_area;

  const datos = [
    { etiqueta: 'Área total', valor: metros(aviso.total_area) },
    ...(aviso.built_area
      ? [{ etiqueta: 'Área techada', valor: metros(aviso.built_area) }]
      : []),
    ...(aviso.bedrooms !== null
      ? [{ etiqueta: 'Dormitorios', valor: numero(aviso.bedrooms) }]
      : []),
    ...(aviso.bathrooms !== null
      ? [{ etiqueta: 'Baños', valor: numero(aviso.bathrooms) }]
      : []),
    ...(aviso.parking !== null ? [{ etiqueta: 'Cocheras', valor: numero(aviso.parking) }] : []),
    ...(aviso.age_years !== null
      ? [
          {
            etiqueta: 'Antigüedad',
            valor: aviso.age_years === 0 ? 'A estrenar' : `${aviso.age_years} años`,
          },
        ]
      : []),
    { etiqueta: 'Amoblado', valor: AMOBLADO[aviso.furnished] },
    ...(aviso.pet_policy ? [{ etiqueta: 'Mascotas', valor: MASCOTAS[aviso.pet_policy] }] : []),
  ];

  // Datos estructurados. El precio y la moneda son los que publicó su
  // dueño, no los convertidos: un buscador no debería leer una cuenta
  // nuestra como si fuera el precio real.
  const estructurados = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: aviso.title,
    description: aviso.description,
    url: `${SITIO.url}${canonica}`,
    datePosted: aviso.published_at ?? aviso.created_at,
    dateModified: aviso.updated_at,
    identifier: aviso.code,
    image: aviso.fotos.slice(0, 8).map((f) => f.url),
    offers: {
      '@type': 'Offer',
      price: aviso.price,
      priceCurrency: aviso.currency,
      availability: 'https://schema.org/InStock',
      url: `${SITIO.url}${canonica}`,
    },
    address: {
      '@type': 'PostalAddress',
      addressLocality: aviso.district,
      addressRegion: aviso.department,
      addressCountry: 'PE',
    },
    ...(area
      ? { floorSize: { '@type': 'QuantitativeValue', value: area, unitCode: 'MTK' } }
      : {}),
    ...(aviso.bedrooms !== null ? { numberOfBedrooms: aviso.bedrooms } : {}),
    ...(aviso.bathrooms !== null ? { numberOfBathroomsTotal: aviso.bathrooms } : {}),
  };

  return (
    <Contenedor className="py-6">
      <script
        type="application/ld+json"
        // Es JSON generado por nosotros a partir de datos ya validados por
        // la base; no hay entrada del usuario sin escapar acá.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(estructurados) }}
      />

      <nav aria-label="Dónde estás" className="text-tinta-45 mb-4 text-[13.5px]">
        <Link href="/" className="hover:text-fucsia">
          Inicio
        </Link>
        <span className="mx-1.5">›</span>
        <Link
          href={aviso.operation === 'rent' ? '/alquilar' : '/comprar'}
          className="hover:text-fucsia"
        >
          {OPERACION[aviso.operation]}
        </Link>
        <span className="mx-1.5">›</span>
        <span className="text-tinta-60">{aviso.district}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Galeria fotos={aviso.fotos} titulo={aviso.title} />

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Insignia tono="neutro">{TIPO_INMUEBLE[aviso.property_type]}</Insignia>
            <Insignia tono="neutro">{OPERACION[aviso.operation]}</Insignia>
            {aviso.verification_status === 'verified' && (
              <Insignia tono="verde">{ESTADO_VERIFICACION.verified}</Insignia>
            )}
            {aviso.price_dropped_at && <Insignia tono="fucsia">Bajó de precio</Insignia>}
            <span className="cifra text-tinta-45 ml-auto text-[13px]">{aviso.code}</span>
          </div>

          <h1 className="mt-3 text-[clamp(1.5rem,3.4vw,2.125rem)]">{aviso.title}</h1>
          <p className="text-tinta-60 mt-1.5">
            {aviso.district}, {aviso.province}
          </p>

          <section className="mt-6">
            <h2 className="text-lg">Descripción</h2>
            <p className="text-tinta-70 mt-2 leading-relaxed whitespace-pre-line">
              {aviso.description}
            </p>
          </section>

          <section className="mt-6">
            <h2 className="text-lg">Características</h2>
            <dl className="mt-2 grid gap-x-8 sm:grid-cols-2">
              {datos.map((dato) => (
                <Dato key={dato.etiqueta} etiqueta={dato.etiqueta} valor={dato.valor} />
              ))}
            </dl>
          </section>

          {aviso.caracteristicas.length > 0 && (
            <section className="mt-6">
              <h2 className="text-lg">Qué más tiene</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {aviso.caracteristicas.map((c) => (
                  <li
                    key={c.feature}
                    className="bg-turquesa-suave text-turquesa-osc rounded-full px-3.5 py-1.5 text-[14px] font-semibold"
                  >
                    {nombreDeCaracteristica(c.feature)}
                    {c.value ? `: ${c.value}` : ''}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-6">
            <MapaDelAviso
              lat={aviso.lat}
              lon={aviso.lon}
              distrito={aviso.district}
              provincia={aviso.province}
              privacidad={aviso.address_privacy}
            />
          </div>

          {/* Evaluación de precio, comparables, historial, costo mensual y
              rentabilidad. Es el diferenciador del producto y va junto,
              no repartido por la ficha. */}
          <AnalisisDePrecio
            aviso={aviso}
            estadistica={mercado}
            alquileres={alquileres}
            comparables={comparables}
            historial={historial}
            tipoDeCambio={cambio}
          />

          <div className="mt-6">
            <Hipoteca precio={aviso.price} moneda={aviso.currency} />
          </div>

          <p className="text-tinta-45 mt-6 text-[13px]">
            Publicado el {fecha(aviso.published_at ?? aviso.created_at)} · Actualizado el{' '}
            {fecha(aviso.updated_at)} ·{' '}
            <span className="cifra">{numero(aviso.views_count)}</span> visitas
          </p>

          <div className="mt-4">
            <Denunciar aviso={aviso.id} />
          </div>
        </div>

        {/* Columna de precio y contacto */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <Tarjeta className="p-5">
            <p className="cifra text-tinta text-3xl font-extrabold">{precio.texto}</p>

            {aviso.price_per_m2 !== null && (
              <p className="cifra text-turquesa-osc mt-1 text-[15px] font-bold">
                {porMetroMostrado(aviso.price_per_m2, aviso.currency, moneda, cambio)}
              </p>
            )}

            {precio.convertido && (
              <p className="text-tinta-45 mt-0.5 text-[13px]">{precio.original}</p>
            )}

            {aviso.maintenance !== null && (
              <p className="text-tinta-60 mt-2 text-[14px]">
                Mantenimiento:{' '}
                <span className="cifra font-bold">
                  {dineroExacto(aviso.maintenance, aviso.currency)}
                </span>{' '}
                al mes
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <BotonFavorito aviso={aviso.id} guardadoInicial={guardado} />
              <BotonCompartir aviso={aviso.id} titulo={aviso.title} />
              <BotonComparar aviso={aviso.id} />
            </div>
          </Tarjeta>

          <Tarjeta className="mt-4 p-5">
            {aviso.inmobiliaria ? (
              <div className="mb-4">
                <p className="text-tinta-45 text-[13px]">Publica</p>
                <p className="text-tinta text-[16px] font-bold">{aviso.inmobiliaria.name}</p>
                {aviso.inmobiliaria.verification_status === 'verified' && (
                  <Insignia tono="verde">Inmobiliaria verificada</Insignia>
                )}
              </div>
            ) : aviso.anunciante ? (
              <div className="mb-4">
                <p className="text-tinta-45 text-[13px]">Publica</p>
                <p className="text-tinta text-[16px] font-bold">{aviso.anunciante.full_name}</p>
                <p className="text-tinta-60 text-[13.5px]">
                  {ROL[aviso.anunciante.role as keyof typeof ROL] ?? 'Anunciante'} · en Wasipe
                  desde {fecha(aviso.anunciante.created_at)}
                </p>
              </div>
            ) : null}

            <VerTelefono aviso={aviso.id} />

            <div className="border-linea mt-5 border-t pt-5">
              <Contacto aviso={aviso.id} titulo={aviso.title} />
            </div>
          </Tarjeta>
        </div>
      </div>

      {similares.length > 0 && (
        <section className="mt-12">
          <h2 className="text-[clamp(1.4rem,3.2vw,2rem)]">Propiedades parecidas</h2>
          <p className="text-tinta-60 mt-2 mb-5">
            En {aviso.district}, del mismo tipo y en un rango de precio similar.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {similares.map((similar) => (
              <TarjetaPropiedad
                key={similar.id}
                aviso={similar}
                moneda={moneda}
                tipoDeCambio={cambio}
              />
            ))}
          </div>
        </section>
      )}
    </Contenedor>
  );
}
