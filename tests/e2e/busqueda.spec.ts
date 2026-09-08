import { test, expect } from '@playwright/test';

/**
 * Búsqueda: filtros, URL compartible y mapa.
 *
 * Casi todo acá comprueba la mitad que no depende de la base, que es la
 * que suele romperse: que los filtros lleguen a la URL, que la URL los
 * devuelva igual, y que un enlace manipulado no tumbe la página.
 *
 * Lo que sí depende de la base se dice en cada prueba. Antes no: el
 * archivo entero suponía «sin Supabase conectado, así que no hay
 * resultados», y desde que en el sprint 22 se sembró staging esa
 * suposición dejó de ser cierta sin que nadie la revisara.
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

    // Acotado al bloque de la propia página: el pie ofrece las mismas
    // búsquedas, y eso está bien. Lo que hay que comprobar es que el 404
    // las ofrezca por su cuenta, sin depender de que alguien baje hasta
    // el pie.
    const sugerencias = page.getByRole('region', {
      name: 'Mientras tanto, las búsquedas más usadas',
    });
    await expect(
      sugerencias.getByRole('link', { name: 'Departamentos en Miraflores' }),
    ).toBeVisible();
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
  // La barra solo existe cuando hay resultados —es lo que los ordena—, así
  // que estas dos necesitan avisos publicados en el entorno de prueba. El
  // estado vacío no se queda sin cubrir: la prueba de acá abajo lo fuerza
  // con filtros imposibles, que no depende de lo que haya en la base.
  //
  // Antes esta prueba se llamaba «el orden y la vista se eligen desde la
  // barra» y lo único que comprobaba era el texto del estado vacío. Pasaba
  // en verde sin haber tocado nunca la barra, y el día que staging tuvo
  // datos se puso roja sin que hubiera nada roto.
  test('el orden se elige desde la barra y queda en la URL', async ({ page }) => {
    await page.goto('/comprar');

    const barra = page.getByLabel('Ordenar los resultados');
    await expect(
      barra,
      'no hay avisos publicados en el entorno de prueba: la barra de orden no se dibuja',
    ).toBeVisible();

    await barra.selectOption('precio-asc');

    // Lo que importa es que quede en la dirección: el orden tiene que
    // sobrevivir a compartir el enlace y a recargar.
    await expect(page).toHaveURL(/orden=precio-asc/);
    await expect(page.getByLabel('Ordenar los resultados')).toHaveValue('precio-asc');
  });

  test('la vista cambia a mapa desde la barra', async ({ page }) => {
    await page.goto('/comprar');

    const grupo = page.getByRole('group', { name: 'Cómo ver los resultados' });
    await expect(
      grupo,
      'no hay avisos publicados en el entorno de prueba: la barra de vista no se dibuja',
    ).toBeVisible();

    await grupo.getByRole('button', { name: 'mapa' }).click();

    await expect(page).toHaveURL(/vista=mapa/);
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 20_000 });
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
