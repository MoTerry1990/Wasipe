import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accesibilidad, medida y no declarada.
 *
 * axe-core no encuentra todo —ninguna herramienta automática lo hace— y
 * por eso además hay pruebas de teclado escritas a mano acá abajo. Pero
 * lo que sí encuentra son justo los errores que se cuelan sin querer: un
 * `alt` que falta, un contraste que quedó corto, un campo sin etiqueta.
 *
 * El criterio del sprint es «ninguna violación crítica». Acá se exige más
 * que eso: ninguna crítica **y** ninguna seria. Las dos categorías
 * significan que alguien no puede usar la página, no que le cueste.
 */

const PUBLICAS = [
  { ruta: '/', nombre: 'la portada' },
  { ruta: '/comprar', nombre: 'comprar' },
  { ruta: '/comprar/departamento/miraflores', nombre: 'una landing' },
  { ruta: '/alquilar', nombre: 'alquilar' },
  { ruta: '/precio-m2', nombre: 'precio por m²' },
  { ruta: '/busquedas', nombre: 'todas las búsquedas' },
  { ruta: '/wasi-ai', nombre: 'Wasi AI' },
  { ruta: '/publicar', nombre: 'publicar' },
  { ruta: '/ingresar', nombre: 'ingresar' },
  { ruta: '/registrarse', nombre: 'registrarse' },
  { ruta: '/no-existe-esta-pagina', nombre: 'el 404' },
];

async function analizar(page: Page) {
  return new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
}

test.describe('sin violaciones críticas ni serias', () => {
  for (const { ruta, nombre } of PUBLICAS) {
    test(`${nombre} (${ruta})`, async ({ page }) => {
      await page.goto(ruta);
      const resultado = await analizar(page);

      const graves = resultado.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );

      // El mensaje importa: un fallo que solo dice «esperaba 0, recibió 3»
      // obliga a volver a correr todo para saber qué pasó.
      expect(
        graves.map((v) => `${v.impact}: ${v.id} — ${v.nodes.length} elemento(s)`),
        `${nombre}`,
      ).toEqual([]);
    });
  }
});

test.describe('con el teclado solo', () => {
  test('el primer tabulador es «Saltar al contenido», y funciona', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');

    const primero = page.locator(':focus');
    await expect(primero).toHaveText(/Saltar al contenido/);

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#contenido/);
  });

  test('se llega al buscador tabulando, sin tocar el mouse', async ({ page }) => {
    await page.goto('/comprar');
    await page.waitForLoadState('networkidle');

    // Se lee `document.activeElement` y no el selector `:focus`: entre dos
    // pulsaciones el foco pasa un instante por el `body`, y un localizador
    // que no encuentra nada en ese instante hace fallar la prueba por una
    // carrera, no por un problema de accesibilidad.
    const recorrido: string[] = [];
    let llegamos = false;

    for (let i = 0; i < 40 && !llegamos; i++) {
      await page.keyboard.press('Tab');
      const donde = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return el ? el.tagName : 'NADA';
      });
      recorrido.push(donde);
      llegamos = donde === 'INPUT' || donde === 'SELECT';
    }

    expect(llegamos, `recorrido: ${recorrido.join(' → ')}`).toBe(true);
  });

  test('todo lo que tiene foco se ve: hay un contorno', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Los primeros cinco elementos del recorrido: el salto al contenido,
    // la marca y los primeros enlaces del menú. Si alguno no se ve al
    // enfocarse, quien navega con teclado se pierde.
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');

      const contorno = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const estilo = getComputedStyle(el);
        return { ancho: parseFloat(estilo.outlineWidth), estilo: estilo.outlineStyle };
      });

      expect(contorno, `elemento ${i + 1} del recorrido`).not.toBeNull();
      expect(contorno!.estilo).not.toBe('none');
      expect(contorno!.ancho).toBeGreaterThan(0);
    }
  });

  test('los enlaces del pie se alcanzan con Tab', async ({ page }) => {
    await page.goto('/');
    const enlaces = page.locator('footer a');
    const cuantos = await enlaces.count();
    expect(cuantos).toBeGreaterThan(5);

    // Ninguno con tabindex negativo: eso los saca del recorrido.
    for (let i = 0; i < cuantos; i++) {
      await expect(enlaces.nth(i)).not.toHaveAttribute('tabindex', '-1');
    }
  });
});

test.describe('lo que lee un lector de pantalla', () => {
  test('hay un solo h1 por página', async ({ page }) => {
    for (const { ruta } of PUBLICAS.slice(0, 6)) {
      await page.goto(ruta);
      await expect(page.locator('h1'), ruta).toHaveCount(1);
    }
  });

  test('los encabezados no se saltan niveles', async ({ page }) => {
    await page.goto('/');
    const niveles = await page
      .locator('h1, h2, h3, h4')
      .evaluateAll((els) => els.map((el) => Number(el.tagName[1])));

    for (let i = 1; i < niveles.length; i++) {
      // Bajar de golpe (h2 → h4) deja a quien navega por encabezados sin
      // saber si se perdió una sección.
      expect(niveles[i]! - niveles[i - 1]!, `salto en la posición ${i}`).toBeLessThanOrEqual(1);
    }
  });

  test('cada imagen dice qué es, o se declara decorativa', async ({ page }) => {
    await page.goto('/');
    const imagenes = page.locator('img');
    const cuantas = await imagenes.count();

    for (let i = 0; i < cuantas; i++) {
      const alt = await imagenes.nth(i).getAttribute('alt');
      const oculta = await imagenes.nth(i).getAttribute('aria-hidden');
      // `alt=""` es válido y significa «decorativa». Lo que no vale es que
      // el atributo falte: ahí el lector dicta el nombre del archivo.
      expect(alt !== null || oculta === 'true', `imagen ${i}`).toBe(true);
    }
  });

  test('los puntos de referencia de la página están', async ({ page }) => {
    await page.goto('/comprar');
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('footer')).toHaveCount(1);
    // Al menos una zona de navegación visible. No `.first()`: en móvil el
    // menú de escritorio está oculto por diseño y el primero de la lista
    // sería justo ese, así que la prueba fallaría por una decisión de
    // diseño correcta.
    await expect(page.locator('nav:visible').first()).toBeVisible();
  });
});

test.describe('quien pide menos movimiento', () => {
  test('recibe menos movimiento', async ({ page }) => {
    // `emulateMedia` y no la opción del proyecto: la opción se pisa con la
    // configuración de cada proyecto de Playwright, y una prueba que cree
    // estar midiendo con movimiento reducido cuando no lo está es peor que
    // no tenerla.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    expect(
      await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      'la preferencia llegó al navegador',
    ).toBe(true);

    // La regla de globals.css deja todo en 0.01ms. Se comprueba que
    // ninguna transición dure más de un parpadeo, mirando cada tramo por
    // separado: `transition-duration` puede traer varios separados por
    // coma, y quedarse con el primero deja pasar los demás.
    const lentos = await page.evaluate(() =>
      [...document.querySelectorAll('a, button')]
        .map((el) => ({
          duracion: getComputedStyle(el).transitionDuration,
          texto: (el.textContent ?? '').trim().slice(0, 30),
        }))
        .filter((el) => el.duracion.split(',').some((tramo) => parseFloat(tramo) >= 0.05))
        .map((el) => `${el.texto || '(sin texto)'}: ${el.duracion}`),
    );

    expect(lentos).toEqual([]);
  });
});

test.describe('en móvil', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('la portada tampoco tiene violaciones graves', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const resultado = await analizar(page);
    const graves = resultado.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(graves.map((v) => `${v.impact}: ${v.id}`)).toEqual([]);
  });

  test('nada obliga a desplazarse en horizontal', async ({ page }) => {
    // Las cuatro pantallas donde más fácil se cuela un desborde: tablas
    // anchas, tarjetas en grilla y una lista de trescientos enlaces.
    for (const ruta of ['/', '/comprar', '/precio-m2', '/busquedas']) {
      await page.goto(ruta);
      // Hay que esperar a que termine de cargar: medir el ancho a media
      // carga da un desborde que no existe una vez que el diseño asienta.
      await page.waitForLoadState('networkidle');
      const ancho = await page.evaluate(() => ({
        pagina: document.documentElement.scrollWidth,
        ventana: window.innerWidth,
      }));
      expect(ancho.pagina, ruta).toBeLessThanOrEqual(ancho.ventana + 1);
    }
  });
});
