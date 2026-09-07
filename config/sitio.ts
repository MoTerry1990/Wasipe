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

/**
 * Si esto es el sitio de verdad o una vista previa.
 *
 * Existe porque hasta el sprint 22 **nada lo preguntaba**:
 * `NEXT_PUBLIC_ENTORNO` estaba configurada y solo la leía Sentry, así que
 * el Preview respondía `index, follow` y un `robots.txt` con `Allow: /`.
 * Se ofrecía a Google como si fuera el sitio real, y lo único que lo
 * tapaba era la protección de despliegue de Vercel, que se apaga con un
 * clic.
 *
 * Dos copias del mismo portal compitiendo en el índice es contenido
 * duplicado, y el que pierde no siempre es el que sobra.
 *
 * Se compara contra `'produccion'` y no contra una lista de entornos: si
 * la variable falta, está mal escrita o llega vacía, el resultado es
 * «no es producción», que es el lado seguro del error.
 */
export const ES_PRODUCCION = (process.env.NEXT_PUBLIC_ENTORNO ?? '').trim() === 'produccion';

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

/**
 * Datos de la empresa.
 *
 * El Libro de Reclamaciones es obligatorio para todo negocio que vende
 * al público en el Perú (Código de Protección y Defensa del Consumidor).
 * Va en el pie porque la ley pide que esté a la vista.
 */
export const EMPRESA = {
  razonSocial: 'Wasipe',
  ciudad: 'Lima, Perú',
  correo: 'hola@wasipe.pe',
} as const;

/** Enlaces del pie, agrupados. */
export const PIE = [
  {
    titulo: 'Buscar',
    enlaces: [
      { texto: 'Departamentos en venta', href: '/comprar?tipo=departamento' },
      { texto: 'Departamentos en alquiler', href: '/alquilar?tipo=departamento' },
      { texto: 'Casas en venta', href: '/comprar?tipo=casa' },
      { texto: 'Terrenos', href: '/comprar?tipo=terreno' },
      { texto: 'Proyectos nuevos', href: '/proyectos' },
      { texto: 'Precio por m²', href: '/precio-m2' },
    ],
  },
  {
    titulo: 'Publicar',
    enlaces: [
      { texto: 'Publicar gratis', href: '/publicar' },
      { texto: 'Soy propietario', href: '/registrarse' },
      { texto: 'Soy corredor inmobiliario', href: '/registrarse' },
      { texto: 'Somos inmobiliaria', href: '/registrarse' },
    ],
  },
  {
    titulo: 'Ayuda',
    enlaces: [
      { texto: 'Cómo funciona Wasipe', href: '/#como-funciona' },
      { texto: 'Cómo verificamos los avisos', href: '/#confianza' },
      { texto: 'Wasi AI', href: '/wasi-ai' },
      { texto: 'Escríbenos', href: 'mailto:hola@wasipe.pe' },
    ],
  },
] as const;

/**
 * Búsquedas populares del pie.
 *
 * Son enlaces de verdad, no adorno: es como llega la mayor parte del
 * tráfico de buscadores en el Perú ("departamentos en alquiler en
 * Miraflores"), y le dan a Google una puerta a cada combinación.
 */
export const BUSQUEDAS_POPULARES = [
  { texto: 'Departamentos en Miraflores', href: '/comprar?tipo=departamento&donde=miraflores' },
  { texto: 'Departamentos en San Isidro', href: '/comprar?tipo=departamento&donde=san-isidro' },
  { texto: 'Alquiler en Barranco', href: '/alquilar?donde=barranco' },
  { texto: 'Alquiler en Jesús María', href: '/alquilar?donde=jesus-maria' },
  { texto: 'Casas en Surco', href: '/comprar?tipo=casa&donde=santiago-de-surco' },
  { texto: 'Casas en La Molina', href: '/comprar?tipo=casa&donde=la-molina' },
  { texto: 'Terrenos en Cieneguilla', href: '/comprar?tipo=terreno&donde=cieneguilla' },
  { texto: 'Departamentos en Yanahuara', href: '/comprar?tipo=departamento&donde=yanahuara' },
  { texto: 'Proyectos en Lima', href: '/proyectos?donde=lima' },
  { texto: 'Oficinas en San Isidro', href: '/comprar?tipo=oficina&donde=san-isidro' },
] as const;

/** Enlaces legales. Todavía sin página: ver el pie. */
export const LEGALES = [
  { texto: 'Términos de uso', href: '/terminos' },
  { texto: 'Política de privacidad', href: '/privacidad' },
  { texto: 'Libro de Reclamaciones', href: '/libro-de-reclamaciones' },
] as const;

export const TIPOS_INMUEBLE = [
  { valor: 'departamento', texto: 'Departamentos' },
  { valor: 'casa', texto: 'Casas' },
  { valor: 'terreno', texto: 'Terrenos' },
  { valor: 'oficina', texto: 'Oficinas' },
  { valor: 'local', texto: 'Locales' },
  { valor: 'cochera', texto: 'Cocheras' },
] as const;
