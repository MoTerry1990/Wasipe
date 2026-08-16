import { test, expect } from '@playwright/test';

/**
 * Búsqueda: filtros, URL compartible y mapa.
 *
 * Corre sin Supabase conectado, así que no hay resultados. Lo que se
 * comprueba es la mitad que no depende de la base y que es la que suele
 * romperse: que los filtros lleguen a la URL, que la URL los devuelva
 * igual, y que un enlace manipulado no tumbe la página.
 */

test.describe('rutas de búsqueda', () => {
  test('cada operación tiene su página con su título', async ({ page }) => {
    await page.goto('/comprar');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Propiedades en venta');

    await page.goto('/alquilar');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Propiedades en alquiler');

    await page.goto('/proyectos');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Propiedades en proyectos',
    );
  });

  test('la ruta amigable arma el título con lo que dice la URL', async ({ page }) => {
    await page.goto('/alquilar/departamento/miraflores');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Departamentos en alquiler en Miraflores',
    );
  });

  test('los segmentos en otro orden redirigen a la dirección canónica', async ({ page }) => {
    await page.goto('/comprar/miraflores/casa');
    // Dos direcciones con el mismo contenido se pelean entre sí en Google.
    await expect(page).toHaveURL('/comprar/casa/miraflores');
  });

  test('un segmento inventado da 404, pero no deja a nadie en un callejón', async ({
    page,
  }) => {
    // Cambió en el sprint 17. Antes se redirigía a `/comprar` con 200,
    // pensando en quien llega con una errata. El problema es que eso es
    // un 404 blando: para un buscador significa que el sitio tiene
    // infinitas direcciones válidas con el mismo contenido, y es de los
    // errores más caros que puede tener un portal.
    //
    // La salida no era elegir entre la persona y el buscador: es
    // responder 404 de verdad Y que el 404 sirva. Desde el sprint 16
    // lleva las búsquedas más usadas y el índice completo, así que quien
    // llegó con una errata tiene más caminos que antes, no menos.
    const respuesta = await page.goto('/comprar/narnia');
    expect(respuesta?.status()).toBe(404);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Esta página no existe');
    await expect(page.getByRole('link', { name: /Departamentos en Miraflores/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /todas las búsquedas/i })).toBeVisible();
  });

  test('los parámetros y las rutas amigables llevan al mismo título', async ({ page }) => {
    await page.goto('/comprar?tipo=casa&distrito=Barranco');
    const conParametros = await page.getByRole('heading', { level: 1 }).textContent();

    await page.goto('/comprar/casa/barranco');
    const conSegmentos = await page.getByRole('heading', { level: 1 }).textContent();

    expect(conSegmentos).toBe(conParametros);
  });
});

test.describe('filtros', () => {
  // En móvil la columna de filtros está oculta y todo pasa por el cajón,
  // que tiene su propio bloque más abajo.
  test.skip(({ isMobile }) => Boolean(isMobile), 'la versión móvil se prueba aparte');

  test('lo que se elige queda escrito en la URL', async ({ page }) => {
    await page.goto('/comprar');

    await page.getByLabel('Tipo de propiedad').first().selectOption('casa');
    await page.getByLabel('Precio mínimo').first().fill('100000');
    await page.getByLabel('Precio máximo').first().fill('300000');
    await page.getByRole('button', { name: 'Aplicar filtros' }).first().click();

    await expect(page).toHaveURL(/tipo=casa/);
    const params = new URL(page.url()).searchParams;
    expect(params.get('precioMin')).toBe('100000');
    expect(params.get('precioMax')).toBe('300000');
  });

  test('la URL vuelve a llenar el formulario: el enlace se puede compartir', async ({
    page,
  }) => {
    await page.goto('/alquilar?tipo=departamento&precioMax=2500&dorm=3&verificados=1');

    await expect(page.getByLabel('Tipo de propiedad').first()).toHaveValue('departamento');
    await expect(page.getByLabel('Precio máximo').first()).toHaveValue('2500');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Departamentos en alquiler',
    );
  });

  test('limpiar deja la búsqueda sin filtros', async ({ page }) => {
    await page.goto('/comprar?tipo=casa&dorm=3&precioMax=200000');
    await page.getByRole('button', { name: 'Limpiar' }).first().click();

    await expect(page).toHaveURL('/comprar');
  });

  test('un parámetro inválido no rompe la página', async ({ page }) => {
    const respuesta = await page.goto(
      '/comprar?dorm=muchos&precioMin=abc&tipo=castillo&pagina=-9&orden=por-simpatia',
    );

    expect(respuesta?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Propiedades en venta');
  });

  test('un intento de inyección se trata como texto', async ({ page }) => {
    const respuesta = await page.goto("/comprar?distrito='; drop table properties; --");
    expect(respuesta?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test.describe('presentación de resultados', () => {
  test('el orden y la vista se eligen desde la barra', async ({ page }) => {
    // Sin resultados la barra no se dibuja: se comprueba el estado vacío,
    // que es lo que sí corresponde mostrar.
    await page.goto('/comprar');
    await expect(page.getByText('Todavía no hay propiedades acá')).toBeVisible();
  });

  test('con filtros y sin resultados, ofrece una salida', async ({ page }) => {
    await page.goto('/comprar?dorm=5&precioMax=1000');
    await expect(page.getByText('No encontramos propiedades con esos filtros')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Limpiar todos los filtros' })).toBeVisible();
  });

  test('la moneda de la URL manda sobre la preferencia guardada', async ({ page }) => {
    await page.goto('/comprar?moneda=PEN');
    // El enlace compartido se ve igual para quien lo mandó y para quien lo abre.
    await expect(page.getByRole('button', { name: /soles/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('las páginas con filtros no se indexan', async ({ page }) => {
    await page.goto('/comprar?dorm=3');
    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveAttribute('content', /noindex/);
  });

  test('la búsqueda sin filtros sí se indexa', async ({ page }) => {
    await page.goto('/comprar');
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
  });
});

test.describe('en móvil', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('los filtros se abren en un cajón', async ({ page }) => {
    await page.goto('/comprar');

    const abrir = page.getByRole('button', { name: /^Filtros/ }).first();
    await expect(abrir).toBeVisible();
    await abrir.click();

    const cajon = page.getByRole('dialog', { name: 'Filtros de búsqueda' });
    await expect(cajon).toBeVisible();
  });

  test('se puede filtrar desde el cajón', async ({ page }) => {
    await page.goto('/comprar');
    await page
      .getByRole('button', { name: /^Filtros/ })
      .first()
      .click();

    const cajon = page.getByRole('dialog', { name: 'Filtros de búsqueda' });
    await cajon.getByLabel('Tipo de propiedad').selectOption('casa');
    await cajon.getByRole('button', { name: 'Aplicar filtros' }).click();

    await expect(page).toHaveURL(/tipo=casa/);
    // Al aplicar, el cajón se cierra: si no, tapa los resultados.
    await expect(cajon).toBeHidden();
  });

  test('el cajón se cierra con su botón', async ({ page }) => {
    await page.goto('/comprar');
    await page
      .getByRole('button', { name: /^Filtros/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Cerrar los filtros' }).click();
    await expect(page.getByRole('dialog', { name: 'Filtros de búsqueda' })).toBeHidden();
  });

  test('la búsqueda no se desborda a lo ancho', async ({ page }) => {
    await page.goto('/comprar?tipo=departamento&dorm=3&precioMax=250000');
    await page.waitForLoadState('networkidle');

    const desborda = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(desborda).toBe(false);
  });

  test('el contador de filtros dice cuántos hay puestos', async ({ page }) => {
    await page.goto('/comprar?tipo=casa&dorm=3&verificados=1');
    await expect(page.getByRole('button', { name: /^Filtros/ }).first()).toContainText('3');
  });
});
