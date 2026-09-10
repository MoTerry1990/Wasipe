import { test, expect } from '@playwright/test';

/**
 * El panel de proyectos, desde afuera.
 *
 * La suite de navegador corre **sin sesión**, así que lo que se puede
 * comprobar acá no es el flujo de edición —eso vive en las pruebas de
 * unidad y en las de base— sino dos cosas que solo se ven desde afuera:
 * que el panel no se abra sin sesión, y que un borrador no se escape a
 * ninguna superficie pública.
 *
 * Lo digo explícito para que nadie lea este archivo y crea que el flujo
 * completo está cubierto por navegador. No lo está.
 */

test.describe('el panel de proyectos no se abre sin sesión', () => {
  for (const ruta of ['/panel/proyectos', '/panel/proyectos/nuevo', '/panel/proyectos/PRY-000001']) {
    test(`${ruta} manda a iniciar sesión`, async ({ page }) => {
      await page.goto(ruta);
      // No importa por qué camino: lo que no puede pasar es quedarse en
      // la ruta del panel mostrando algo.
      await expect(page).toHaveURL(/\/ingresar/);
    });
  }
});

test.describe('un borrador no se escapa por ninguna puerta pública', () => {
  test('la búsqueda de proyectos no muestra nada que no esté publicado', async ({ page }) => {
    const respuesta = await page.goto('/proyectos');
    expect(respuesta?.status()).toBe(200);

    // Los códigos de proyecto son `PRY-######`. Que aparezca uno en una
    // página pública significaría que algo salió de la base sin estar
    // publicado, porque hoy no hay ninguno publicado.
    const html = (await respuesta?.text()) ?? '';
    expect(html).not.toMatch(/PRY-\d{6}/);
  });

  test('el sitemap no lleva proyectos todavía', async ({ request }) => {
    // Las páginas públicas de proyecto llegan en 25E. Hasta entonces, que
    // el sitemap las anuncie sería ofrecerle a Google una dirección que
    // no existe.
    const cuerpo = await (await request.get('/sitemap.xml')).text();
    expect(cuerpo).not.toContain('/proyecto/');
  });

  test('una ficha pública de proyecto todavía no existe', async ({ page }) => {
    const r = await page.goto('/proyecto/lo-que-sea');
    expect(r?.status()).toBe(404);
  });
});

test.describe('sin desborde a lo ancho', () => {
  for (const ancho of [390, 360, 320]) {
    test(`la búsqueda de proyectos entra en ${ancho} px`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: 780 });
      await page.goto('/proyectos');
      await page.waitForLoadState('domcontentloaded');

      const m = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        cliente: document.documentElement.clientWidth,
      }));

      expect(
        m.scroll,
        `/proyectos a ${ancho} px desborda: ${m.scroll} > ${m.cliente}`,
      ).toBeLessThanOrEqual(m.cliente + 1);
    });
  }
});
