import { test, expect } from '@playwright/test';

/**
 * Video automático en el navegador.
 *
 * El estudio vive detrás de la sesión y necesita un aviso con fotos, así
 * que lo que se comprueba acá es que la pantalla es privada y que la
 * página pública dice qué hace el video y qué no hace la cámara.
 */

test.describe('el estudio de video es privado', () => {
  test('sin sesión no se entra', async ({ page }) => {
    await page.goto('/panel/mis-propiedades/WSP-000001/video');
    await expect(page).toHaveURL(/\/ingresar/);
  });
});

test.describe('lo que se promete del video', () => {
  test('la cámara no recorre el inmueble', async ({ page }) => {
    await page.goto('/wasi-ai');
    await expect(page.getByText(/la cámara no recorre el inmueble/i).first()).toBeVisible();
  });

  test('el video se arma con los datos del aviso', async ({ page }) => {
    await page.goto('/wasi-ai');
    await expect(page.getByRole('heading', { name: /Video automático/ })).toBeVisible();
  });

  test('nada se publica sin confirmación', async ({ page }) => {
    await page.goto('/wasi-ai');
    await expect(
      page.getByText('Ninguna sugerencia se publica sin tu confirmación.'),
    ).toBeVisible();
  });
});

test.describe('en móvil', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('la promesa del video se lee igual', async ({ page }) => {
    await page.goto('/wasi-ai');
    await expect(page.getByText(/la cámara no recorre el inmueble/i).first()).toBeVisible();
  });
});
