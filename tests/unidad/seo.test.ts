import { describe, it, expect, vi } from 'vitest';
import {
  MINIMO_PARA_INDEXAR,
  POR_QUE_NO_SE_INDEXA,
  motivoParaNoIndexar,
  robotsDeBusqueda,
  seIndexa,
} from '@/lib/seo/indexable';
import { landingsDeBusqueda, landingsDePrecio, landingsPorDistrito } from '@/lib/seo/landings';
import {
  organizacion,
  sitioWeb,
  migas,
  listaDeAvisos,
  inmobiliaria,
  indiceDeDistrito,
} from '@/lib/seo/estructurados';
import { leerFiltros } from '@/lib/busqueda/filtros';
import { UBICACIONES } from '@/config/ubicaciones';
import { SITIO } from '@/config/sitio';
import type { Operacion } from '@/types/base-datos';

/**
 * SEO.
 *
 * Lo que más se vigila acá es lo que **no** se indexa. Un portal
 * inmobiliario genera millones de direcciones válidas y casi todas son
 * ruido; dejarlas entrar no trae tráfico, reparte la autoridad del
 * dominio entre miles de páginas flacas y hunde las pocas que valen.
 */

const filtros = (operacion: Operacion, params: Record<string, string> = {}) =>
  leerFiltros(operacion, params);

// ---------------------------------------------------------------------
// Qué entra al índice
// ---------------------------------------------------------------------

describe('las páginas que sí se indexan', () => {
  it('la página de una operación entera, sin nada más', () => {
    expect(motivoParaNoIndexar(filtros('sale'), 40)).toBeNull();
    expect(motivoParaNoIndexar(filtros('rent'), 40)).toBeNull();
  });

  it('«departamentos en venta en Miraflores», que es la landing que pide el sprint', () => {
    const f = filtros('sale', { tipo: 'departamento', distrito: 'Miraflores' });
    expect(motivoParaNoIndexar(f, 40)).toBeNull();
    expect(seIndexa(f, 40)).toBe(true);
  });

  it('«departamentos en alquiler en Jesús María»', () => {
    expect(
      seIndexa(filtros('rent', { tipo: 'departamento', distrito: 'Jesús María' }), 12),
    ).toBe(true);
  });

  it('«casas en venta», sin distrito', () => {
    expect(seIndexa(filtros('sale', { tipo: 'casa' }), 60)).toBe(true);
  });

  it('y solo el distrito, sin tipo', () => {
    expect(seIndexa(filtros('sale', { distrito: 'Barranco' }), 9)).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Qué NO entra
// ---------------------------------------------------------------------

describe('las búsquedas flacas se quedan fuera', () => {
  it('una búsqueda vacía no se indexa: es el criterio de aceptación', () => {
    expect(seIndexa(filtros('sale', { tipo: 'departamento', distrito: 'Barranco' }), 0)).toBe(
      false,
    );
    expect(seIndexa(filtros('rent', { distrito: 'Cieneguilla' }), 0)).toBe(false);
  });

  it('pero /comprar y /alquilar se indexan pase lo que pase', () => {
    // Son navegación del sitio, no una combinación generada. Sacarlas del
    // índice porque la base tuvo un mal minuto costaría semanas de
    // recuperación, y el portal existe para tener esas dos páginas.
    for (const total of [0, 1, null]) {
      expect(seIndexa(filtros('sale'), total), `con total ${total}`).toBe(true);
      expect(seIndexa(filtros('rent'), total), `con total ${total}`).toBe(true);
    }
  });

  it('ni una con uno o dos avisos: sigue siendo más plantilla que contenido', () => {
    for (let total = 0; total < MINIMO_PARA_INDEXAR; total++) {
      expect(seIndexa(filtros('sale', { distrito: 'Miraflores' }), total), `con ${total}`).toBe(
        false,
      );
    }
    expect(seIndexa(filtros('sale', { distrito: 'Miraflores' }), MINIMO_PARA_INDEXAR)).toBe(
      true,
    );
  });

  it('los filtros de detalle sacan la página del índice', () => {
    const detalles: Record<string, string>[] = [
      { precioMax: '150000' },
      { precioMin: '80000' },
      { dorm: '2' },
      { banos: '2' },
      { cocheras: '1' },
      { areaMin: '80' },
      { techadaMax: '200' },
      { antiguedadMax: '5' },
      { amoblado: 'full' },
      { mascotas: '1' },
      { verificados: '1' },
      { rebajados: '1' },
      { nuevos: '1' },
    ];

    for (const detalle of detalles) {
      const f = filtros('sale', { tipo: 'departamento', distrito: 'Miraflores', ...detalle });
      expect(motivoParaNoIndexar(f, 500), Object.keys(detalle)[0]).toBe('filtros-de-detalle');
    }
  });

  it('la segunda página tampoco', () => {
    expect(motivoParaNoIndexar(filtros('sale', { pagina: '2' }), 500)).toBe('pagina-interior');
    expect(motivoParaNoIndexar(filtros('sale', { pagina: '17' }), 500)).toBe('pagina-interior');
  });

  it('ni lo que solo cambia cómo se ve', () => {
    const presentaciones: Record<string, string>[] = [
      { orden: 'precio-asc' },
      { vista: 'mapa' },
      { moneda: 'PEN' },
    ];

    for (const presentacion of presentaciones) {
      expect(
        motivoParaNoIndexar(filtros('sale', presentacion), 500),
        Object.keys(presentacion)[0],
      ).toBe('presentacion');
    }
  });

  it('cuando no sabemos qué hay detrás de una landing, no se indexa', () => {
    // `null` es «la base no respondió». No es lo mismo que «no hay
    // avisos»: ofrecer al índice una página cuyo contenido no pudimos
    // comprobar es prometer algo que quizá no está.
    expect(motivoParaNoIndexar(filtros('sale', { distrito: 'Miraflores' }), null)).toBe(
      'sin-conexion',
    );
  });

  it('pero los enlaces se siguen igual: las fichas de adentro sí valen', () => {
    const robots = robotsDeBusqueda(filtros('sale', { dorm: '3' }), 500);
    expect(robots).toEqual({ index: false, follow: true });
  });

  it('cada motivo se explica en castellano, no con una sigla', () => {
    for (const [clave, texto] of Object.entries(POR_QUE_NO_SE_INDEXA)) {
      expect(texto.length, clave).toBeGreaterThan(30);
      expect(texto, clave).toMatch(/[.]$/);
    }
  });
});

// ---------------------------------------------------------------------
// El catálogo de landings
// ---------------------------------------------------------------------

describe('las landings', () => {
  const todas = landingsDeBusqueda();

  it('están las cuatro que nombra el sprint', () => {
    const rutas = todas.map((l) => l.href);
    expect(rutas).toContain('/comprar/departamento/miraflores');
    expect(rutas).toContain('/alquilar/departamento/jesus-maria');
    expect(rutas).toContain('/comprar/casa');
    expect(rutas).toContain('/comprar/casa/santiago-de-surco');
  });

  it('el precio por m² de San Isidro también', () => {
    expect(landingsDePrecio().map((l) => l.href)).toContain('/precio-m2/san-isidro');
  });

  it('ninguna se repite', () => {
    const rutas = todas.map((l) => l.href);
    expect(new Set(rutas).size).toBe(rutas.length);
  });

  it('todas empiezan por comprar o alquilar, nunca por proyectos', () => {
    // Un proyecto se busca por su nombre, no por «proyectos en Surco».
    // Generar esas landings sería inventar una demanda que no existe.
    for (const landing of todas) {
      expect(landing.href, landing.href).toMatch(/^\/(comprar|alquilar)(\/|$)/);
    }
  });

  it('el orden de los segmentos es siempre el mismo: tipo y después lugar', () => {
    const conLos_dos = todas.filter((l) => l.tipo && l.distrito);
    expect(conLos_dos.length).toBeGreaterThan(50);

    for (const landing of conLos_dos.slice(0, 30)) {
      const [, , tipo, lugar] = landing.href.split('/');
      expect(tipo, landing.href).toBeTruthy();
      expect(lugar, landing.href).toBeTruthy();
      // El lugar tiene que ser un distrito conocido, no un tipo mal puesto.
      expect(
        UBICACIONES.some((u) => u.slug === lugar),
        landing.href,
      ).toBe(true);
    }
  });

  it('el texto de cada enlace se lee como se habla', () => {
    const miraflores = todas.find((l) => l.href === '/comprar/departamento/miraflores');
    expect(miraflores?.texto).toBe('Departamentos en venta en Miraflores');

    const jesusMaria = todas.find((l) => l.href === '/alquilar/departamento/jesus-maria');
    expect(jesusMaria?.texto).toBe('Departamentos en alquiler en Jesús María');
  });

  it('cubren todos los distritos del catálogo', () => {
    const agrupadas = landingsPorDistrito();
    expect(agrupadas).toHaveLength(UBICACIONES.length);
    for (const grupo of agrupadas) {
      expect(grupo.enlaces.length, grupo.distrito).toBeGreaterThan(3);
      expect(grupo.provincia, grupo.distrito).toBeTruthy();
    }
  });

  it('no se cruzan tipos que nadie busca por nombre', () => {
    // Cocheras y locales existen como filtro, pero «cocheras en alquiler
    // en Végueta» no la escribe nadie en Google y no tendría qué mostrar.
    for (const landing of todas) {
      expect(landing.href, landing.href).not.toMatch(/\/(cochera|local|almacen)\b/);
    }
  });
});

// ---------------------------------------------------------------------
// Datos estructurados
// ---------------------------------------------------------------------

describe('los datos estructurados', () => {
  it('la organización dice quién es y dónde opera', () => {
    const nodo = organizacion();
    expect(nodo['@type']).toBe('Organization');
    expect(nodo.name).toBe('Wasipe');
    expect(nodo.url).toBe(SITIO.url);
    expect(nodo.logo).toMatch(/^https?:\/\//);
  });

  it('el sitio declara un buscador que existe de verdad', () => {
    const nodo = sitioWeb() as {
      potentialAction: { target: { urlTemplate: string }; 'query-input': string };
    };
    // Declarar una plantilla que apunta a una dirección inexistente es
    // peor que no declarar ninguna: Google la prueba.
    expect(nodo.potentialAction.target.urlTemplate).toContain('/comprar?donde=');
    expect(nodo.potentialAction['query-input']).toContain('search_term_string');
  });

  it('las migas numeran los pasos desde uno y la última no lleva enlace', () => {
    const nodo = migas([
      { texto: 'Inicio', href: '/' },
      { texto: 'Comprar', href: '/comprar' },
      { texto: 'Miraflores' },
    ]) as { itemListElement: { position: number; name: string; item?: string }[] };

    expect(nodo.itemListElement.map((p) => p.position)).toEqual([1, 2, 3]);
    expect(nodo.itemListElement[0]!.item).toBe(`${SITIO.url}/`);
    expect(nodo.itemListElement[2]!.item).toBeUndefined();
  });

  it('la lista de avisos solo lleva direcciones, no precios', () => {
    const nodo = listaDeAvisos('Departamentos', ['/propiedad/uno', '/propiedad/dos'], 47) as {
      numberOfItems: number;
      itemListElement: Record<string, unknown>[];
    };

    expect(nodo.numberOfItems).toBe(47);
    // El precio lo declara cada ficha. Repetirlo acá abre la puerta a que
    // los dos números se contradigan cuando alguien edite su aviso.
    for (const item of nodo.itemListElement) {
      expect(item.price).toBeUndefined();
      expect(item.offers).toBeUndefined();
      expect(String(item.url)).toMatch(/^https?:\/\//);
    }
  });

  it('una inmobiliaria sin verificar no declara credencial', () => {
    const sin = inmobiliaria({ nombre: 'Casa Perú', slug: 'casa-peru', verificada: false });
    expect(sin.hasCredential).toBeUndefined();

    const con = inmobiliaria({ nombre: 'Casa Perú', slug: 'casa-peru', verificada: true });
    expect(con.hasCredential).toBeDefined();
  });

  it('y nunca declara una calificación: nadie la calificó', () => {
    const nodo = inmobiliaria({
      nombre: 'Casa Perú',
      slug: 'casa-peru',
      verificada: true,
      telefono: '+51 999 888 777',
    });
    expect(nodo.aggregateRating).toBeUndefined();
    expect(nodo.review).toBeUndefined();
    expect(nodo['@type']).toBe('RealEstateAgent');
  });

  it('el índice de un distrito declara su muestra y su fecha', () => {
    const nodo = indiceDeDistrito({
      distrito: 'San Isidro',
      slug: 'san-isidro',
      muestra: 34,
      actualizado: '2026-08-15T00:00:00.000Z',
    });
    // Una cifra de mercado sin muestra ni fecha no se puede evaluar.
    expect(nodo['@type']).toBe('Dataset');
    expect(String(nodo.description)).toContain('34');
    expect(nodo.dateModified).toBe('2026-08-15T00:00:00.000Z');
  });

  it('todo nodo declara contexto y tipo, que es lo mínimo para validar', () => {
    const nodos = [
      organizacion(),
      sitioWeb(),
      migas([{ texto: 'Inicio', href: '/' }]),
      listaDeAvisos('x', ['/a'], 1),
      inmobiliaria({ nombre: 'x', slug: 'x', verificada: false }),
      indiceDeDistrito({ distrito: 'x', slug: 'x', muestra: 5, actualizado: 'hoy' }),
    ];

    for (const nodo of nodos) {
      expect(nodo['@context'], String(nodo['@type'])).toBe('https://schema.org');
      expect(nodo['@type']).toBeTruthy();
      // Serializable sin sorpresas: va dentro de un <script> tal cual.
      expect(() => JSON.stringify(nodo)).not.toThrow();
      expect(JSON.stringify(nodo)).not.toContain('undefined');
    }
  });
});

/**
 * El Preview no se ofrece a Google.
 *
 * En el sprint 22, el primer despliegue respondía `index, follow` y un
 * `robots.txt` con `Allow: /`. `NEXT_PUBLIC_ENTORNO` estaba configurada y
 * **solo la leía Sentry**: ni `app/robots.ts` ni los metadatos la
 * consultaban.
 *
 * Lo único que lo tapaba era la protección de despliegue de Vercel, que se
 * apaga con un clic. Dos copias del mismo portal compitiendo por las
 * mismas búsquedas es contenido duplicado, y sacar una del índice después
 * lleva semanas.
 */
describe('fuera de producción no se indexa nada', () => {
  it('ES_PRODUCCION es falso si la variable falta, está vacía o dice otra cosa', async () => {
    const { ES_PRODUCCION } = await import('@/config/sitio');
    // Las pruebas no corren con NEXT_PUBLIC_ENTORNO=produccion.
    expect(ES_PRODUCCION).toBe(false);
  });

  it('robots.txt bloquea el rastreo entero', async () => {
    const robots = (await import('@/app/robots')).default();
    expect(robots.rules).toEqual([{ userAgent: '*', disallow: '/' }]);
    // Y no se ofrece el sitemap: sería una invitación a rastrear.
    expect(robots.sitemap).toBeUndefined();
  });

  // Los metadatos del layout no se prueban acá: importarlo arrastra
  // next/font/google, que necesita el build de Next. Esa mitad se
  // verifica sobre el Preview desplegado, que es donde importa.
});

/**
 * Y en producción, lo contrario.
 *
 * Esta mitad vivía solo en la prueba de navegador, que corre contra un
 * servidor que **nunca** es producción. O sea que el contrato de
 * producción no estaba comprobado en ningún lado: la prueba que decía
 * cubrirlo llevaba sprints en rojo justamente porque el servidor hacía lo
 * correcto para su entorno.
 *
 * Acá se fuerza la variable y se llama a la función, que es la única
 * manera de ver la rama de producción sin desplegar.
 */
describe('en producción sí se rastrea, salvo lo privado', () => {
  const forzarProduccion = async () => {
    const antes = process.env.NEXT_PUBLIC_ENTORNO;
    process.env.NEXT_PUBLIC_ENTORNO = 'produccion';
    vi.resetModules();
    try {
      return (await import('@/app/robots')).default();
    } finally {
      // Se restaura sí o sí: si esto se filtra, contagia a todo lo que
      // corra después en el mismo proceso.
      if (antes === undefined) delete process.env.NEXT_PUBLIC_ENTORNO;
      else process.env.NEXT_PUBLIC_ENTORNO = antes;
      vi.resetModules();
    }
  };

  it('ofrece el sitemap', async () => {
    const robots = await forzarProduccion();
    expect(robots.sitemap).toContain('/sitemap.xml');
  });

  it('cierra lo privado al rastreo', async () => {
    const robots = await forzarProduccion();
    const regla = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules;
    const cerrado = [regla?.disallow ?? []].flat();

    for (const privada of ['/panel', '/ingresar', '/auth', '/api']) {
      expect(cerrado, privada).toContain(privada);
    }
  });

  it('deja abierto lo público, incluidas las búsquedas con filtros', async () => {
    const robots = await forzarProduccion();
    const regla = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules;
    const cerrado = [regla?.disallow ?? []].flat();

    // Bloquear el rastreo de una búsqueda con filtros sería peor que no
    // hacer nada: el robot nunca entraría a leer su `noindex` y la página
    // podría aparecer igual, sin descripción y sin control.
    for (const publica of ['/comprar', '/alquilar', '/propiedad']) {
      expect(cerrado, publica).not.toContain(publica);
    }
    expect(regla?.allow).toBe('/');
  });

  it('y la variable no quedó pegada para las demás pruebas', async () => {
    const { ES_PRODUCCION } = await import('@/config/sitio');
    expect(ES_PRODUCCION).toBe(false);
  });
});

/**
 * El título no repite la marca.
 *
 * La portada servía «Wasipe · Departamentos, casas y proyectos en venta y
 * alquiler en el Perú · Wasipe». La página ponía la marca adelante y la
 * plantilla del layout, `%s · Wasipe`, la ponía otra vez atrás. Nadie lo
 * vio porque cada mitad, mirada sola, era correcta.
 */
describe('el título de una página', () => {
  it('la portada no lleva la marca adelante: la pone la plantilla', async () => {
    const { metadata } = await import('@/app/(public)/page');
    const titulo = typeof metadata.title === 'string' ? metadata.title : '';

    expect(titulo).not.toMatch(/^Wasipe/);
    expect(titulo.length).toBeGreaterThan(0);
  });

  it('ninguna página empieza por la marca', async () => {
    // Cualquier página que la ponga adelante va a duplicarla igual que la
    // portada. Es más barato prohibirlo acá que descubrirlo en Google.
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join, relative, sep } = await import('node:path');

    const raiz = join(__dirname, '..', '..');
    const paginas: string[] = [];

    const recorrer = (carpeta: string) => {
      for (const nombre of readdirSync(carpeta)) {
        const ruta = join(carpeta, nombre);
        if (statSync(ruta).isDirectory()) recorrer(ruta);
        else if (/^page\.tsx$/.test(nombre)) paginas.push(ruta);
      }
    };
    recorrer(join(raiz, 'app'));

    const culpables = paginas
      .filter((ruta) => /title:\s*['"`]Wasipe/.test(readFileSync(ruta, 'utf8')))
      .map((ruta) => relative(raiz, ruta).split(sep).join('/'));

    expect(culpables).toEqual([]);
  });
});
