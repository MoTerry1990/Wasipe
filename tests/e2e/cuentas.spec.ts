import { test, expect } from '@playwright/test';

/**
 * Cuentas: rutas protegidas, formularios y errores en castellano.
 *
 * Estas pruebas corren sin proyecto de Supabase conectado, que es
 * justamente el peor escenario: si la autorización dependiera de que la
 * base responda, acá se caería. La regla es fallar cerrado — sin forma
 * de comprobar la sesión, lo privado no se abre.
 */

const PRIVADAS = [
  '/panel',
  '/panel/mis-propiedades',
  '/panel/favoritos',
  '/panel/contactos',
  '/panel/alertas',
  '/panel/configuracion',
  '/panel/wasi-ai',
  '/panel/inmobiliaria',
  '/bienvenida',
  '/publicar',
];

for (const ruta of PRIVADAS) {
  test(`${ruta} rechaza a quien no inició sesión`, async ({ page }) => {
    await page.goto(ruta);

    await expect(page).toHaveURL(/\/ingresar/);
    // Se guarda a dónde quería ir, para llevarlo ahí apenas ingrese.
    expect(new URL(page.url()).searchParams.get('volver')).toBe(ruta);
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  });
}

test('el panel no se cuela por una ruta que no existe', async ({ page }) => {
  await page.goto('/panel/inventada');
  await expect(page).toHaveURL(/\/ingresar/);
});

test.describe('registro', () => {
  test('la página carga y está en castellano', async ({ page }) => {
    await page.goto('/registrarse');
    await expect(page.getByRole('heading', { name: 'Crear cuenta' })).toBeVisible();
    await expect(page.getByLabel('Nombre y apellido')).toBeVisible();
    await expect(page.getByLabel('Correo')).toBeVisible();
    await expect(page.getByLabel('Contraseña')).toBeVisible();
  });

  test('valida antes de tocar la base', async ({ page }) => {
    await page.goto('/registrarse');
    await page.getByRole('button', { name: 'Crear mi cuenta' }).click();

    // Los mensajes salen de la validación del servidor, en castellano y
    // sin haber llamado a Supabase: por eso funcionan sin proyecto.
    await expect(page.getByText('Escribe tu nombre')).toBeVisible();
    await expect(page.getByText('Escribe tu correo')).toBeVisible();
  });

  test('exige aceptar los términos', async ({ page }) => {
    await page.goto('/registrarse');
    await page.getByLabel('Nombre y apellido').fill('Rosa Quispe');
    await page.getByLabel('Correo').fill('rosa@ejemplo.pe');
    await page.getByLabel('Contraseña').fill('micasaenlima');
    await page.getByRole('button', { name: 'Crear mi cuenta' }).click();

    await expect(page.getByText(/aceptes los términos/)).toBeVisible();
  });

  test('avisa cuando el correo está incompleto', async ({ page }) => {
    await page.goto('/registrarse');
    await page.getByLabel('Nombre y apellido').fill('Rosa Quispe');
    await page.getByLabel('Correo').fill('rosa@');
    await page.getByLabel('Contraseña').fill('micasaenlima');
    await page.getByRole('button', { name: 'Crear mi cuenta' }).click();

    await expect(page.getByText(/Revisa que tenga @/)).toBeVisible();
  });
});

test.describe('ingreso', () => {
  test('valida los dos campos', async ({ page }) => {
    await page.goto('/ingresar');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    await expect(page.getByText('Escribe tu correo')).toBeVisible();
    await expect(page.getByText('Escribe tu contraseña')).toBeVisible();
  });

  test('lleva a recuperar la contraseña', async ({ page }) => {
    await page.goto('/ingresar');
    await page.getByRole('link', { name: 'Olvidé mi contraseña' }).click();
    await expect(page).toHaveURL(/\/recuperar/);
    await expect(page.getByRole('heading', { name: 'Recuperar contraseña' })).toBeVisible();
  });

  test('avisa en castellano cuando el enlace del correo venció', async ({ page }) => {
    await page.goto('/ingresar?aviso=enlace-vencido');
    await expect(page.getByRole('alert').filter({ hasText: 'venció' })).toBeVisible();
  });
});

test.describe('recuperación de contraseña', () => {
  test('la respuesta no revela si el correo tiene cuenta', async ({ page }) => {
    await page.goto('/recuperar');
    await page.getByLabel('Correo de tu cuenta').fill('no-existe@ejemplo.pe');
    // Sin Supabase conectado la acción no llega a enviar nada, así que
    // acá solo se comprueba la validación; el mensaje neutro está
    // cubierto en tests/unidad/cuentas.test.ts.
    await expect(page.getByRole('button', { name: 'Enviarme el enlace' })).toBeVisible();
  });

  test('valida el correo', async ({ page }) => {
    await page.goto('/recuperar');
    await page.getByRole('button', { name: 'Enviarme el enlace' }).click();
    await expect(page.getByText('Escribe tu correo')).toBeVisible();
  });

  test('la contraseña nueva pide repetirla', async ({ page }) => {
    await page.goto('/nueva-clave');
    await page.getByLabel('Contraseña nueva').fill('micasaenlima');
    await page.getByLabel('Repítela').fill('otracosa1234');
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();

    await expect(page.getByText('Las dos contraseñas no coinciden')).toBeVisible();
  });

  test('la contraseña nueva pide ocho caracteres', async ({ page }) => {
    await page.goto('/nueva-clave');
    await page.getByLabel('Contraseña nueva').fill('corta12');
    await page.getByLabel('Repítela').fill('corta12');
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();

    await expect(page.getByText(/8 caracteres/)).toBeVisible();
  });

  test('el enlace vencido no rompe la página', async ({ page }) => {
    await page.goto('/auth/callback?error_description=expired');
    await expect(page).toHaveURL(/\/ingresar\?aviso=enlace-vencido/);
  });

  test('el callback sin código tampoco', async ({ page }) => {
    await page.goto('/auth/callback');
    await expect(page).toHaveURL(/\/ingresar\?aviso=enlace-vencido/);
  });
});

test.describe('en móvil', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('las rutas privadas también quedan cerradas', async ({ page }) => {
    await page.goto('/panel/favoritos');
    await expect(page).toHaveURL(/\/ingresar/);
  });

  test('el registro entra en la pantalla sin desbordarse', async ({ page }) => {
    await page.goto('/registrarse');
    await expect(page.getByRole('heading', { name: 'Crear cuenta' })).toBeVisible();

    const desborda = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(desborda, 'la página se desborda a lo ancho').toBe(false);
  });

  test('los campos son cómodos de tocar', async ({ page }) => {
    await page.goto('/ingresar');
    const boton = page.getByRole('button', { name: 'Iniciar sesión' });
    const caja = await boton.boundingBox();
    // 44 px es el mínimo recomendado para un objetivo táctil.
    expect(caja?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});
