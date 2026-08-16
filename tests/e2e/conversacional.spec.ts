import { test, expect } from '@playwright/test';

/**
 * Búsqueda conversacional y comparación en el navegador.
 *
 * Sin Supabase no hay avisos, así que lo que se comprueba es lo que ve
 * cualquiera: que la caja de texto está, que dice de dónde salen los
 * resultados, y que comparar sin haber elegido nada explica qué hacer en
 * vez de mostrar una tabla vacía.
 */

test.describe('buscar escribiendo', () => {
  test('la caja está en la página de venta', async ({ page }) => {
    await page.goto('/comprar');
    await expect(page.getByLabel('Qué estás buscando')).toBeVisible();
  });

  test('y también en la de alquiler', async ({ page }) => {
    await page.goto('/alquilar');
    await expect(page.getByLabel('Qué estás buscando')).toBeVisible();
  });

  test('dice cómo contarlo', async ({ page }) => {
    await page.goto('/comprar');
    await expect(page.getByText(/como se lo contarías a un corredor/i)).toBeVisible();
  });

  test('el botón no se habilita con la caja vacía', async ({ page }) => {
    await page.goto('/comprar');
    await expect(page.getByRole('button', { name: 'Buscar' }).last()).toBeDisabled();
  });
});

test.describe('comparar', () => {
  test('sin nada elegido, explica qué hacer', async ({ page }) => {
    await page.goto('/comparar');
    await expect(page.getByText(/Todavía no elegiste nada para comparar/i)).toBeVisible();
  });

  test('con códigos inventados no muestra ninguna propiedad', async ({ page }) => {
    await page.goto('/comparar?avisos=WSP-999999,WSP-999998');
    await expect(page.getByRole('table')).toHaveCount(0);
  });

  test('con un solo aviso dice que falta con qué comparar', async ({ page }) => {
    await page.goto('/comparar?avisos=WSP-999999');
    await expect(page.getByRole('table')).toHaveCount(0);
  });

  test('dice cuántas se pueden comparar', async ({ page }) => {
    await page.goto('/comparar');
    await expect(page.getByText(/Hasta 4 a la vez/i)).toBeVisible();
  });
});

test.describe('en móvil', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('la caja de búsqueda se ve', async ({ page }) => {
    await page.goto('/comprar');
    await expect(page.getByLabel('Qué estás buscando')).toBeVisible();
  });
});
