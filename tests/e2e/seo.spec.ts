import { test, expect, type Page } from '@playwright/test';

/**
 * SEO en el HTML de verdad.
 *
 * Las pruebas de unidad comprueban las reglas; estas comprueban que las
 * reglas llegan al `<head>` que sirve el servidor. Entre una cosa y la
 * otra hay un `generateMetadata()` que puede olvidarse de devolver algo,
 * y eso no se ve desde una función pura.
 */

const BASE = 'https://wasipe.netlify.app';

const leerCanonica = (page: Page) => page.locator('link[rel="canonical"]').getAttribute('href');

const leerRobots = (page: Page) =>
  page.locator('meta[name="robots"]').first().getAttribute('content');

async function jsonLd(page: Page): Promise<Record<string, unknown>[]> {
  const crudos = await page.locator('script[type="application/ld+json"]').allTextContents();
  return crudos.flatMap((texto) => {
    const dato = JSON.parse(texto);
    return Array.isArray(dato) ? dato : [dato];
  });
}

// ---------------------------------------------------------------------
// Canónicas
// ---------------------------------------------------------------------

test.describe('cada página declara su dirección canónica', () => {
  const CANONICAS: [string, string][] = [
    ['/', '/'],
    ['/comprar', '/comprar'],
    ['/alquilar', '/alquilar'],
    ['/precio-m2', '/precio-m2'],
    ['/busquedas', '/busquedas'],
    ['/wasi-ai', '/wasi-ai'],
  ];

  for (const [ruta, esperada] of CANONICAS) {
    test(`${ruta}`, async ({ page }) => {
      await page.goto(ruta);
      // La portada canoniza a la raíz del dominio, sin barra final: es
      // como la normaliza Next, y las dos formas son la misma página.
      expect(await leerCanonica(page)).toBe(esperada === '/' ? BASE : `${BASE}${esperada}`);
    });
  }

  test('una landing canoniza a su ruta bonita, no a la de parámetros', async ({ page }) => {
    await page.goto('/comprar/departamento/miraflores');
    const canonica = await leerCanonica(page);
    expect(canonica).toContain('/comprar/departamento/miraflores');
    expect(canonica).not.toContain('?');
  });

  test('los segmentos en otro orden llevan a la misma canónica', async ({ page }) => {
    await page.goto('/comprar/miraflores/departamento');
    // El middleware redirige a la forma canónica; lo que importa es que no
    // queden dos direcciones distintas con el mismo contenido.
    expect(page.url()).toContain('/comprar/departamento/miraflores');
  });

  test('la segunda página canoniza a la primera', async ({ page }) => {
    await page.goto('/comprar?pagina=2');
    expect(await leerCanonica(page)).not.toContain('pagina=2');
  });

  test('cambiar el orden no crea una canónica nueva', async ({ page }) => {
    await page.goto('/comprar?orden=precio-asc');
    expect(await leerCanonica(page)).not.toContain('orden=');
  });

  test('las pestañas de precio por m² canonizan a la versión limpia', async ({ page }) => {
    await page.goto('/precio-m2/miraflores?operacion=rent&periodo=m3');
    const canonica = await leerCanonica(page);
    expect(canonica).toContain('/precio-m2/miraflores');
    expect(canonica).not.toContain('?');
  });
});

// ---------------------------------------------------------------------
// Qué se indexa y qué no
// ---------------------------------------------------------------------

test.describe('las búsquedas flacas no se indexan', () => {
  test('una búsqueda con filtros de detalle lleva noindex', async ({ page }) => {
    await page.goto('/comprar?precioMax=150000&dorm=2&mascotas=1');
    expect(await leerRobots(page)).toContain('noindex');
  });

  test('pero deja seguir los enlaces: las fichas de adentro sí valen', async ({ page }) => {
    await page.goto('/comprar?precioMax=150000');
    expect(await leerRobots(page)).toContain('follow');
    expect(await leerRobots(page)).not.toContain('nofollow');
  });

  test('la segunda página tampoco se indexa', async ({ page }) => {
    await page.goto('/comprar?pagina=3');
    expect(await leerRobots(page)).toContain('noindex');
  });

  test('la vista de mapa tampoco: es la misma página con otra cara', async ({ page }) => {
    await page.goto('/comprar?vista=mapa');
    expect(await leerRobots(page)).toContain('noindex');
  });

  test('una landing sin avisos detrás no se indexa', async ({ page }) => {
    // Sin base conectada el conteo es null y la regla manda noindex, que
    // es lo correcto: si no sabemos qué hay detrás, no se ofrece.
    await page.goto('/comprar/departamento/cieneguilla');
    expect(await leerRobots(page)).toContain('noindex');
  });

  test('pero la página troncal se indexa igual', async ({ page }) => {
    // /comprar es navegación del sitio, no una combinación generada.
    // Sin restricción no se emite ninguna etiqueta, que es lo mismo que
    // decir «indexa»: lo que se comprueba es que no haya un noindex.
    await page.goto('/comprar');
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
  });

  test('el panel privado nunca se indexa', async ({ page }) => {
    await page.goto('/ingresar');
    expect(await leerRobots(page)).toContain('noindex');
  });

  test('el 404 tampoco, y responde 404 de verdad', async ({ page }) => {
    const respuesta = await page.goto('/esta-pagina-no-existe-en-wasipe');
    // Un «no existe» que responde 200 le enseña a Google que el sitio
    // tiene miles de páginas idénticas. Es de los errores más caros.
    expect(respuesta?.status()).toBe(404);
    expect(await leerRobots(page)).toContain('noindex');
  });
});

// ---------------------------------------------------------------------
// robots.txt y sitemap
// ---------------------------------------------------------------------

test.describe('robots.txt', () => {
  test('existe, es texto plano y apunta al sitemap', async ({ request }) => {
    const r = await request.get('/robots.txt');
    expect(r.status()).toBe(200);

    const cuerpo = await r.text();
    expect(cuerpo).toContain('Sitemap:');
    expect(cuerpo).toContain('/sitemap.xml');
  });

  test('cierra el panel y deja abierto lo público', async ({ request }) => {
    const cuerpo = await (await request.get('/robots.txt')).text();

    for (const privada of ['/panel', '/ingresar', '/auth', '/api']) {
      expect(cuerpo, privada).toContain(`Disallow: ${privada}`);
    }

    // Lo que NO puede estar bloqueado: si se bloquea el rastreo de una
    // búsqueda con filtros, el robot nunca entra a leer su `noindex` y la
    // página puede aparecer igual, sin descripción y sin control.
    expect(cuerpo).not.toContain('Disallow: /comprar');
    expect(cuerpo).not.toContain('Disallow: /alquilar');
    expect(cuerpo).not.toContain('Disallow: /propiedad');
  });
});

test.describe('el sitemap', () => {
  test('es XML válido y responde 200', async ({ request }) => {
    const r = await request.get('/sitemap.xml');
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toContain('xml');

    const cuerpo = await r.text();
    expect(cuerpo).toContain('<urlset');
    expect(cuerpo).toContain('</urlset>');
  });

  test('no repite ninguna dirección', async ({ request }) => {
    const cuerpo = await (await request.get('/sitemap.xml')).text();
    const urls = [...cuerpo.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]!);

    expect(urls.length).toBeGreaterThan(3);
    expect(new Set(urls).size).toBe(urls.length);
  });

  test('no lleva nada privado ni ninguna dirección con parámetros', async ({ request }) => {
    const cuerpo = await (await request.get('/sitemap.xml')).text();
    const urls = [...cuerpo.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]!);

    for (const url of urls) {
      expect(url, url).not.toContain('?');
      expect(url, url).not.toMatch(/\/(panel|ingresar|registrarse|auth|api|comparar)\b/);
      expect(url, url).toMatch(/^https?:\/\//);
    }
  });

  test('cada dirección que declara responde 200', async ({ request }) => {
    const cuerpo = await (await request.get('/sitemap.xml')).text();
    const urls = [...cuerpo.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]!);

    // Es el criterio de aceptación textual: «solo rutas canónicas
    // públicas válidas». Una que devuelva 404 lo incumple.
    for (const url of urls.slice(0, 25)) {
      const ruta = new URL(url).pathname;
      const r = await request.get(ruta);
      expect(r.status(), ruta).toBe(200);
    }
  });
});

// ---------------------------------------------------------------------
// Datos estructurados
// ---------------------------------------------------------------------

test.describe('los datos estructurados', () => {
  test('la portada declara la organización y el sitio', async ({ page }) => {
    await page.goto('/');
    const tipos = (await jsonLd(page)).map((n) => n['@type']);
    expect(tipos).toContain('Organization');
    expect(tipos).toContain('WebSite');
  });

  test('todos son JSON válido con contexto de schema.org', async ({ page }) => {
    for (const ruta of ['/', '/comprar', '/comprar/departamento/miraflores', '/busquedas']) {
      await page.goto(ruta);
      for (const nodo of await jsonLd(page)) {
        expect(nodo['@context'], ruta).toBe('https://schema.org');
        expect(nodo['@type'], ruta).toBeTruthy();
      }
    }
  });

  test('las migas emiten BreadcrumbList con posiciones seguidas', async ({ page }) => {
    await page.goto('/comprar/departamento/miraflores');
    const migas = (await jsonLd(page)).find((n) => n['@type'] === 'BreadcrumbList') as
      { itemListElement: { position: number }[] } | undefined;

    expect(migas).toBeDefined();
    const posiciones = migas!.itemListElement.map((p) => p.position);
    expect(posiciones).toEqual(posiciones.map((_, i) => i + 1));
  });

  test('y las migas se ven, no solo se declaran', async ({ page }) => {
    await page.goto('/comprar/departamento/miraflores');
    const rastro = page.getByRole('navigation', { name: 'Dónde estás' });
    await expect(rastro).toBeVisible();
    await expect(rastro.getByRole('link', { name: 'Inicio' })).toBeVisible();
  });

  test('ningún nodo declara una calificación que nadie dio', async ({ page }) => {
    for (const ruta of ['/', '/comprar', '/comprar/departamento/miraflores']) {
      await page.goto(ruta);
      for (const nodo of await jsonLd(page)) {
        expect(nodo.aggregateRating, ruta).toBeUndefined();
        expect(nodo.review, ruta).toBeUndefined();
      }
    }
  });
});

// ---------------------------------------------------------------------
// Compartir
// ---------------------------------------------------------------------

test.describe('al compartir un enlace', () => {
  test('la portada trae título, descripción e imagen', async ({ page }) => {
    await page.goto('/');
    for (const propiedad of ['og:title', 'og:description', 'og:image', 'og:site_name']) {
      await expect(
        page.locator(`meta[property="${propiedad}"]`).first(),
        propiedad,
      ).toHaveCount(1);
    }
  });

  test('una landing trae su propio título, no el genérico', async ({ page }) => {
    await page.goto('/comprar/departamento/miraflores');
    const titulo = await page
      .locator('meta[property="og:title"]')
      .first()
      .getAttribute('content');
    expect(titulo).toContain('Miraflores');
  });

  test('y su propia descripción: doscientas iguales serían una sola', async ({ page }) => {
    await page.goto('/comprar/departamento/miraflores');
    const unaCosa = await page
      .locator('meta[name="description"]')
      .first()
      .getAttribute('content');

    await page.goto('/alquilar/casa/barranco');
    const otraCosa = await page
      .locator('meta[name="description"]')
      .first()
      .getAttribute('content');

    expect(unaCosa).not.toBe(otraCosa);
    expect(unaCosa).toContain('Miraflores');
    expect(otraCosa).toContain('Barranco');
  });

  test('la imagen social de una landing se genera y es PNG', async ({ request }) => {
    const r = await request.get('/og/busqueda?tipo=departamento&lugar=Miraflores');
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toContain('image/png');
  });

  test('y un parámetro inventado no la rompe', async ({ request }) => {
    const r = await request.get('/og/busqueda?tipo=<script>&lugar=' + 'x'.repeat(500));
    expect(r.status()).toBe(200);
  });
});

// ---------------------------------------------------------------------
// Las landings existen de verdad
// ---------------------------------------------------------------------

test.describe('las landings del sprint', () => {
  const LAS_CUATRO = [
    ['/comprar/departamento/miraflores', 'Departamentos en venta en Miraflores'],
    ['/alquilar/departamento/jesus-maria', 'Departamentos en alquiler en Jesús María'],
    ['/comprar/casa', 'Casas en venta'],
    ['/precio-m2/san-isidro', 'Precio por m² en San Isidro'],
  ];

  for (const [ruta, titulo] of LAS_CUATRO) {
    test(`${ruta} responde y su h1 lo dice`, async ({ page }) => {
      const r = await page.goto(ruta!);
      expect(r?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveText(titulo!);
    });
  }

  test('se llega a ellas desde una página, no solo desde el sitemap', async ({ page }) => {
    await page.goto('/busquedas');
    await expect(
      page.getByRole('link', { name: 'Departamentos en venta en Miraflores' }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'San Isidro', exact: true }).first(),
    ).toBeVisible();
  });

  test('una landing enlaza a sus hermanas del mismo distrito', async ({ page }) => {
    await page.goto('/comprar/departamento/miraflores');
    const bloque = page.getByRole('region', { name: /Otras búsquedas en Miraflores/ });
    await expect(bloque).toBeVisible();
    await expect(
      bloque.getByRole('link', { name: /Casas en venta en Miraflores/ }),
    ).toBeVisible();
  });
});
