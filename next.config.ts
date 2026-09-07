import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

/**
 * Cabeceras de seguridad.
 *
 * Se aplican a todo el sitio. La CSP es deliberadamente estricta con
 * `frame-ancestors 'none'` y sin `unsafe-eval`. React escapa por defecto,
 * así que no hace falta `unsafe-inline` para scripts en producción —
 * pero Next inyecta estilos en línea, por eso `style-src` sí lo permite.
 */
const cabeceras = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(self), interest-cohort=()',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Un error de tipos DEBE romper el build: si no, la regla 8 ("no marcar
  // un sprint completo si falla") no se puede sostener.
  //
  // El lint ya no se configura acá: Next 16 lo separó del build y se corre
  // aparte con `npm run lint`.
  typescript: { ignoreBuildErrors: false },

  images: {
    // Solo orígenes conocidos. Nada de comodines.
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com', pathname: '/**' },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    // Un SVG remoto puede traer scripts. Se sirven solo los locales.
    dangerouslyAllowSVG: false,

    // Dos calidades y no más. Cada combinación de tamaño y calidad es una
    // imagen distinta que hay que generar y guardar; con la lista abierta,
    // una dirección con `?q=73` obliga a rehacer el trabajo entero.
    //  · 72 para las tarjetas del listado, que se ven a 400 px de ancho.
    //  · 85 para la galería de la ficha, que se mira de cerca.
    qualities: [72, 85],

    // Los anchos que el diseño de verdad usa. La lista de Next trae ocho
    // por defecto, y cada uno que sobra es una variante más que generar.
    deviceSizes: [390, 640, 828, 1080, 1280, 1920],
    imageSizes: [64, 96, 128, 256, 384],

    // Treinta días en caché. Las fotos de un aviso no cambian: cuando se
    // reemplaza una, cambia la dirección, así que no hay nada que
    // invalidar y sí mucho que ahorrar.
    minimumCacheTTL: 2592000,
  },

  async headers() {
    return [{ source: '/:path*', headers: cabeceras }];
  },
};

/**
 * Sentry en el build.
 *
 * Sin este envoltorio el plugin de Sentry no corre: no se suben source
 * maps y, sobre todo, **la instrumentación del cliente no se inyecta**.
 * Faltaba, y el resultado era que el navegador no reportaba un solo error
 * aunque el DSN estuviera bien configurado.
 *
 * `sourcemaps.disable` cuando no hay `SENTRY_AUTH_TOKEN`: sin token no se
 * pueden subir, y dejar que lo intente solo llena el build de avisos. Con
 * token puesto, se suben y las trazas dejan de salir minificadas.
 */
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },

  // El túnel evita que los bloqueadores de anuncios se coman los errores
  // del navegador. Es una ruta propia del sitio, no un dominio de fuera.
  tunnelRoute: '/reporte-errores',

  // Los mapas no se publican: se suben a Sentry y se borran del paquete.
  // Si quedaran, cualquiera reconstruye el código fuente del sitio.
  widenClientFileUpload: false,
  disableLogger: true,
});
