import { test, expect } from '@playwright/test';

/**
 * El mapa dibuja calles, alfileres encima, y los alfileres llevan a algún
 * lado.
 *
 * Existe por lo que costaron los sprints 23D y 23E. Primero la
 * cartografía se integró y el mapa se veía perfecto **sin un solo
 * marcador**: build, lint y 926 pruebas en verde, y nada que lo mirara.
 * Después, con los marcadores puestos, resultó que **todos enlazaban a
 * una ruta que no existe** —`/aviso/<id>`, cuando la ficha vive en
 * `/propiedad/[aviso]`— y llevaba así desde que el mapa existe.
 *
 * Las dos veces el fallo fue el mismo: comprobar una mitad y dar la otra
 * por hecha. Por eso acá se comprueban las tres por separado.
 */
test.describe('el mapa de resultados', () => {
  for (const [nombre, ancho, alto] of [
    ['escritorio', 1280, 800],
    ['móvil', 390, 844],
  ] as const) {
    test(`dibuja calles y marcadores en ${nombre}`, async ({ page }) => {
      const teselas: string[] = [];
      page.on('request', (r) => {
        if (/openfreemap/.test(r.url())) teselas.push(r.url());
      });

      await page.setViewportSize({ width: ancho, height: alto });
      await page.goto('/comprar?vista=mapa');

      await page.waitForSelector('canvas.maplibregl-canvas', { timeout: 20_000 });
      await page.waitForTimeout(4000);

      const estado = await page.evaluate(() => {
        const lienzo = document.querySelector('canvas.maplibregl-canvas') as HTMLCanvasElement;
        const atrib = document.querySelector('.maplibregl-ctrl-attrib') as HTMLElement | null;
        return {
          ancho: lienzo?.width ?? 0,
          marcadores: document.querySelectorAll('a[href^="/propiedad/"]').length,
          grupos: document.querySelectorAll('button.bg-turquesa').length,
          atribucion: atrib?.innerText ?? '',
        };
      });

      // El lienzo existe y tiene tamaño real.
      expect(estado.ancho).toBeGreaterThan(0);

      // Las teselas se piden de verdad: si el proveedor cae o cambia la
      // dirección, el mapa queda gris y todo lo demás sigue en verde.
      expect(teselas.length).toBeGreaterThan(0);

      // Y hay algo dibujado encima.
      expect(estado.marcadores + estado.grupos).toBeGreaterThan(0);

      // Créditos de quien puso los datos. No es estética: el estilo de
      // OpenFreeMap no los declara y usarlos sin acreditar no se puede.
      expect(estado.atribucion).toContain('OpenStreetMap');
    });
  }

  test('el enlace de un marcador lleva a la ficha del aviso', async ({ page }) => {
    await page.goto('/comprar?vista=mapa');
    await page.waitForSelector('canvas.maplibregl-canvas', { timeout: 20_000 });
    await page.waitForTimeout(4000);

    const marcador = page.locator('a[href^="/propiedad/"]').first();
    await expect(marcador).toHaveCount(1);

    const destino = await marcador.getAttribute('href');
    expect(destino).toBeTruthy();

    // Que el `href` empiece por `/propiedad/` no alcanza: lo que hay que
    // saber es si esa dirección resuelve. La anterior también «parecía»
    // una ruta.
    const respuesta = await page.goto(destino!);
    expect(respuesta?.status()).toBe(200);

    // Y que sea la ficha, no la página de «no existe», que también
    // responde 200 en Next.
    await expect(page.locator('h1')).not.toHaveText('Esta página no existe');
    await expect(page.locator('h1')).toBeVisible();
  });
});
