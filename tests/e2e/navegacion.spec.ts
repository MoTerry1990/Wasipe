import { test, expect } from '@playwright/test';

/**
 * Criterio de aceptación del Sprint 2: todas las rutas cargan directamente
 * y también al recargar, la navegación funciona en escritorio y en móvil,
 * y ningún enlace interno queda roto.
 */

const RUTAS = [
  { ruta: '/', titulo: /Wasipe/ },
  { ruta: '/comprar', titulo: /Comprar/ },
  { ruta: '/alquilar', titulo: /Alquilar/ },
  { ruta: '/proyectos', titulo: /Proyectos/ },
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
  for (const destino of destinos) {
    const respuesta = await request.get(destino);
    expect(respuesta.status(), `enlace roto: ${destino}`).toBeLessThan(400);
  }
});

test('la ilustración de Lima sigue en la portada', async ({ page }) => {
  await page.goto('/');
  // Es decorativa: va oculta para lectores de pantalla.
  const svg = page.locator('[aria-hidden="true"] svg').first();
  await expect(svg).toBeAttached();
});
