import type { Metadata } from 'next';
import { Contenedor } from '@/components/ui/contenedor';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import { Boton } from '@/components/ui/boton';

export const metadata: Metadata = {
  title: 'Wasi AI',
  description:
    'Wasi AI ayuda a publicar, mejorar fotos, sugerir precio y buscar en lenguaje natural. Tú siempre apruebas antes de publicar.',
  alternates: { canonical: '/wasi-ai' },
};

/**
 * Cada función lleva su estado real.
 *
 * Ninguna está construida todavía, así que TODAS van marcadas "Muy pronto".
 * Prometer en presente lo que no existe es la forma más rápida de perder
 * la confianza del usuario en todo lo demás.
 */
const FUNCIONES = [
  {
    titulo: 'Publicación asistida',
    texto:
      'Redacta el título y la descripción de tu aviso en español claro, a partir de tus fotos y unos pocos datos. Tú lo revisas y apruebas antes de publicar.',
  },
  {
    titulo: 'Mejora de fotos',
    texto:
      'Corrige luz y encuadre sin inventar nada. La foto original siempre se conserva y toda imagen modificada se muestra etiquetada.',
  },
  {
    titulo: 'Ambientación virtual',
    texto:
      'Muestra cómo se vería un ambiente amoblado. Nunca oculta ni retoca defectos estructurales: eso sería engañar al comprador.',
  },
  {
    titulo: 'Video automático',
    texto:
      'Arma un recorrido en video con tus fotos, listo para compartir por WhatsApp o redes.',
  },
  {
    titulo: 'Búsqueda en lenguaje natural',
    texto:
      '“Departamento de 3 dormitorios en Miraflores cerca a un parque, hasta US$ 200,000”. Sin filtros, escribiendo como hablas.',
  },
  {
    titulo: 'Comparación y recomendaciones',
    texto:
      'Compara varias propiedades lado a lado y explica en qué se diferencian de verdad, más allá del precio.',
  },
];

export default function WasiAI() {
  return (
    <Contenedor className="py-10 sm:py-16">
      <header className="mx-auto max-w-2xl text-center">
        <Insignia tono="fucsia">Muy pronto</Insignia>
        <h1 className="mt-4 text-[clamp(1.75rem,4.6vw,2.5rem)]">
          Encuentra, compara e imagina tu próximo hogar con inteligencia artificial
        </h1>
        <p className="text-tinta-60 mx-auto mt-4 max-w-[52ch]">
          Wasi AI se encarga de la parte tediosa de publicar y de la parte difícil de comparar.
          Nada se publica sin que tú lo apruebes.
        </p>
      </header>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FUNCIONES.map((f) => (
          <Tarjeta as="li" key={f.titulo} className="flex flex-col gap-2.5 p-5">
            <Insignia tono="neutro">Muy pronto</Insignia>
            <h2 className="font-display mt-1 text-[17.5px] font-extrabold">{f.titulo}</h2>
            <p className="text-tinta-60 text-[14.5px]">{f.texto}</p>
          </Tarjeta>
        ))}
      </ul>

      <Tarjeta className="mt-10 p-6 text-center">
        <h2 className="font-display text-xl font-extrabold">
          Cómo usamos la inteligencia artificial
        </h2>
        <ul className="text-tinta-60 mx-auto mt-4 flex max-w-[58ch] flex-col gap-2 text-left text-[14.5px]">
          <li>· La foto original siempre se conserva y se puede ver.</li>
          <li>
            · Toda imagen modificada se muestra con la etiqueta «Imagen modificada con Wasi AI».
          </li>
          <li>· La ambientación virtual nunca elimina ni disimula defectos estructurales.</li>
          <li>· Ninguna sugerencia se publica sin tu confirmación.</li>
          <li>· Las estimaciones de precio son referenciales y no reemplazan una tasación.</li>
        </ul>
        <Boton href="/publicar" variante="secundario" className="mt-6">
          Publicar una propiedad
        </Boton>
      </Tarjeta>
    </Contenedor>
  );
}
