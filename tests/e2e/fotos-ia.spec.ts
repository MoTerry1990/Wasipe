import { test, expect } from '@playwright/test';

/**
 * Mejora de fotos en el navegador.
 *
 * Sin Supabase no hay sesión, así que lo que se comprueba es que las tres
 * pantallas nuevas son privadas y que la página pública dice, sin letra
 * chica, qué se le hace a una foto y qué no. El comparador y el selector
 * de versiones se prueban contra un proyecto real, no acá.
 */

test.describe('las pantallas nuevas son privadas', () => {
  test('las fotos de un aviso no se ven sin sesión', async ({ page }) => {
    await page.goto('/panel/mis-propiedades/WSP-000001/fotos');
    await expect(page).toHaveURL(/\/ingresar/);
  });

  test('la revisión de imágenes tampoco', async ({ page }) => {
    await page.goto('/panel/moderacion/imagenes');
    await expect(page).toHaveURL(/\/ingresar/);
  });
});

test.describe('lo que se le promete a quien publica', () => {
  test('la foto original se conserva y lo modificado se etiqueta', async ({ page }) => {
    await page.goto('/wasi-ai');
    await expect(
      page.getByText('La foto original siempre se conserva y se puede ver.'),
    ).toBeVisible();
    await expect(page.getByText(/Imagen modificada con Wasi AI/)).toBeVisible();
  });

  test('el amoblamiento virtual no tapa defectos', async ({ page }) => {
    await page.goto('/wasi-ai');
    await expect(
      page.getByText(
        'La ambientación virtual nunca elimina ni disimula defectos estructurales.',
      ),
    ).toBeVisible();
  });

  test('el amoblamiento virtual lleva su propia etiqueta', async ({ page }) => {
    await page.goto('/wasi-ai');
    await expect(page.getByText(/Amoblamiento virtual — imagen referencial/)).toBeVisible();
  });
});

test.describe('en móvil', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('las reglas de las fotos se leen igual', async ({ page }) => {
    await page.goto('/wasi-ai');
    await expect(page.getByText(/Amoblamiento virtual — imagen referencial/)).toBeVisible();
  });
});
