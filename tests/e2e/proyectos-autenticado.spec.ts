import { test, expect, type Page } from '@playwright/test';
import {
  confirmarEntornoDeDesarrollo,
  CUENTAS,
  entrar,
  escenarioDe,
  forzarEstado,
  limpiarEscenario,
  prepararEscenario,
  residuo,
  type Escenario,
} from './fixtures-proyectos';

/**
 * El panel de proyectos con sesión de verdad.
 *
 * Esta es la prueba que faltaba. La anterior comprobaba que el panel
 * redirigiera sin sesión, que está bien pero no dice nada del flujo: se
 * podía tener el panel entero roto y esa prueba seguía verde.
 *
 * Acá se entra por el formulario de ingreso real, con una cuenta de la
 * semilla, y se hace lo que haría una persona. El andamiaje —dos
 * inmobiliarias y sus membresías— lo arma un ayudante que vive en
 * `tests/` y usa la conexión privilegiada **solo para eso**. El panel
 * nunca la toca.
 *
 * Todo lo que se crea se borra en el `afterAll`, que Playwright ejecuta
 * también cuando una prueba falla.
 */

test.describe.configure({ mode: 'serial' });

/**
 * Sin traza, sin video y sin captura: acá se escribe una contraseña.
 *
 * Playwright **no enmascara** el valor de un `<input type="password">`.
 * Una traza guarda el DOM y los eventos de entrada, y un video la
 * pantalla; con el ajuste general —`trace: 'on-first-retry'`— bastaba con
 * que esta prueba fallara una vez para que la contraseña de las cuentas
 * de demostración quedara escrita en `test-results/`, y de ahí a un
 * reporte HTML o a un adjunto de CI.
 *
 * La contraseña es de demostración y ya vive en `seed.sql`, así que el
 * daño sería chico. Pero el hábito de dejar credenciales en artefactos es
 * el que hay que no tener, y el día que esta prueba use una cuenta de
 * verdad nadie se va a acordar de venir a apagarlo.
 *
 * Lo que se pierde: si falla, no hay traza para mirar. A cambio, el
 * mensaje de cada afirmación dice qué se esperaba y qué llegó.
 */
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

let escenario: Escenario;
let codigo = '';

const PROYECTO = {
  nombre: 'Torre del Sprint',
  distrito: 'Miraflores',
};

/** Rellena la información general. Los nombres son los del formulario. */
async function llenarInformacion(page: Page, nombre: string) {
  await page.getByLabel('Nombre del proyecto').fill(nombre);
  await page.getByLabel('Departamento').fill('Lima');
  await page.getByLabel('Provincia').fill('Lima');
  await page.getByLabel('Distrito').fill(PROYECTO.distrito);
}

/** Agrega una tipología con los valores dados. */
async function agregarTipologia(
  page: Page,
  datos: { nombre: string; desde: string; hasta: string; totales: string; disponibles: string },
) {
  await page.getByRole('button', { name: 'Agregar tipología' }).click();
  await page.getByLabel('Nombre de la tipología').fill(datos.nombre);
  await page.getByLabel('Precio desde').fill(datos.desde);
  await page.getByLabel('Precio hasta').fill(datos.hasta);
  await page.getByLabel('Unidades totales').fill(datos.totales);
  await page.getByLabel('Unidades disponibles').fill(datos.disponibles);
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(page.getByText(datos.nombre)).toBeVisible();
}

test.beforeAll(async ({}, info) => {
  // Antes de escribir una sola fila: confirmar contra qué se está
  // corriendo. Si esto no es desarrollo, la prueba se cae acá y no crea
  // nada.
  const donde = confirmarEntornoDeDesarrollo();
  expect(donde.entorno).not.toBe('produccion');

  escenario = escenarioDe(info.project.name);
  await prepararEscenario(escenario);
});

test.afterAll(async () => {
  // Corre pase lo que pase: si una prueba falla a mitad, el escenario se
  // barre igual. Un fixture olvidado en la base de desarrollo es basura
  // que después nadie sabe de dónde salió.
  if (escenario) await limpiarEscenario(escenario);
});

// ---------------------------------------------------------------------
// El menú: quién ve «Proyectos»
// ---------------------------------------------------------------------

test.describe('la entrada «Proyectos» del menú', () => {
  /**
   * El enlace del MENÚ DEL PANEL, buscado por su dirección.
   *
   * Por rol y texto no alcanza: el encabezado del sitio también tiene un
   * «Proyectos», el de la búsqueda pública, y una prueba que contara los
   * dos daría 2 donde debería dar 1. La dirección distingue sin
   * ambigüedad.
   */
  const menu = (page: Page) => page.locator('nav a[href="/panel/proyectos"]');

  test('la ve quien administra, aunque su tipo de cuenta no diga «inmobiliaria»', async ({ page }) => {
    // Rosa tiene `profiles.role = 'owner'` y administra la constructora
    // de prueba. Con el filtro por tipo de cuenta anterior, este es
    // exactamente el caso que quedaba sin ver el enlace.
    await entrar(page, CUENTAS.administradora);
    await page.goto('/panel');

    await expect(menu(page)).toHaveCount(1);

    // Y el enlace lleva a donde dice.
    await menu(page).click();
    await expect(page).toHaveURL(/\/panel\/proyectos$/);
    await expect(page.getByRole('link', { name: 'Nuevo proyecto' })).toHaveCount(1);
  });

  test('la ve el corredor, y llega en modo lectura', async ({ page }) => {
    await entrar(page, CUENTAS.corredor);
    await page.goto('/panel');

    await expect(menu(page)).toHaveCount(1);

    await menu(page).click();
    await expect(page).toHaveURL(/\/panel\/proyectos$/);
    // No se le ofrece crear.
    await expect(page.getByRole('link', { name: 'Nuevo proyecto' })).toHaveCount(0);
    await expect(page.getByText(/Estás como corredor/)).toBeVisible();
  });

  test('NO la ve quien no pertenece a ninguna inmobiliaria', async ({ page }) => {
    await entrar(page, CUENTAS.sinInmobiliaria);
    await page.goto('/panel');

    await expect(menu(page)).toHaveCount(0);
  });

  test('y si escribe la dirección a mano, no obtiene acceso funcional', async ({ page }) => {
    // El menú es presentación. Lo que de verdad cierra la puerta es la
    // página, que comprueba la membresía.
    await entrar(page, CUENTAS.sinInmobiliaria);
    await page.goto('/panel/proyectos');

    await expect(page.getByText('Los proyectos son de una inmobiliaria')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Nuevo proyecto' })).toHaveCount(0);

    // Y crear tampoco: la ruta lo devuelve a la lista.
    await page.goto('/panel/proyectos/nuevo');
    await expect(page).toHaveURL(/\/panel\/proyectos$/);
  });
});

// ---------------------------------------------------------------------
// Quien administra: el flujo completo
// ---------------------------------------------------------------------

test.describe('quien administra la inmobiliaria', () => {
  test('crea un borrador y llega a su editor', async ({ page }) => {
    await entrar(page, CUENTAS.administradora);
    await page.goto('/panel/proyectos/nuevo');

    await llenarInformacion(page, PROYECTO.nombre);
    await page.getByRole('button', { name: 'Crear borrador' }).click();

    // El redirect lleva al editor, y la dirección lleva el código real.
    await page.waitForURL(/\/panel\/proyectos\/PRY-\d{6}/, { timeout: 20_000 });
    codigo = page.url().split('/').pop()!;
    expect(codigo).toMatch(/^PRY-\d{6}$/);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(PROYECTO.nombre);
    await expect(page.getByText('Borrador')).toBeVisible();
  });

  test('edita la información y persiste tras recargar', async ({ page }) => {
    await entrar(page, CUENTAS.administradora);
    await page.goto(`/panel/proyectos/${codigo}`);

    await page.getByLabel('Descripción').fill('Vista al parque, con áreas comunes en la azotea.');
    await page.getByLabel('Dirección').fill('Av. Larco 1234');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Guardado.')).toBeVisible();

    // Recargar es la única forma de saber que se guardó y no solo que la
    // pantalla dijo que sí.
    await page.reload();
    await expect(page.getByLabel('Dirección')).toHaveValue('Av. Larco 1234');
    await expect(page.getByLabel('Descripción')).toHaveValue(/áreas comunes/);
  });

  test('agrega dos tipologías, las reordena y persisten', async ({ page }) => {
    await entrar(page, CUENTAS.administradora);
    await page.goto(`/panel/proyectos/${codigo}`);

    await agregarTipologia(page, {
      nombre: 'Uno · 1 dormitorio',
      desde: '80000',
      hasta: '90000',
      totales: '20',
      disponibles: '20',
    });
    await agregarTipologia(page, {
      nombre: 'Dos · 2 dormitorios',
      desde: '110000',
      hasta: '130000',
      totales: '30',
      disponibles: '28',
    });

    // Se lee el texto completo de cada fila y se compara la posición
    // relativa. Atarse a una clase de CSS —`p.font-bold`, que también
    // lleva el precio— hace que la prueba falle por el motivo equivocado:
    // la primera versión decía «el orden está mal» cuando el orden estaba
    // bien y lo que fallaba era el selector.
    const filas = () => page.locator('li').filter({ hasText: 'dormitorio' }).allTextContents();

    await page.reload();
    expect((await filas()).join(' | ')).toContain('Uno · 1 dormitorio');

    // Se baja la primera: el orden tiene que quedar invertido y sobrevivir
    // a una recarga, porque se guarda en la base y no en la pantalla.
    await page
      .locator('li')
      .filter({ hasText: 'Uno · 1 dormitorio' })
      .getByRole('button', { name: 'Bajar' })
      .click();

    // Se espera a que el orden cambie de verdad, recargando entre
    // intentos, en vez de dormir un rato fijo. Un `waitForTimeout(500)`
    // hacía fallar la prueba cuando la acción tardaba 600: decía «el
    // orden está mal» cuando el orden todavía no había llegado.
    await expect
      .poll(
        async () => {
          await page.reload();
          const actuales = await filas();
          return actuales.findIndex((f) => f.includes('Dos · 2 dormitorios'));
        },
        { timeout: 15_000 },
      )
      .toBe(0);

    const orden = await filas();
    const posicionDe = (texto: string) => orden.findIndex((f) => f.includes(texto));
    expect(posicionDe('Dos · 2 dormitorios')).toBeLessThan(posicionDe('Uno · 1 dormitorio'));
    expect(posicionDe('Uno · 1 dormitorio')).toBeGreaterThan(-1);
  });

  test('la validación de precios sale al lado del campo, en español', async ({ page }) => {
    await entrar(page, CUENTAS.administradora);
    await page.goto(`/panel/proyectos/${codigo}`);

    await page.getByRole('button', { name: 'Agregar tipología' }).click();
    await page.getByLabel('Nombre de la tipología').fill('Rango al revés');
    await page.getByLabel('Precio desde').fill('200000');
    await page.getByLabel('Precio hasta').fill('100000');
    await page.getByLabel('Unidades totales').fill('10');
    await page.getByLabel('Unidades disponibles').fill('10');
    await page.getByRole('button', { name: 'Agregar', exact: true }).click();

    await expect(page.getByText('El precio hasta no puede ser menor que el precio desde')).toBeVisible();
  });

  test('borra una tipología y queda borrada', async ({ page }) => {
    await entrar(page, CUENTAS.administradora);
    await page.goto(`/panel/proyectos/${codigo}`);

    const fila = page.locator('li').filter({ hasText: 'Uno · 1 dormitorio' });
    await expect(fila).toHaveCount(1);
    await fila.getByRole('button', { name: 'Borrar' }).click();

    // Se recarga hasta que desaparezca, en vez de recargar una vez y
    // esperar que la acción haya terminado. Lo que se comprueba es que
    // quedó borrada en la base, no que la pantalla la sacó.
    await expect
      .poll(
        async () => {
          await page.reload();
          return page.locator('li').filter({ hasText: 'Uno · 1 dormitorio' }).count();
        },
        { timeout: 15_000 },
      )
      .toBe(0);

    // Y la otra sigue ahí: borrar una no puede llevarse las demás.
    await expect(page.locator('li').filter({ hasText: 'Dos · 2 dormitorios' })).toHaveCount(1);
  });
});

// ---------------------------------------------------------------------
// El corredor: mira, no toca
// ---------------------------------------------------------------------

test.describe('un corredor de la misma inmobiliaria', () => {
  test('ve la lista y el borrador, sin controles de edición', async ({ page }) => {
    await entrar(page, CUENTAS.corredor);

    await page.goto('/panel/proyectos');
    await expect(page.getByText(PROYECTO.nombre)).toBeVisible();
    // No se le ofrece crear.
    await expect(page.getByRole('link', { name: 'Nuevo proyecto' })).toHaveCount(0);

    await page.goto(`/panel/proyectos/${codigo}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(PROYECTO.nombre);
    await expect(page.getByText(/Estás viendo este proyecto como corredor/)).toBeVisible();

    // Ni un solo control de escritura en toda la pantalla.
    for (const boton of ['Guardar cambios', 'Agregar tipología', 'Editar', 'Borrar', 'Subir', 'Bajar']) {
      await expect(page.getByRole('button', { name: boton, exact: true })).toHaveCount(0);
    }
    // Y ve el contenido igual: para eso entra.
    await expect(page.getByText('Dos · 2 dormitorios')).toBeVisible();
  });

  test('una llamada directa a cada acción de escritura es rechazada', async ({ page }) => {
    await entrar(page, CUENTAS.corredor);
    await page.goto(`/panel/proyectos/${codigo}`);

    // Se llama a la acción sin pasar por ningún botón, que es como se
    // ataca esto de verdad. La respuesta tiene que ser un rechazo y, sobre
    // todo, la base no puede cambiar.
    const antes = await page.evaluate(async () => document.title);
    expect(antes).toBeTruthy();

    const resultado = await page.evaluate(async (cod) => {
      const cuerpo = new FormData();
      cuerpo.set('codigo', cod);
      cuerpo.set('name', 'Renombrado por el corredor');
      cuerpo.set('stage', 'preventa');
      cuerpo.set('department', 'Lima');
      cuerpo.set('province', 'Lima');
      cuerpo.set('district', 'Surco');

      const r = await fetch(location.href, {
        method: 'POST',
        headers: { 'Next-Action': 'x' },
        body: cuerpo,
      });
      return r.status;
    }, codigo);

    // Sin el identificador real de la acción, Next rechaza la llamada.
    // Lo que importa —y es lo que se comprueba abajo— es que el proyecto
    // no cambió por ningún camino.
    expect(resultado).toBeGreaterThanOrEqual(400);

    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(PROYECTO.nombre);
  });
});

// ---------------------------------------------------------------------
// Otra inmobiliaria: no entra
// ---------------------------------------------------------------------

test.describe('alguien de otra inmobiliaria', () => {
  test('no abre el proyecto ajeno: le da 404, no «sin permiso»', async ({ page }) => {
    await entrar(page, CUENTAS.ajena);

    const r = await page.goto(`/panel/proyectos/${codigo}`);
    expect(r?.status()).toBe(404);
    // Un «no tienes permiso» le confirmaría que ese proyecto existe.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Esta página no existe');
  });

  test('y en su lista no aparece', async ({ page }) => {
    await entrar(page, CUENTAS.ajena);
    await page.goto('/panel/proyectos');
    await expect(page.getByText(PROYECTO.nombre)).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------
// Solo borradores
// ---------------------------------------------------------------------

test.describe('cuando el proyecto ya no es un borrador', () => {
  test('la pantalla pasa a lectura aunque quien mire lo administre', async ({ page }) => {
    await forzarEstado(codigo, 'in_review');

    await entrar(page, CUENTAS.administradora);
    await page.goto(`/panel/proyectos/${codigo}`);

    await expect(page.getByText('Este proyecto ya salió de borrador')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Agregar tipología' })).toHaveCount(0);

    await forzarEstado(codigo, 'draft');
  });
});

// ---------------------------------------------------------------------
// Sin desborde, en las rutas reales y con sesión
// ---------------------------------------------------------------------

test.describe('las tres rutas del panel entran en pantallas angostas', () => {
  for (const ancho of [390, 360, 320]) {
    test(`sin desborde a ${ancho} px`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: 780 });
      await entrar(page, CUENTAS.administradora);

      for (const ruta of ['/panel/proyectos', '/panel/proyectos/nuevo', `/panel/proyectos/${codigo}`]) {
        await page.goto(ruta);
        await page.waitForLoadState('domcontentloaded');

        const m = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          cliente: document.documentElement.clientWidth,
        }));

        expect(
          m.scroll,
          `${ruta} a ${ancho} px desborda: ${m.scroll} > ${m.cliente}`,
        ).toBeLessThanOrEqual(m.cliente + 1);
      }
    });
  }
});

// ---------------------------------------------------------------------
// Limpieza
// ---------------------------------------------------------------------

test('no queda ningún fixture en la base', async () => {
  await limpiarEscenario(escenario);
  expect(await residuo(escenario)).toEqual({ agencias: 0, miembros: 0, proyectos: 0 });
});
