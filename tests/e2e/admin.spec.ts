import { test, expect } from '@playwright/test';

/**
 * Administración en el navegador.
 *
 * Sin sesión no hay forma de llegar a ninguna de estas pantallas, y eso
 * es exactamente lo que se comprueba: la primera promesa del sprint es
 * que quien no es del equipo no llega a los datos.
 */

const PANTALLAS = [
  '/panel/admin',
  '/panel/admin/avisos',
  '/panel/admin/banderas',
  '/panel/admin/usuarios',
  '/panel/admin/inmobiliarias',
  '/panel/admin/denuncias',
  '/panel/moderacion/imagenes',
  '/panel/moderacion/mercado',
];

test.describe('nadie llega a administración sin sesión', () => {
  for (const ruta of PANTALLAS) {
    test(`${ruta} manda a ingresar`, async ({ page }) => {
      await page.goto(ruta);
      await expect(page).toHaveURL(/\/ingresar/);
    });
  }
});

test.describe('ni con la dirección escrita a mano', () => {
  test('un identificador inventado tampoco abre nada', async ({ page }) => {
    await page.goto('/panel/admin/usuarios?q=%27%20or%201%3D1--');
    await expect(page).toHaveURL(/\/ingresar/);
  });
});

test.describe('en móvil', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('administración sigue siendo privada', async ({ page }) => {
    await page.goto('/panel/admin');
    await expect(page).toHaveURL(/\/ingresar/);
  });
});
