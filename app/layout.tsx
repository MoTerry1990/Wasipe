import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from 'next/font/google';
import { ES_PRODUCCION, SITIO } from '@/config/sitio';
import './globals.css';

/**
 * Tipografías con `next/font`: se autoalojan en el build, así que no hay
 * petición a Google en tiempo de ejecución ni salto de diseño al cargar.
 * Son las mismas tres del sitio anterior — la identidad no cambia.
 *
 * En el sprint 16 se probó pedirlas como fuentes variables —omitiendo
 * `weight`— con la idea de bajar la cantidad de archivos. Medido con dos
 * compilaciones limpias, salió al revés: 212 KB en variable contra 196 KB
 * con pesos fijos, porque un archivo variable trae todos los pesos
 * intermedios que acá nadie usa. Se quedaron los pesos fijos, y queda
 * escrito para que nadie lo intente de nuevo creyendo que mejora.
 *
 * Lo que sí se cambió: la mono no se precarga. Solo aparece en cifras y
 * códigos, que están debajo del primer pantallazo, y precargarla le quita
 * ancho de banda a la ilustración del hero, que es la que mide el LCP.
 */
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '800'],
  variable: '--fuente-display',
  display: 'swap',
});

const texto = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--fuente-texto',
  display: 'swap',
});

const dato = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--fuente-dato',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(SITIO.url),
  title: {
    default: 'Wasipe · Portal inmobiliario del Perú',
    template: '%s · Wasipe',
  },
  description: SITIO.descripcion,
  applicationName: SITIO.nombre,
  openGraph: {
    type: 'website',
    locale: 'es_PE',
    siteName: SITIO.nombre,
    title: 'Wasipe · Portal inmobiliario del Perú',
    description: SITIO.descripcion,
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Wasipe · Ve el precio antes de preguntar',
      },
    ],
  },
  twitter: { card: 'summary_large_image' },
  // Fuera de producción, `noindex` en todo el sitio. `robots.txt` ya
  // bloquea el rastreo, pero las dos cosas hacen falta: un `Disallow`
  // impide entrar, y una página bloqueada que alguien enlaza puede
  // aparecer igual en resultados, porque el robot nunca llegó a leer el
  // `noindex`. Con las dos, no hay puerta.
  robots: ES_PRODUCCION ? { index: true, follow: true } : { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#FFFFFF',
  width: 'device-width',
  initialScale: 1,
};

export default function LayoutRaiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PE" className={`${display.variable} ${texto.variable} ${dato.variable}`}>
      <body>
        {/* Primer elemento enfocable: poder saltar el menú es lo básico de accesibilidad. */}
        <a
          href="#contenido"
          className="focus:bg-fucsia sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[60] focus:rounded-xl focus:px-4 focus:py-2.5 focus:font-bold focus:text-white"
        >
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
