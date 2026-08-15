import { test, expect } from '@playwright/test';

/** El buscador del hero es el flujo principal de la portada. */
test('buscar desde la portada lleva a la ruta de la pestaña elegida', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('tab', { name: 'Alquilar' }).click();
  await page.getByRole('combobox', { name: 'Tipo de propiedad' }).selectOption('casa');
  await page.getByRole('searchbox').or(page.getByRole('textbox')).first().fill('Miraflores');
  await page.getByRole('button', { name: /Buscar/i }).click();

  await expect(page).toHaveURL(/\/alquilar\?.*tipo=casa/);
  await expect(page).toHaveURL(/donde=Miraflores/);
});

test('la pestaña Proyectos ya no queda en un enlace roto (P-06)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Proyectos' }).click();
  await page.getByRole('button', { name: /Buscar/i }).click();
  await expect(page).toHaveURL(/\/proyectos/);
  await expect(page.locator('main')).toBeVisible();
});

test('el ingreso valida los campos antes de llamar a la base', async ({ page }) => {
  await page.goto('/ingresar');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  // La validación corre en el servidor pero antes de tocar Supabase, así
  // que responde en castellano incluso sin proyecto conectado.
  await expect(page.getByText('Escribe tu correo')).toBeVisible();
  await expect(page).toHaveURL(/\/ingresar/);
});

test('desde el ingreso se llega a crear cuenta', async ({ page }) => {
  await page.goto('/ingresar');
  await page.getByRole('link', { name: 'Publica gratis' }).click();
  await expect(page.locator('main')).toBeVisible();
});

test.describe('navegación móvil', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('el menú se abre, navega y se cierra', async ({ page }) => {
    await page.goto('/');

    const abrir = page.getByRole('button', { name: 'Abrir menú' });
    await expect(abrir).toBeVisible();
    await abrir.click();
    await expect(page.getByRole('button', { name: 'Cerrar menú' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await page.locator('#menu-movil').getByRole('link', { name: 'Comprar' }).click();
    await expect(page).toHaveURL(/\/comprar/);
    // Si quedara abierto, taparía la página nueva.
    await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeVisible();
  });

  test('la tecla Escape cierra el menú', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeVisible();
  });
});

test('el primer tabulado ofrece saltar al contenido', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
});
