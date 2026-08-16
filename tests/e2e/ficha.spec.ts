import { test, expect } from '@playwright/test';

/**
 * Ficha del aviso.
 *
 * Sin Supabase conectado no hay avisos que mostrar, así que la ficha
 * responde 404. Lo que sí se puede comprobar —y es lo que más importa—
 * es que la dirección se arme y se lea bien, y que el resto del sitio
 * apunte a ella.
 */

test.describe('dirección de la ficha', () => {
  /*
   * Se comprueba lo que ve la persona y no el código HTTP.
   *
   * Next 16 transmite la respuesta en partes: para cuando el componente
   * puede llamar a notFound(), ya salió un 200. Lo verificamos con curl
   * en el Sprint 6 y quedó anotado como límite del framework. Lo que sí
   * está garantizado es que se muestra la página de "no encontrado" y no
   * un listado cualquiera ni una pantalla en blanco.
   */
  test('una dirección sin código muestra la página de no encontrado', async ({ page }) => {
    await page.goto('/propiedad/departamento-en-miraflores');
    await expect(page.getByText(/no encontramos|no existe/i)).toBeVisible();
  });

  test('un código que no corresponde a ningún aviso, tampoco', async ({ page }) => {
    await page.goto('/propiedad/departamento-en-venta-miraflores-wsp-999999');
    await expect(page.getByText(/no encontramos|no existe/i)).toBeVisible();
  });

  test('la página de no encontrado está en castellano', async ({ page }) => {
    await page.goto('/propiedad/wsp-999999');
    const texto = (await page.locator('body').innerText()).toLowerCase();
    for (const palabra of ['not found', 'error', 'page']) {
      expect(texto, `aparece "${palabra}"`).not.toContain(palabra);
    }
  });
});

test.describe('privacidad', () => {
  test('ninguna página pública trae un celular peruano en el código fuente', async ({
    request,
  }) => {
    // El teléfono de quien publica sale por una acción del servidor, no
    // en el HTML. Si algún día se filtra, esto lo detecta.
    for (const ruta of ['/', '/comprar', '/alquilar', '/proyectos']) {
      const respuesta = await request.get(ruta);
      const html = await respuesta.text();

      // Nueve dígitos que empiezan en 9, sueltos en el texto.
      const encontrados = html.match(/(?<!\d)9\d{8}(?!\d)/g) ?? [];
      expect(encontrados, `${ruta} trae lo que parece un celular`).toEqual([]);
    }
  });

  test('el robots deja fuera lo privado', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('/panel');
    expect(robots).toContain('/ingresar');
  });
});

test.describe('la ficha está enlazada desde el resto del sitio', () => {
  test('los enlaces a propiedades usan el formato con código', async ({ page }) => {
    await page.goto('/comprar');

    // Sin datos no hay tarjetas; lo que se comprueba es que ninguna ruta
    // vieja del tipo /aviso/<uuid> haya quedado dando vueltas.
    const viejos = await page
      .locator('a[href^="/aviso/"]')
      .evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    expect(viejos).toEqual([]);
  });
});
