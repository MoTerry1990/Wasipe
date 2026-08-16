import { SITIO, EMPRESA } from '@/config/sitio';

/**
 * Datos estructurados (JSON-LD).
 *
 * Es lo que hace que un aviso de Wasipe salga en Google con el precio, el
 * área y la foto en vez de un enlace azul suelto. En un portal
 * inmobiliario esa diferencia es la mitad del clic.
 *
 * Regla que se aplica sin excepción: **acá no se afirma nada que la
 * página no muestre**. Un `aggregateRating` inventado o un precio que no
 * es el que ve la persona son motivo de penalización manual, y con razón.
 * Todo lo que sale de estas funciones viene de datos ya validados por la
 * base.
 */

type Nodo = Record<string, unknown>;

const absoluta = (ruta: string) => (ruta.startsWith('http') ? ruta : `${SITIO.url}${ruta}`);

/** La organización. Va una sola vez, en la portada. */
export function organizacion(): Nodo {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITIO.url}/#organizacion`,
    name: SITIO.nombre,
    url: SITIO.url,
    description: SITIO.descripcion,
    logo: absoluta('/og.png'),
    email: EMPRESA.correo,
    areaServed: { '@type': 'Country', name: 'Perú' },
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Lima',
      addressCountry: 'PE',
    },
  };
}

/**
 * El sitio, con su buscador.
 *
 * `SearchAction` es lo que le permite a Google mostrar una caja de
 * búsqueda de Wasipe dentro de su propio resultado. La plantilla apunta a
 * `/comprar?donde=`, que es una dirección que existe de verdad: declarar
 * una que no existe es peor que no declarar ninguna.
 */
export function sitioWeb(): Nodo {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITIO.url}/#sitio`,
    url: SITIO.url,
    name: SITIO.nombre,
    inLanguage: 'es-PE',
    publisher: { '@id': `${SITIO.url}/#organizacion` },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITIO.url}/comprar?donde={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export type Miga = { texto: string; href?: string };

/**
 * El rastro de migas.
 *
 * La última no lleva enlace —es dónde estás—, pero sí entra al JSON-LD:
 * Google la usa para dibujar la ruta bajo el título del resultado.
 */
export function migas(pasos: readonly Miga[]): Nodo {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: pasos.map((paso, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: paso.texto,
      ...(paso.href ? { item: absoluta(paso.href) } : {}),
    })),
  };
}

/**
 * Un listado de avisos.
 *
 * `ItemList` con solo las URL, sin repetir precio ni área: cada ficha ya
 * los declara por su cuenta, y duplicarlos acá abre la puerta a que los
 * dos números se contradigan cuando alguien edite su aviso.
 */
export function listaDeAvisos(titulo: string, rutas: readonly string[], total: number): Nodo {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: titulo,
    numberOfItems: total,
    itemListElement: rutas.map((ruta, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: absoluta(ruta),
    })),
  };
}

/** Una inmobiliaria. */
export function inmobiliaria(datos: {
  nombre: string;
  slug: string;
  descripcion?: string | null;
  logo?: string | null;
  telefono?: string | null;
  sitioWeb?: string | null;
  verificada: boolean;
}): Nodo {
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    name: datos.nombre,
    url: absoluta(`/inmobiliaria/${datos.slug}`),
    ...(datos.descripcion ? { description: datos.descripcion } : {}),
    ...(datos.logo ? { logo: datos.logo, image: datos.logo } : {}),
    ...(datos.telefono ? { telephone: datos.telefono } : {}),
    ...(datos.sitioWeb ? { sameAs: [datos.sitioWeb] } : {}),
    areaServed: { '@type': 'Country', name: 'Perú' },
    // La verificación es un hecho comprobable: Wasipe revisó el RUC. No
    // es una calificación ni una opinión, y por eso puede declararse.
    ...(datos.verificada
      ? {
          hasCredential: {
            '@type': 'EducationalOccupationalCredential',
            credentialCategory: 'Inmobiliaria verificada por Wasipe',
          },
        }
      : {}),
  };
}

/**
 * El índice de precio por m² de un distrito.
 *
 * `Dataset` y no `Product`: es una estadística agregada, no algo que se
 * venda. Declara la muestra y la fecha porque una cifra de mercado sin
 * eso no se puede evaluar.
 */
export function indiceDeDistrito(datos: {
  distrito: string;
  slug: string;
  muestra: number;
  actualizado: string;
}): Nodo {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `Precio por m² en ${datos.distrito}`,
    description: `Precio por metro cuadrado en ${datos.distrito}, calculado sobre ${datos.muestra} avisos publicados en Wasipe.`,
    url: absoluta(`/precio-m2/${datos.slug}`),
    dateModified: datos.actualizado,
    isAccessibleForFree: true,
    creator: { '@id': `${SITIO.url}/#organizacion` },
    spatialCoverage: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: datos.distrito,
        addressCountry: 'PE',
      },
    },
  };
}
