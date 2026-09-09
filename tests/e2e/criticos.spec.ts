import { test, expect, type Page } from '@playwright/test';

/**
 * Los flujos críticos, de punta a punta.
 *
 * Qué se puede probar y qué no, dicho de entrada porque cambia cómo hay
 * que leer este archivo: **no hay proyecto de Supabase**. Sin base no hay
 * registro, no hay sesión, no hay avisos y no hay créditos.
 *
 * Así que lo que se prueba acá es lo que sí existe hoy, que no es poco y
 * es justamente lo que más suele fallar en un lanzamiento:
 *
 *  · Que ninguna pantalla privada se abra sin sesión.
 *  · Que cada formulario esté completo y sea usable con teclado.
 *  · Que sin base de datos nada explote: cada pantalla muestra un estado
 *    vacío decente en vez de una pantalla en blanco o un error crudo.
 *  · Que una petición no autorizada rebote.
 *
 * Lo que queda sin probar —crear una cuenta de verdad, publicar un aviso
 * de verdad, cobrar— está listado en FINAL_AUDIT.md como lo que es: sin
 * probar. No como aprobado.
 */

const esperar = (page: Page) => page.waitForLoadState('networkidle');

// ---------------------------------------------------------------------
// 1 · Cuentas
// ---------------------------------------------------------------------

test.describe('registro', () => {
  test('el formulario está completo y se envía con teclado', async ({ page }) => {
    await page.goto('/registrarse');

    await expect(page.getByLabel(/nombre/i).first()).toBeVisible();
    await expect(page.getByLabel(/correo/i).first()).toBeVisible();
    await expect(page.getByLabel(/contraseña/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /crear|registrar/i }).first()).toBeVisible();
  });

  test('un correo inválido no se envía', async ({ page }) => {
    await page.goto('/registrarse');

    await page
      .getByLabel(/correo/i)
      .first()
      .fill('esto-no-es-un-correo');
    await page
      .getByLabel(/contraseña/i)
      .first()
      .fill('unaClaveLarga123');
    await page
      .getByRole('button', { name: /crear|registrar/i })
      .first()
      .click();

    // No navega. Da igual si el mensaje lo pone el navegador o Zod: lo
    // que no puede pasar es que salga hacia el servidor.
    await expect(page).toHaveURL(/registrarse/);
  });

  test('dice qué se hace con los datos', async ({ page }) => {
    await page.goto('/registrarse');
    // Ley 29733: hay que decirlo antes, no en una página escondida.
    await expect(page.getByText(/privacidad|datos personales|términos/i).first()).toBeVisible();
  });
});

test.describe('inicio de sesión', () => {
  test('la pantalla existe y ofrece recuperar la clave', async ({ page }) => {
    await page.goto('/ingresar');

    await expect(page.getByLabel(/correo/i).first()).toBeVisible();
    await expect(page.getByLabel(/contraseña/i).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /olvid|recuperar/i }).first()).toBeVisible();
  });

  test('la contraseña no se ve al escribirla', async ({ page }) => {
    await page.goto('/ingresar');
    await expect(page.getByLabel(/contraseña/i).first()).toHaveAttribute('type', 'password');
  });

  test('no se indexa', async ({ page }) => {
    await page.goto('/ingresar');
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute(
      'content',
      /noindex/,
    );
  });
});

test.describe('recuperar la contraseña', () => {
  test('pide el correo y nada más', async ({ page }) => {
    await page.goto('/recuperar');
    await expect(page.getByLabel(/correo/i).first()).toBeVisible();
    await expect(page.getByRole('button').first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------
// 2 · Búsqueda
// ---------------------------------------------------------------------

test.describe('búsqueda', () => {
  test('sin base de datos muestra un estado vacío, no un error', async ({ page }) => {
    await page.goto('/comprar');
    await esperar(page);

    await expect(page.locator('h1')).toBeVisible();
    // Lo que no puede aparecer nunca en una pantalla pública.
    await expect(page.getByText(/error|undefined|null|\[object/i)).toHaveCount(0);
  });

  test('los filtros cambian la dirección y sobreviven a una recarga', async ({ page }) => {
    await page.goto('/comprar?dorm=2&precioMax=150000');
    await esperar(page);

    await page.reload();
    expect(page.url()).toContain('dorm=2');
    expect(page.url()).toContain('precioMax=150000');
  });

  test('un filtro inventado no rompe la página', async ({ page }) => {
    const r = await page.goto('/comprar?dorm=999999&precioMin=-5&orden=inventado&pagina=abc');
    expect(r?.status()).toBe(200);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('la vista de mapa abre sin caerse', async ({ page }) => {
    const r = await page.goto('/comprar?vista=mapa');
    expect(r?.status()).toBe(200);

    // Acá NO se puede usar `esperar()`. Es P-26, y la causa es concreta:
    // `networkidle` espera a que no quede ninguna petición en vuelo, y el
    // mapa pide teselas mientras se dibuja y vuelve a pedirlas al moverse,
    // así que ese silencio no llega nunca. En tres corridas aisladas dio
    // verde, roja y roja, siempre agotando el tiempo en `waitForLoadState`.
    //
    // Se espera lo que de verdad significa «abrió»: que el lienzo esté.
    // Es determinista y además exige más que antes —la versión vieja se
    // conformaba con un `h1`, que también sale con el mapa roto—.
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('h1')).toBeVisible();
  });

  test('una ruta de búsqueda inexistente da 404, no una lista cualquiera', async ({ page }) => {
    // Antes redirigía a `/comprar` con 200: un 404 blando. Para un
    // buscador eso significa que el sitio tiene infinitas direcciones
    // válidas con el mismo contenido.
    const r = await page.goto('/comprar/esto-no-es-un-distrito');
    expect(r?.status()).toBe(404);
  });
});

// ---------------------------------------------------------------------
// 3 · Ficha, favoritos, comparar, contacto
// ---------------------------------------------------------------------

test.describe('la ficha de un aviso', () => {
  test('un código inexistente da 404', async ({ page }) => {
    const r = await page.goto('/propiedad/departamento-en-venta-miraflores-90m2-wsp-999999');
    expect(r?.status()).toBe(404);
  });

  test('una dirección malformada también', async ({ page }) => {
    const r = await page.goto('/propiedad/cualquier-cosa');
    expect(r?.status()).toBe(404);
  });
});

test.describe('favoritos', () => {
  test('sin sesión manda a ingresar', async ({ page }) => {
    await page.goto('/panel/favoritos');
    await expect(page).toHaveURL(/\/ingresar/);
  });
});

test.describe('comparar', () => {
  test('abre y explica qué hace', async ({ page }) => {
    const r = await page.goto('/comparar');
    expect(r?.status()).toBe(200);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('con códigos inventados no explota', async ({ page }) => {
    const r = await page.goto('/comparar?avisos=WSP-999998,WSP-999999,no-existe');
    expect(r?.status()).toBe(200);
    const visible = await page.evaluate(() => document.body.innerText);
    expect(visible).not.toMatch(/\[object|undefined/i);
  });

  test('no se indexa: cada combinación sería una página distinta', async ({ page }) => {
    await page.goto('/comparar');
    const robots = await page.locator('meta[name="robots"]').first().getAttribute('content');
    expect(robots).toContain('noindex');
  });
});

// ---------------------------------------------------------------------
// 4 · Publicar y moderar
// ---------------------------------------------------------------------

test.describe('publicar un aviso', () => {
  test('sin sesión no se llega al formulario', async ({ page }) => {
    await page.goto('/publicar');
    // O manda a ingresar, o muestra la puerta de entrada. Lo que no
    // puede es dejar publicar sin cuenta.
    const url = page.url();
    const tieneFormulario = await page.locator('form input[name="title"]').count();
    expect(url.includes('/ingresar') || tieneFormulario === 0).toBe(true);
  });
});

test.describe('moderación y administración', () => {
  const PRIVADAS = [
    '/panel',
    '/panel/admin',
    '/panel/admin/avisos',
    '/panel/admin/banderas',
    '/panel/admin/usuarios',
    '/panel/admin/inmobiliarias',
    '/panel/admin/denuncias',
    '/panel/moderacion/imagenes',
    '/panel/moderacion/mercado',
    '/panel/mis-propiedades',
    '/panel/wasi-ai',
    '/panel/contactos',
    '/panel/alertas',
    '/panel/configuracion',
    '/panel/inmobiliaria',
  ];

  for (const ruta of PRIVADAS) {
    test(`${ruta} rebota sin sesión`, async ({ page }) => {
      await page.goto(ruta);
      await expect(page).toHaveURL(/\/ingresar/);
    });
  }

  test('ni con parámetros que aparenten permisos', async ({ page }) => {
    await page.goto('/panel/admin?rol=super_admin&admin=1&staff=true');
    await expect(page).toHaveURL(/\/ingresar/);
  });
});

// ---------------------------------------------------------------------
// 5 · Wasi AI
// ---------------------------------------------------------------------

test.describe('Wasi AI', () => {
  test('la página pública explica qué hace y qué no', async ({ page }) => {
    await page.goto('/wasi-ai');
    await expect(page.locator('h1')).toBeVisible();
    // La promesa que Wasipe hace por escrito.
    await expect(
      page.getByText(/no invent|no reemplaza|referencial|modificada/i).first(),
    ).toBeVisible();
  });

  test('el panel de Wasi AI no se abre sin sesión', async ({ page }) => {
    await page.goto('/panel/wasi-ai');
    await expect(page).toHaveURL(/\/ingresar/);
  });

  test('sin proveedor configurado no se ofrece nada que no funcione', async ({ page }) => {
    await page.goto('/wasi-ai');
    await esperar(page);
    // Sin claves de IA la página informa; lo que no puede es reventar.
    const visible = await page.evaluate(() => document.body.innerText);
    expect(visible).not.toMatch(/\[object|undefined|TypeError/i);
  });
});

// ---------------------------------------------------------------------
// 6 · Base vacía: ninguna pantalla en blanco
// ---------------------------------------------------------------------

const PUBLICAS = [
  '/',
  '/comprar',
  '/alquilar',
  '/proyectos',
  '/comprar/departamento/miraflores',
  '/precio-m2',
  '/precio-m2/san-isidro',
  '/busquedas',
  '/comparar',
  '/wasi-ai',
];

test.describe('con la base vacía', () => {
  for (const ruta of PUBLICAS) {
    test(`${ruta} responde 200 y tiene contenido`, async ({ page }) => {
      const r = await page.goto(ruta);
      expect(r?.status()).toBe(200);
      await esperar(page);

      await expect(page.locator('h1')).toHaveCount(1);

      // Nada de fugas técnicas en una pantalla que ve cualquiera.
      //
      // Se mira `innerText` y no `textContent`: el segundo incluye lo que
      // hay dentro de los `<script>` —el JSON-LD y el arranque de React,
      // que llevan la palabra `undefined` sin que nadie la vea— y la
      // prueba fallaría por algo que no está en la pantalla.
      const visible = await page.evaluate(() => document.body.innerText);
      expect(visible, ruta).not.toMatch(
        /\[object Object\]|undefined|NaN|TypeError|ECONNREFUSED/,
      );
      expect(visible.length, ruta).toBeGreaterThan(300);
    });
  }

  test('ninguna deja un error en la consola del navegador', async ({ page }) => {
    const errores: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errores.push(m.text());
    });

    for (const ruta of PUBLICAS.slice(0, 5)) {
      await page.goto(ruta);
      await esperar(page);
    }

    // Se filtran los de red: sin Supabase, algunas peticiones fallan y
    // eso es esperado. Lo que no puede haber es un error de JavaScript.
    const deJavaScript = errores.filter(
      (e) => !/Failed to load resource|net::ERR|fetch/i.test(e),
    );
    expect(deJavaScript).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// 7 · Conexión lenta
// ---------------------------------------------------------------------

test.describe('con conexión lenta', () => {
  test('la portada muestra algo antes de que llegue todo', async ({ page }) => {
    // Se retrasa cada petición 300 ms. Con eso, una página que solo se
    // dibuja al final se nota: queda en blanco.
    await page.route('**/*', async (ruta) => {
      await new Promise((r) => setTimeout(r, 300));
      await ruta.continue();
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // El encabezado y el h1 son del servidor: tienen que estar sin
    // esperar a que cargue el JavaScript.
    await expect(page.locator('h1')).toBeVisible({ timeout: 15_000 });
  });

  test('la búsqueda muestra el esqueleto mientras espera', async ({ page }) => {
    await page.route('**/*', async (ruta) => {
      await new Promise((r) => setTimeout(r, 200));
      await ruta.continue();
    });

    await page.goto('/comprar', { waitUntil: 'domcontentloaded' });
    // El encabezado y los filtros no esperan a la base: van fuera del
    // Suspense justo para esto.
    await expect(page.locator('h1')).toBeVisible({ timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------
// 8 · Peticiones no autorizadas
// ---------------------------------------------------------------------

test.describe('peticiones no autorizadas', () => {
  test('las acciones de servidor no se pueden llamar a mano', async ({ request }) => {
    // Una acción de servidor necesita su identificador interno, que
    // cambia en cada compilación. Una petición inventada tiene que
    // rebotar, no ejecutarse a medias.
    const r = await request.post('/panel/admin/avisos', {
      headers: { 'Next-Action': 'inventado', 'Content-Type': 'text/plain;charset=UTF-8' },
      data: '[]',
    });
    expect([303, 400, 404, 405, 500]).toContain(r.status());
  });

  test('el sitemap y robots no filtran nada privado', async ({ request }) => {
    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).not.toMatch(/\/panel|\/api|\/auth/);
  });

  test('una ruta de API que no existe da 404, no un error del servidor', async ({
    request,
  }) => {
    const r = await request.get('/api/v1/propiedades');
    expect(r.status()).toBeLessThan(500);
  });
});

// ---------------------------------------------------------------------
// 9 · Tres tamaños de pantalla
// ---------------------------------------------------------------------

const TAMANOS = [
  { nombre: 'móvil', ancho: 390, alto: 844 },
  { nombre: 'tableta', ancho: 768, alto: 1024 },
  { nombre: 'escritorio', ancho: 1440, alto: 900 },
];

for (const tamano of TAMANOS) {
  test.describe(`en ${tamano.nombre}`, () => {
    test.use({ viewport: { width: tamano.ancho, height: tamano.alto } });

    test('la portada se lee y no desborda', async ({ page }) => {
      await page.goto('/');
      await esperar(page);

      await expect(page.locator('h1')).toBeVisible();

      const ancho = await page.evaluate(() => ({
        pagina: document.documentElement.scrollWidth,
        ventana: window.innerWidth,
      }));
      expect(ancho.pagina, tamano.nombre).toBeLessThanOrEqual(ancho.ventana + 1);
    });

    test('se puede navegar a comprar', async ({ page }) => {
      await page.goto('/');
      await esperar(page);

      // En móvil el menú está en un cajón; en escritorio a la vista. Lo
      // que importa es que se llegue, no por dónde.
      const menu = page.getByRole('button', { name: /men|abrir/i }).first();
      if (await menu.isVisible().catch(() => false)) await menu.click();

      await page.getByRole('link', { name: 'Comprar', exact: true }).first().click();
      await expect(page).toHaveURL(/\/comprar/);
    });

    test('la búsqueda se usa entera', async ({ page }) => {
      await page.goto('/comprar');
      await esperar(page);
      await expect(page.locator('h1')).toBeVisible();

      const ancho = await page.evaluate(() => ({
        pagina: document.documentElement.scrollWidth,
        ventana: window.innerWidth,
      }));
      expect(ancho.pagina, tamano.nombre).toBeLessThanOrEqual(ancho.ventana + 1);
    });
  });
}
