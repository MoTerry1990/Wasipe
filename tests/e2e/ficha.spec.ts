import { test, expect } from '@playwright/test';
import { rastreable } from './robots';

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
      //
      // El borde es hexadecimal y no decimal a propósito. Con `(?<!\d)`
      // esto marcaba `993399033` en TODAS las páginas, y no era un
      // teléfono: era un pedazo del identificador de una acción de
      // servidor de Next —`$ACTION_ID_401b0e993399033da8d76d8c97…`—,
      // rodeado de letras hexadecimales. Un falso positivo constante
      // enseña a ignorar la prueba, que es peor que no tenerla.
      //
      // Un celular de verdad va pegado a espacios, signos o etiquetas,
      // nunca en medio de una tira hexadecimal, así que el borde nuevo
      // no deja pasar ninguno.
      const encontrados = html.match(/(?<![0-9a-fA-F])9\d{8}(?![0-9a-fA-F])/g) ?? [];
      expect(encontrados, `${ruta} trae lo que parece un celular`).toEqual([]);
    }
  });

  test('el robots deja fuera lo privado', async ({ request }) => {
    const cuerpo = await (await request.get('/robots.txt')).text();

    // Sin rama. Antes esto buscaba el texto «/panel» dentro del archivo,
    // que es una manera de preguntar que solo funciona con el contrato de
    // producción: fuera de producción el `Disallow: /` cierra el panel de
    // sobra y la prueba fallaba igual, con la garantía cumplida.
    //
    // Lo que hay que saber no es si aparece una cadena, sino si un robot
    // que respeta el archivo puede pedir esa ruta. Eso es cierto o falso
    // en los dos entornos, así que se pregunta una sola vez.
    for (const privada of ['/panel', '/panel/favoritos', '/ingresar']) {
      expect(rastreable(cuerpo, privada), `${privada} quedó abierta al rastreo`).toBe(false);
    }
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
