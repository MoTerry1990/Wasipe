import Link from 'next/link';
import { Contenedor } from '@/components/ui/contenedor';
import { Tarjeta } from '@/components/ui/tarjeta';
import { Boton } from '@/components/ui/boton';
import { TituloSeccion } from '@/components/propiedades/seccion-avisos';
import { AVISO_ESTIMACION, ETIQUETA_IA } from '@/lib/etiquetas';

/**
 * Las secciones de la portada que no dependen de la base.
 *
 * Explican cómo funciona el portal, qué hace la IA y por qué se puede
 * confiar en lo que se publica. Todas se renderizan al instante: no
 * esperan a ninguna consulta.
 */

const PASOS = [
  {
    titulo: 'Busca con el precio a la vista',
    detalle:
      'Cada aviso muestra el precio y el precio por m² desde el listado. No hay que escribir para enterarse de cuánto cuesta.',
  },
  {
    titulo: 'Compara contra el distrito',
    detalle:
      'Al lado del precio te decimos si está por encima o por debajo del promedio de la zona, con los avisos que lo sostienen.',
  },
  {
    titulo: 'Escribe directo a quien publica',
    detalle:
      'El contacto llega al propietario o al corredor, sin intermediarios y sin pagar para ver el número.',
  },
];

export function ComoFunciona() {
  return (
    <Contenedor as="section" id="como-funciona" className="py-10 sm:py-14">
      <TituloSeccion
        titulo="Cómo funciona Wasipe"
        descripcion="Tres pasos, sin registro para mirar y sin costo para publicar."
      />

      <ol className="grid gap-4 sm:grid-cols-3">
        {PASOS.map((paso, i) => (
          <li key={paso.titulo}>
            <Tarjeta className="h-full p-5">
              <span className="bg-fucsia-suave text-fucsia cifra grid size-9 place-items-center rounded-full text-[15px] font-extrabold">
                {i + 1}
              </span>
              <h3 className="font-texto text-tinta mt-3.5 text-[16.5px] font-bold">
                {paso.titulo}
              </h3>
              <p className="text-tinta-60 mt-1.5 text-[14.5px]">{paso.detalle}</p>
            </Tarjeta>
          </li>
        ))}
      </ol>
    </Contenedor>
  );
}

const CAPACIDADES = [
  {
    titulo: 'Redacta tu aviso',
    detalle:
      'Le cuentas cómo es tu propiedad y te devuelve el texto listo. Tú lo apruebas o lo cambias.',
  },
  {
    titulo: 'Mejora tus fotos',
    detalle: 'Corrige luz y encuadre sin inventar nada que no esté en la foto original.',
  },
  {
    titulo: 'Amobla espacios vacíos',
    detalle: 'Muestra cómo se vería amoblado, sin tapar jamás una humedad ni una rajadura.',
  },
  {
    titulo: 'Estima cuánto vale',
    detalle: AVISO_ESTIMACION,
  },
];

export function IntroWasiAi() {
  return (
    <section className="bg-tinta text-white">
      <Contenedor className="py-12 sm:py-16">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <span className="bg-fucsia inline-flex rounded-full px-3 py-1 text-[12.5px] font-bold">
              Wasi AI
            </span>
            <h2 className="mt-3.5 text-[clamp(1.5rem,3.6vw,2.25rem)] text-white">
              La inteligencia artificial que te ayuda a publicar mejor
            </h2>
            <p className="mt-3 max-w-[46ch] text-[15.5px] text-white/70">
              Nada de lo que propone Wasi AI se publica sin que tú lo apruebes, y cada imagen
              modificada lleva su etiqueta a la vista: «{ETIQUETA_IA}».
            </p>
            <div className="mt-6">
              <Boton href="/wasi-ai" variante="secundario">
                Ver qué hace Wasi AI
              </Boton>
            </div>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            {CAPACIDADES.map((capacidad) => (
              <li key={capacidad.titulo} className="rounded-2xl bg-white/[0.07] p-4">
                <h3 className="font-texto text-[15.5px] font-bold text-white">
                  {capacidad.titulo}
                </h3>
                <p className="mt-1 text-[13.5px] text-white/65">{capacidad.detalle}</p>
              </li>
            ))}
          </ul>
        </div>
      </Contenedor>
    </section>
  );
}

const GARANTIAS = [
  {
    titulo: 'Avisos verificados',
    detalle:
      'Alguien de Wasipe comprueba que la propiedad existe y que sigue disponible. Los verificados llevan su sello.',
  },
  {
    titulo: 'Sin propiedades ya vendidas',
    detalle:
      'Cada aviso se confirma cada 90 días. El que no se confirma deja de aparecer en las búsquedas.',
  },
  {
    titulo: 'Historial de precios abierto',
    detalle:
      'Si un aviso bajó de precio, se ve cuándo y cuánto. No escondemos lo que le sirve a quien compra.',
  },
  {
    titulo: 'Imágenes con IA siempre marcadas',
    detalle: `Toda foto retocada lleva la etiqueta «${ETIQUETA_IA}» y conservamos la original.`,
  },
];

export function Confianza() {
  return (
    <Contenedor as="section" id="confianza" className="bg-white py-10 sm:py-14">
      <TituloSeccion
        titulo="Por qué puedes confiar en lo que ves"
        descripcion="Un portal sirve si lo que muestra es cierto. Estas son las cuatro reglas que sostienen eso."
      />

      <ul className="grid gap-4 sm:grid-cols-2">
        {GARANTIAS.map((garantia) => (
          <li key={garantia.titulo}>
            <Tarjeta className="flex h-full gap-3.5 p-5">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                className="text-turquesa mt-0.5 shrink-0"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="11" fill="currentColor" opacity="0.14" />
                <path
                  d="M7 12.5l3.2 3.2L17 9"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div>
                <h3 className="font-texto text-tinta text-[16px] font-bold">
                  {garantia.titulo}
                </h3>
                <p className="text-tinta-60 mt-1 text-[14.5px]">{garantia.detalle}</p>
              </div>
            </Tarjeta>
          </li>
        ))}
      </ul>
    </Contenedor>
  );
}

export function PublicaGratis() {
  return (
    <Contenedor as="section" className="py-14 text-center sm:py-20">
      <h2 className="text-[clamp(1.6rem,4vw,2.5rem)]">Publicar en Wasipe es gratis</h2>
      <p className="text-tinta-60 mx-auto mt-3 mb-2 max-w-[48ch]">
        Crea tu cuenta, sube las fotos desde el celular y tu aviso queda publicado. Sin tarjeta,
        sin plan mínimo y sin pagar para ver quién te escribió.
      </p>
      <p className="text-tinta-45 mx-auto mb-7 max-w-[48ch] text-[14px]">
        Los planes pagos existen para destacar un aviso, no para poder publicarlo.
      </p>

      <div className="flex flex-wrap justify-center gap-3">
        <Boton href="/publicar" tamano="lg">
          Publicar mi propiedad
        </Boton>
        <Boton href="/precio-m2" variante="secundario" tamano="lg">
          Ver cuánto vale mi zona
        </Boton>
      </div>

      <p className="text-tinta-45 mt-6 text-[13.5px]">
        ¿Eres corredor o inmobiliaria?{' '}
        <Link href="/registrarse" className="text-fucsia font-bold hover:underline">
          Abre tu cuenta profesional
        </Link>
      </p>
    </Contenedor>
  );
}
