import { test, expect } from '@playwright/test';

/**
 * Wasi AI en el navegador.
 *
 * Sin Supabase ni proveedor configurados, lo que se puede comprobar es
 * lo que le llega a cualquier visitante: la página pública dice qué hace
 * y con qué límites, y el panel sigue siendo privado. El asistente
 * dentro del formulario se prueba contra un proyecto real, no acá.
 */

test.describe('la página pública de Wasi AI', () => {
  test('dice qué está construido y qué no', async ({ page }) => {
    await page.goto('/wasi-ai');

    await expect(page.getByRole('heading', { name: /Publicación asistida/ })).toBeVisible();
    // Nada se anuncia como terminado: la redacción está en pruebas y el
    // resto ni siquiera empezó.
    await expect(page.getByText('En pruebas').first()).toBeVisible();
    await expect(page.getByText('Muy pronto').first()).toBeVisible();
  });

  test('promete que nada se publica sin confirmación', async ({ page }) => {
    await page.goto('/wasi-ai');
    await expect(
      page.getByText('Ninguna sugerencia se publica sin tu confirmación.'),
    ).toBeVisible();
  });

  test('y avisa lo que la IA no va a afirmar', async ({ page }) => {
    await page.goto('/wasi-ai');
    await expect(page.getByText(/nunca afirma que la propiedad está saneada/i)).toBeVisible();
    await expect(page.getByText(/ni que la zona es segura/i)).toBeVisible();
  });

  test('la etiqueta de las imágenes está a la vista', async ({ page }) => {
    await page.goto('/wasi-ai');
    await expect(page.getByText(/Imagen modificada con Wasi AI/)).toBeVisible();
  });
});

test.describe('el panel de Wasi AI', () => {
  test('sin sesión no se entra', async ({ page }) => {
    await page.goto('/panel/wasi-ai');
    await expect(page).toHaveURL(/\/ingresar/);
  });
});

test.describe('en móvil', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('la página pública se lee igual', async ({ page }) => {
    await page.goto('/wasi-ai');
    await expect(page.getByRole('heading', { name: /Publicación asistida/ })).toBeVisible();
  });
});
