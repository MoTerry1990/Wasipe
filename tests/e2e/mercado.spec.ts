import { test, expect } from '@playwright/test';

/**
 * Inteligencia de mercado en el navegador.
 *
 * Sin Supabase no hay índice, así que lo que se comprueba es lo que ve
 * cualquiera en ese caso: que la página explica por qué no hay cifras en
 * vez de mostrar ceros, y que el aviso legal está siempre.
 */

test.describe('el índice de precio por m²', () => {
  test('sin datos explica por qué, en vez de mostrar ceros', async ({ page }) => {
    await page.goto('/precio-m2');
    await expect(
      page.getByText(/Todavía no hay distritos con datos suficientes/i),
    ).toBeVisible();
    await expect(page.getByText(/al menos 5 avisos activos/i)).toBeVisible();
  });

  test('lleva el aviso legal que pide la ley y el producto', async ({ page }) => {
    await page.goto('/precio-m2');
    await expect(
      page.getByText(
        'Esta es una estimación informativa y no reemplaza una tasación profesional.',
      ),
    ).toBeVisible();
  });

  test('se puede alternar entre venta y alquiler', async ({ page }) => {
    await page.goto('/precio-m2');
    await expect(page.getByRole('link', { name: 'Venta', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Alquiler', exact: true })).toBeVisible();
  });

  test('y entre los cuatro períodos', async ({ page }) => {
    await page.goto('/precio-m2');
    for (const periodo of [
      'Últimos 3 meses',
      'Últimos 6 meses',
      'Último año',
      'Todo el historial',
    ]) {
      await expect(page.getByRole('link', { name: periodo })).toBeVisible();
    }
  });

  test('explica qué avisos entran y cuáles no', async ({ page }) => {
    await page.goto('/precio-m2');
    await expect(
      page.getByText(/no entran los rechazados, pausados, vencidos ni vendidos/i),
    ).toBeVisible();
  });
});

test.describe('el recálculo es de administración', () => {
  test('sin sesión no se entra', async ({ page }) => {
    await page.goto('/panel/moderacion/mercado');
    await expect(page).toHaveURL(/\/ingresar/);
  });
});

test.describe('en móvil', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('el aviso legal se lee igual', async ({ page }) => {
    await page.goto('/precio-m2');
    await expect(
      page.getByText(
        'Esta es una estimación informativa y no reemplaza una tasación profesional.',
      ),
    ).toBeVisible();
  });
});
