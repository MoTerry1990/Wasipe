/**
 * Configuración del sitio. Un solo lugar para lo que se repite.
 */

export const SITIO = {
  nombre: 'Wasipe',
  descripcion:
    'Casas, departamentos, terrenos y proyectos en todo el Perú, con precios por m² para comparar mejor.',
  lema: 'Encuentra, compara e imagina tu próximo hogar con inteligencia artificial.',
  url: process.env.NEXT_PUBLIC_URL_SITIO ?? 'https://wasipe.netlify.app',
  local: 'es-PE',
  zonaHoraria: 'America/Lima',
} as const;

/** Navegación principal. El orden es el que se ve en el encabezado. */
export const NAVEGACION = [
  { texto: 'Comprar', href: '/comprar' },
  { texto: 'Alquilar', href: '/alquilar' },
  { texto: 'Proyectos', href: '/proyectos' },
  { texto: 'Precio por m²', href: '/precio-m2' },
  { texto: 'Wasi AI', href: '/wasi-ai' },
] as const;

/** Acciones del extremo derecho del encabezado. */
export const ACCIONES = [
  { texto: 'Favoritos', href: '/panel/favoritos', tipo: 'enlace' },
  { texto: 'Iniciar sesión', href: '/ingresar', tipo: 'secundario' },
  { texto: 'Publicar gratis', href: '/publicar', tipo: 'primario' },
] as const;

/** Distritos más buscados. Se muestran como atajos bajo el buscador. */
export const DISTRITOS_POPULARES = [
  { nombre: 'Miraflores', slug: 'miraflores' },
  { nombre: 'San Isidro', slug: 'san-isidro' },
  { nombre: 'Barranco', slug: 'barranco' },
  { nombre: 'Surco', slug: 'santiago-de-surco' },
  { nombre: 'Jesús María', slug: 'jesus-maria' },
  { nombre: 'San Miguel', slug: 'san-miguel' },
] as const;

/** Enlaces del pie, agrupados. */
export const PIE = [
  {
    titulo: 'Buscar',
    enlaces: [
      { texto: 'Departamentos en venta', href: '/comprar?tipo=departamento' },
      { texto: 'Departamentos en alquiler', href: '/alquilar?tipo=departamento' },
      { texto: 'Casas', href: '/comprar?tipo=casa' },
      { texto: 'Terrenos', href: '/comprar?tipo=terreno' },
      { texto: 'Proyectos', href: '/proyectos' },
    ],
  },
  {
    titulo: 'Publicar',
    enlaces: [
      { texto: 'Soy propietario', href: '/publicar?rol=propietario' },
      { texto: 'Soy corredor inmobiliario', href: '/publicar?rol=agente' },
      { texto: 'Somos inmobiliaria', href: '/publicar?rol=inmobiliaria' },
    ],
  },
  {
    titulo: 'Wasipe',
    enlaces: [
      { texto: 'Precio por m²', href: '/precio-m2' },
      { texto: 'Wasi AI', href: '/wasi-ai' },
      { texto: 'Iniciar sesión', href: '/ingresar' },
    ],
  },
] as const;

export const TIPOS_INMUEBLE = [
  { valor: 'departamento', texto: 'Departamentos' },
  { valor: 'casa', texto: 'Casas' },
  { valor: 'terreno', texto: 'Terrenos' },
  { valor: 'oficina', texto: 'Oficinas' },
  { valor: 'local', texto: 'Locales' },
  { valor: 'cochera', texto: 'Cocheras' },
] as const;
