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
 * La redacción del aviso ya está construida y vive dentro del asistente
 * de publicación, pero todavía no corrió contra un proveedor en
 * producción: por eso dice «En pruebas» y no «Disponible». El resto ni
 * siquiera está construido. Prometer en presente lo que no existe es la
 * forma más rápida de perder la confianza del usuario en todo lo demás.
 */
const FUNCIONES = [
  {
    titulo: 'Publicación asistida',
    estado: 'En pruebas',
    texto:
      'Redacta el título y la descripción de tu aviso en español claro, a partir de los datos que ya cargaste. Aparece en el paso de descripción del asistente, y tú lo revisas y apruebas antes de publicar.',
  },
  {
    titulo: 'Mejora de fotos',
    estado: 'En pruebas',
    texto:
      'Luz, color, perspectiva y resolución, sin inventar nada. La foto original siempre se conserva y toda imagen modificada se muestra etiquetada. Está en el panel de cada aviso, en «Fotos y Wasi AI».',
  },
  {
    titulo: 'Ambientación virtual',
    estado: 'En pruebas',
    texto:
      'Muestra cómo se vería un ambiente amoblado, con otro estilo o con otro color de pared. Cada una lleva su etiqueta: «Amoblamiento virtual — imagen referencial». Nunca oculta ni retoca defectos estructurales: eso sería engañar al comprador.',
  },
  {
    titulo: 'Video automático',
    estado: 'En pruebas',
    texto:
      'Arma un video con tus fotos y los datos de tu aviso —precio, distrito, metros, ambientes— en vertical, cuadrado u horizontal, listo para WhatsApp y redes. La cámara no recorre el inmueble: cada foto se muestra por separado, porque un recorrido continuo daría a entender una distribución que nadie verificó.',
  },
  {
    titulo: 'Búsqueda en lenguaje natural',
    estado: 'Muy pronto',
    texto:
      '“Departamento de 3 dormitorios en Miraflores cerca a un parque, hasta US$ 200,000”. Sin filtros, escribiendo como hablas.',
  },
  {
    titulo: 'Comparación y recomendaciones',
    estado: 'Muy pronto',
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
            <Insignia tono={f.estado === 'En pruebas' ? 'maiz' : 'neutro'}>{f.estado}</Insignia>
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
            · Quien mira un aviso puede cambiar entre la foto original, la mejorada y la
            amoblada cuando existan.
          </li>
          <li>
            · Toda imagen modificada se muestra con la etiqueta «Imagen modificada con Wasi AI».
          </li>
          <li>· La ambientación virtual nunca elimina ni disimula defectos estructurales.</li>
          <li>
            · Wasi AI no agrega ni quita ambientes, ventanas o puertas, no cambia las medidas
            del inmueble y no toca lo que se ve por la ventana.
          </li>
          <li>
            · En el video, la cámara no recorre el inmueble y la narración se arma con los
            campos de tu aviso: no puede decir nada que tú no hayas cargado.
          </li>
          <li>· Ninguna sugerencia se publica sin tu confirmación.</li>
          <li>
            · Wasi AI redacta solo con los datos que tú cargaste: nunca afirma que la propiedad
            está saneada, que la construcción está en buen estado ni que la zona es segura.
          </li>
          <li>· Las estimaciones de precio son referenciales y no reemplazan una tasación.</li>
        </ul>
        <Boton href="/publicar" variante="secundario" className="mt-6">
          Publicar una propiedad
        </Boton>
      </Tarjeta>
    </Contenedor>
  );
}
