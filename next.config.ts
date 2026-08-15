import type { NextConfig } from 'next';

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
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
    formats: ['image/avif', 'image/webp'],
    // Un SVG remoto puede traer scripts. Se sirven solo los locales.
    dangerouslyAllowSVG: false,
  },

  async headers() {
    return [{ source: '/:path*', headers: cabeceras }];
  },
};

export default nextConfig;
