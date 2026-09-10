import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de extremo a extremo.
 *
 * Se levanta el build de producción, no `next dev`: lo que se prueba tiene
 * que ser lo mismo que llega a Vercel. `reuseExistingServer` evita recompilar
 * en cada corrida local.
 */
const PUERTO = 3100;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'movil',
      use: { ...devices['Pixel 7'] },
      // La prueba autenticada del panel de proyectos corre una sola vez,
      // en escritorio. No es para ahorrar tiempo: crea una inmobiliaria
      // de verdad en la base de desarrollo con las cuentas de la semilla,
      // y dos corridas en paralelo se pelean por las mismas cuentas —una
      // le borra el escenario a la otra a mitad de camino y el fallo
      // aparece en la prueba equivocada—.
      //
      // No se pierde cobertura móvil: esa prueba fija sus propios anchos
      // (390, 360 y 320) con `setViewportSize`, así que el proyecto del
      // navegador no cambia lo que comprueba.
      testIgnore: /proyectos-autenticado\.spec\.ts/,
    },
  ],
  webServer: {
    command: `npx next start --port ${PUERTO}`,
    url: `http://localhost:${PUERTO}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
