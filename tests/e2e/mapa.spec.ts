import { test, expect } from '@playwright/test';

/**
 * El mapa dibuja calles y alfileres encima.
 *
 * Existe por lo que costó el sprint 23D. La cartografía se integró, el
 * build pasó, el lint pasó, las 926 pruebas pasaron, y el mapa se veía
 * perfecto **sin un solo marcador encima**. Nada de lo que corría lo
 * miraba.
 *
 * Por eso esta prueba comprueba las dos mitades por separado, y las dos
 * hacen falta:
 *
 *  · que las teselas se pidan de verdad —si el proveedor cae o cambia la
 *    dirección, el mapa queda gris y todo lo demás sigue en verde—, y
 *  · que quede al menos un marcador o un grupo sobre ellas.
 *
 * Y comprueba la atribución, que no es un detalle estético: el estilo de
 * OpenFreeMap no la declara y usar los datos de OpenStreetMap sin
 * acreditarlos no está permitido.
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
          marcadores: document.querySelectorAll('a[href^="/aviso/"]').length,
          grupos: document.querySelectorAll('button.bg-turquesa').length,
          atribucion: atrib?.innerText ?? '',
        };
      });

      // El lienzo existe y tiene tamaño real.
      expect(estado.ancho).toBeGreaterThan(0);

      // Las teselas se piden de verdad.
      expect(teselas.length).toBeGreaterThan(0);

      // Y hay algo dibujado encima. Esta es la que faltaba.
      expect(estado.marcadores + estado.grupos).toBeGreaterThan(0);

      // Créditos de quien puso los datos.
      expect(estado.atribucion).toContain('OpenStreetMap');
    });
  }
});
