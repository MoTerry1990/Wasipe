import { test, expect } from '@playwright/test';

/**
 * Asistente de publicación.
 *
 * Sin Supabase conectado no hay sesión posible, así que /publicar
 * redirige a ingresar. Eso es exactamente lo que hay que comprobar: el
 * asistente es una ruta privada y nadie llega a él sin cuenta.
 */

test.describe('quién entra al asistente', () => {
  test('sin sesión no se llega a publicar', async ({ page }) => {
    await page.goto('/publicar');
    await expect(page).toHaveURL(/\/ingresar/);
    expect(new URL(page.url()).searchParams.get('volver')).toBe('/publicar');
  });

  test('tampoco con un borrador en la dirección', async ({ page }) => {
    await page.goto('/publicar?borrador=c0000001-0000-4000-8000-000000000001');
    await expect(page).toHaveURL(/\/ingresar/);
  });

  test('el panel de propiedades tampoco', async ({ page }) => {
    await page.goto('/panel/mis-propiedades');
    await expect(page).toHaveURL(/\/ingresar/);
  });
});

test.describe('el camino a publicar', () => {
  test('la portada invita a publicar gratis', async ({ page }) => {
    await page.goto('/');
    const boton = page.getByRole('link', { name: 'Publicar mi propiedad' }).last();
    await expect(boton).toBeVisible();
    await expect(boton).toHaveAttribute('href', '/publicar');
  });

  test('desde el pie también se llega', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('navigation', { name: 'Publicar' }).getByRole('link', {
        name: 'Publicar gratis',
      }),
    ).toBeVisible();
  });

  test('quien no tiene cuenta va a ingresar y vuelve a publicar', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Publicar mi propiedad' }).last().click();

    await expect(page).toHaveURL(/\/ingresar\?volver=%2Fpublicar/);
    // El formulario de ingreso guarda a dónde quería ir.
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  });
});

test.describe('en móvil', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('publicar sigue siendo privado', async ({ page }) => {
    await page.goto('/publicar');
    await expect(page).toHaveURL(/\/ingresar/);
  });
});
