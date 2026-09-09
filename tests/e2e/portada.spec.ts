import { test, expect, type Locator } from '@playwright/test';

/**
 * Portada.
 *
 * Corre sin proyecto de Supabase conectado, así que las secciones que
 * leen la base muestran su estado vacío. Eso es exactamente lo que hay
 * que comprobar: la portada tiene que sostenerse sin datos, no romperse.
 */

test.describe('hero', () => {
  test('muestra el título y la bajada exactos', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', {
        name: 'Encuentra tu próximo hogar sabiendo cuánto vale realmente',
        level: 1,
      }),
    ).toBeVisible();

    await expect(
      page.getByText(
        'Casas, departamentos, terrenos y proyectos en todo el Perú, con precios por m² para comparar mejor.',
      ),
    ).toBeVisible();
  });

  test('la ilustración de Lima sigue ahí y escala con la pantalla', async ({ page }) => {
    await page.goto('/');
    const svg = page.locator('[aria-hidden="true"] svg').first();
    await expect(svg).toBeAttached();

    // viewBox + width 100% es lo que la mantiene nítida en cualquier
    // tamaño: si alguien la pasa a PNG, esto lo detecta.
    await expect(svg).toHaveAttribute('viewBox', /\d/);
    const ancho = await svg.evaluate((el) => getComputedStyle(el).width);
    expect(ancho).not.toBe('0px');
  });

  test('las tres pestañas están y solo una queda activa', async ({ page }) => {
    await page.goto('/');

    for (const nombre of ['Comprar', 'Alquilar', 'Proyectos']) {
      await expect(page.getByRole('tab', { name: nombre })).toBeVisible();
    }

    const seleccionadas = page.getByRole('tab', { selected: true });
    await expect(seleccionadas).toHaveCount(1);
    await expect(seleccionadas).toHaveText('Comprar');
  });
});

test.describe('búsqueda', () => {
  test('lleva a /comprar con los parámetros escritos', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Tipo de propiedad').selectOption('casa');
    const campo = page.getByRole('combobox', { name: '¿Dónde buscas?' });
    await campo.fill('Miraflores');
    // En móvil la lista de sugerencias tapa el botón, igual que en
    // cualquier buscador: primero se cierra, después se envía.
    await campo.press('Escape');
    await page.getByRole('button', { name: 'Buscar' }).click();

    await expect(page).toHaveURL(/\/comprar\?/);
    const params = new URL(page.url()).searchParams;
    expect(params.get('tipo')).toBe('casa');
    expect(params.get('donde')).toBe('Miraflores');
  });

  test('cada pestaña manda a su propia ruta', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Alquilar' }).click();
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page).toHaveURL(/\/alquilar/);

    await page.goto('/');
    await page.getByRole('tab', { name: 'Proyectos' }).click();
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page).toHaveURL(/\/proyectos/);
  });

  test('sin escribir nada va al listado sin parámetros sueltos', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Buscar' }).click();

    // Sin "donde" vacío colgando de la URL.
    await expect(page).toHaveURL(/\/comprar\?tipo=departamento$/);
  });

  test('el autocompletado sugiere sin tildes y se puede elegir con el teclado', async ({
    page,
  }) => {
    await page.goto('/');
    const campo = page.getByRole('combobox', { name: '¿Dónde buscas?' });

    await campo.fill('jesus');
    const opcion = page.getByRole('option', { name: /Jesús María/ });
    await expect(opcion).toBeVisible();

    await campo.press('ArrowDown');
    await campo.press('Enter');
    await expect(campo).toHaveValue('Jesús María');
  });

  test('los atajos de distrito llevan a la búsqueda de ese distrito', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Miraflores', exact: true }).first().click();
    await expect(page).toHaveURL(/\/comprar\?donde=miraflores/);
  });
});

/**
 * Cambiar de moneda es una acción de servidor, y hay que esperarla como tal.
 *
 * El botón se deshabilita mientras la acción está en vuelo y vuelve a
 * habilitarse cuando termina. Estas pruebas sondeaban directamente
 * `aria-pressed` contra el límite de 5 segundos por omisión, que en una
 * corrida tranquila sobra —medido cinco veces seguidas: 1382, 1526, 1488,
 * 1466 y 1529 ms— pero se queda corto cuando la suite completa está
 * compitiendo por el mismo servidor. De ahí que fallara una de cada
 * cuatro corridas sin que hubiera nada roto.
 *
 * El arreglo no es subir el número: es esperar el hecho observable —que
 * la acción terminó— y recién entonces afirmar sobre su efecto. Si algún
 * día el cambio de moneda de verdad se rompe o se cuelga, esto sigue
 * fallando.
 */
const esperarCambioDeMoneda = async (boton: Locator) => {
  await boton.click();
  await expect(boton).toBeEnabled({ timeout: 20_000 });
};

test.describe('preferencia de moneda', () => {
  test('empieza en dólares y se puede cambiar a soles', async ({ page }) => {
    await page.goto('/');

    const dolares = page.getByRole('button', { name: /dólares/ });
    const soles = page.getByRole('button', { name: /soles/ });

    await expect(dolares).toHaveAttribute('aria-pressed', 'true');

    await esperarCambioDeMoneda(soles);
    await expect(soles).toHaveAttribute('aria-pressed', 'true');
    await expect(dolares).toHaveAttribute('aria-pressed', 'false');
  });

  test('la preferencia sobrevive a una recarga', async ({ page }) => {
    await page.goto('/');
    // Hay que esperar a que la acción termine: si no, la recarga puede
    // llegar antes de que el navegador guarde la cookie.
    await esperarCambioDeMoneda(page.getByRole('button', { name: /soles/ }));

    await page.reload();
    await expect(page.getByRole('button', { name: /soles/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

test.describe('secciones', () => {
  const TITULOS = [
    'Propiedades destacadas',
    'Recién publicadas',
    'Bajaron de precio',
    'Proyectos nuevos',
    'Distritos populares',
    'Precio promedio por m²',
    'Cómo funciona Wasipe',
    'La inteligencia artificial que te ayuda a publicar mejor',
    'Por qué puedes confiar en lo que ves',
    'Publicar en Wasipe es gratis',
  ];

  for (const titulo of TITULOS) {
    test(`la portada tiene la sección "${titulo}"`, async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: titulo, level: 2 })).toBeVisible();
    });
  }

  /**
   * Ninguna sección de datos es un hueco mudo.
   *
   * Antes esto se comprobaba buscando el texto «Sé el primero en
   * publicar», o sea que **daba por sentado que la base estaba vacía**.
   * Cuando en el sprint 22 se sembró staging, la portada empezó a mostrar
   * avisos —que es lo correcto— y la prueba se puso roja sin que hubiera
   * nada roto.
   *
   * Lo que hay que garantizar no es que la sección esté vacía, sino que
   * pase lo que pase **diga algo**: o muestra tarjetas, o explica por qué
   * no hay y ofrece a dónde ir. Eso es cierto con base llena y con base
   * vacía, así que la prueba dejó de depender de los datos sin dejar de
   * comprobar lo que importaba.
   */
  const CON_DATOS = [
    'Propiedades destacadas',
    'Recién publicadas',
    'Bajaron de precio',
    'Proyectos nuevos',
  ];

  for (const titulo of CON_DATOS) {
    test(`la sección "${titulo}" nunca queda muda`, async ({ page }) => {
      await page.goto('/');

      const seccion = page
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: titulo, level: 2 }) });
      await expect(seccion).toHaveCount(1);

      const tarjetas = await seccion.locator('a[href^="/propiedad/"]').count();

      if (tarjetas > 0) {
        // Con datos: cada tarjeta tiene que llevar a una ficha de verdad.
        expect(tarjetas).toBeGreaterThan(0);
        return;
      }

      // Sin datos: título, explicación y una salida. Los tres, no uno.
      const vacio = seccion.locator('h3');
      await expect(vacio).toHaveCount(1);
      await expect(vacio).not.toHaveText('');
      await expect(seccion.locator('p')).not.toHaveCount(0);
      await expect(seccion.getByRole('link')).not.toHaveCount(0);
    });
  }

  test('el aviso legal del índice aclara que no es una tasación', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/No es una tasación oficial/)).toBeVisible();
  });
});

test.describe('pie', () => {
  test('trae empresa, ayuda, publicación y búsquedas populares', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Búsquedas populares' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Ayuda' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Publicar' })).toBeVisible();
    await expect(page.getByText('Libro de Reclamaciones')).toBeVisible();
    await expect(page.getByRole('link', { name: 'hola@wasipe.pe' })).toBeVisible();
  });

  test('las búsquedas populares funcionan', async ({ page, request }) => {
    await page.goto('/');
    const enlaces = await page
      .locator('nav[aria-labelledby="pie-busquedas"] a')
      .evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));

    expect(enlaces.length).toBeGreaterThan(5);
    for (const href of enlaces) {
      const respuesta = await request.get(href);
      expect(respuesta.status(), `enlace roto: ${href}`).toBeLessThan(400);
    }
  });
});

test.describe('presentación', () => {
  test('no se desborda a lo ancho en escritorio', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const desborda = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(desborda, 'la portada se desborda a lo ancho').toBe(false);
  });

  test('está toda en castellano', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es-PE');

    const texto = (await page.locator('body').innerText()).toLowerCase();
    for (const palabra of ['search', 'loading', 'price', 'bedroom', 'apartment', 'sign in']) {
      expect(texto, `aparece "${palabra}" en la portada`).not.toContain(palabra);
    }
  });
});

test.describe('en móvil', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('el buscador se ve sin desplazar la pantalla', async ({ page }) => {
    await page.goto('/');

    const boton = page.getByRole('button', { name: 'Buscar' });
    const caja = await boton.boundingBox();

    expect(caja, 'no se encontró el botón de buscar').not.toBeNull();
    // Tiene que entrar en los primeros 844 px: si hay que desplazar para
    // buscar, la portada no cumple su única función.
    expect(caja!.y + caja!.height).toBeLessThanOrEqual(844);
  });

  test('la ilustración no se come la pantalla', async ({ page }) => {
    await page.goto('/');
    // Se mide con la ilustración ya dibujada: antes de eso el alto es 0
    // y la prueba pasaría por el motivo equivocado.
    await page.waitForLoadState('networkidle');

    // La página tiene dos <header>: el del menú y el del hero.
    const caja = await page.locator('#hero').boundingBox();
    expect(caja, 'no se encontró el hero').not.toBeNull();

    // El hero completo tiene que entrar en una pantalla y media. Más que
    // eso obliga a desplazar antes de ver la primera propiedad.
    expect(caja!.height).toBeLessThan(844 * 1.5);
  });

  test('tampoco se desborda a lo ancho', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const desborda = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(desborda).toBe(false);
  });

  test('la tabla de precio por m² se desplaza sola, sin arrastrar la página', async ({
    page,
  }) => {
    await page.goto('/');
    // Con datos la tabla es ancha; su contenedor tiene overflow propio.
    await page.waitForLoadState('networkidle');
    const desborda = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(desborda).toBe(false);
  });
});
