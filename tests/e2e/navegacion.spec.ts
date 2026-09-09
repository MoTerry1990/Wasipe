import { test, expect } from '@playwright/test';

/**
 * Criterio de aceptación del Sprint 2: todas las rutas cargan directamente
 * y también al recargar, la navegación funciona en escritorio y en móvil,
 * y ningún enlace interno queda roto.
 */

const RUTAS = [
  { ruta: '/', titulo: /Wasipe/ },
  { ruta: '/comprar', titulo: /Propiedades en venta/ },
  { ruta: '/alquilar', titulo: /Propiedades en alquiler/ },
  { ruta: '/proyectos', titulo: /Propiedades en proyectos/ },
  { ruta: '/precio-m2', titulo: /m²|Precio/ },
  { ruta: '/wasi-ai', titulo: /Wasi/ },
  { ruta: '/ingresar', titulo: /Ingresar|Iniciar/ },
  { ruta: '/registrarse', titulo: /Crear cuenta/ },
  { ruta: '/recuperar', titulo: /Recuperar/ },
  // /publicar y todo /panel exigen sesión desde el Sprint 4: su prueba
  // está en cuentas.spec.ts, donde se comprueba que redirigen.
];

for (const { ruta, titulo } of RUTAS) {
  test(`la ruta ${ruta} carga directamente`, async ({ page }) => {
    const respuesta = await page.goto(ruta);
    expect(respuesta?.status()).toBe(200);
    await expect(page).toHaveTitle(titulo);
    // Sin esto, una página en blanco pasaría la prueba.
    await expect(page.locator('main')).toBeVisible();
  });

  test(`la ruta ${ruta} sobrevive a una recarga`, async ({ page }) => {
    await page.goto(ruta);
    await page.reload();
    await expect(page.locator('main')).toBeVisible();
  });
}

test('la página inexistente responde 404 en español', async ({ page }) => {
  const respuesta = await page.goto('/esta-ruta-no-existe');
  expect(respuesta?.status()).toBe(404);
  await expect(page.getByText(/no encontramos|no existe/i)).toBeVisible();
});

test('el 404 de una sección no repite el encabezado ni el pie', async ({ page }) => {
  // P-34. Un `notFound()` dentro de un grupo de rutas dibujaba el 404 de
  // raíz —que trae cromo propio— anidado dentro de la plantilla del grupo,
  // que también lo trae. Salían dos encabezados, dos pies, dos `<main>` y
  // el `id="contenido"` repetido, con lo que el enlace de «saltar al
  // contenido» apuntaba a un destino ambiguo.
  //
  // Se comprueban las dos formas de caer en un 404, porque se resuelven
  // por caminos distintos y solo una estaba rota.
  for (const ruta of ['/comprar/narnia', '/no-existe-en-ninguna-parte']) {
    const respuesta = await page.goto(ruta);
    expect(respuesta?.status(), ruta).toBe(404);

    const cuenta = await page.evaluate(() => ({
      encabezados: document.querySelectorAll('header').length,
      pies: document.querySelectorAll('footer').length,
      principales: document.querySelectorAll('main').length,
      contenido: document.querySelectorAll('#contenido').length,
    }));

    // Uno de cada, no cero: un 404 sin salida es la mitad del problema.
    expect(cuenta, ruta).toEqual({
      encabezados: 1,
      pies: 1,
      principales: 1,
      contenido: 1,
    });
  }
});

test('el documento declara español peruano', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-PE');
});

test('ningún enlace interno de la portada está roto', async ({ page, request }) => {
  await page.goto('/');
  const destinos = await page.locator('a[href^="/"]').evaluateAll((enlaces) => [
    ...new Set(
      enlaces
        .map((a) => a.getAttribute('href') ?? '')
        // Las anclas (#contenido) no son rutas del servidor.
        .filter((href) => href.startsWith('/') && !href.startsWith('//')),
    ),
  ]);

  expect(destinos.length).toBeGreaterThan(3);

  // Las peticiones van en paralelo, no una detrás de otra.
  //
  // En serie esto tardaba entre 29 y 34 segundos contra un límite de 30,
  // así que salía roja o verde según cuánto estuviera cargado el servidor
  // —tres corridas seguidas dieron roja, verde y roja sin que cambiara
  // nada de la portada—. No había nada roto: había una prueba secuencial
  // rozando su propio límite. Subir el límite habría tapado el síntoma y
  // dejado la prueba igual de lenta.
  //
  // No se comprueba menos: se comprueban los mismos enlaces, con la misma
  // petición de verdad al servidor y la misma exigencia sobre el estado.
  const revisados = await Promise.all(
    destinos.map(async (destino) => ({
      destino,
      estado: (await request.get(destino)).status(),
    })),
  );

  const rotos = revisados.filter((r) => r.estado >= 400);
  expect(rotos, `enlaces rotos: ${rotos.map((r) => `${r.destino} → ${r.estado}`).join(', ')}`)
    .toEqual([]);
});

test('la ilustración de Lima sigue en la portada', async ({ page }) => {
  await page.goto('/');
  // Es decorativa: va oculta para lectores de pantalla.
  const svg = page.locator('[aria-hidden="true"] svg').first();
  await expect(svg).toBeAttached();
});
