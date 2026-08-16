/**
 * Mide el peso de lo que se descarga en cada pantalla.
 *
 * No sustituye a Lighthouse con datos de campo —eso necesita un sitio en
 * producción con visitas de verdad, y Wasipe todavía no lo tiene— pero sí
 * da los números que sí se pueden medir hoy y que son los que gobiernan
 * el LCP: cuántos bytes hay que traer antes de ver algo, cuántas
 * peticiones son, y cuánto tarda el servidor en mandar el primer byte.
 *
 * Uso:
 *   npx next build && npx next start --port 3100 &
 *   node scripts/medir-rendimiento.mjs
 *
 * Las cifras se anotan en RENDIMIENTO.md con la fecha. Sin fecha, una
 * medición no sirve para comparar contra nada.
 */

import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3100';

const PANTALLAS = [
  ['Portada', '/'],
  ['Búsqueda', '/comprar'],
  ['Landing', '/comprar/departamento/miraflores'],
  ['Precio por m²', '/precio-m2'],
  ['Todas las búsquedas', '/busquedas'],
];

const APARATOS = [
  // Un gama media peruano en 4G decente. Es el equipo real de la mayoría,
  // no un iPhone en fibra, que es donde todo se ve rápido.
  { nombre: 'móvil', viewport: { width: 390, height: 844 }, cpu: 4 },
  { nombre: 'escritorio', viewport: { width: 1440, height: 900 }, cpu: 1 },
];

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

async function medir(navegador, aparato, ruta) {
  const contexto = await navegador.newContext({ viewport: aparato.viewport });
  const page = await contexto.newPage();

  const sesion = await contexto.newCDPSession(page);
  await sesion.send('Emulation.setCPUThrottlingRate', { rate: aparato.cpu });

  const porTipo = { documento: 0, script: 0, estilo: 0, fuente: 0, imagen: 0, otro: 0 };
  let peticiones = 0;

  page.on('response', async (respuesta) => {
    peticiones++;
    const tipo = respuesta.request().resourceType();
    let tamano = 0;
    try {
      tamano = (await respuesta.body()).length;
    } catch {
      return;
    }
    const clave =
      {
        document: 'documento',
        script: 'script',
        stylesheet: 'estilo',
        font: 'fuente',
        image: 'imagen',
      }[tipo] ?? 'otro';
    porTipo[clave] += tamano;
  });

  const inicio = Date.now();
  const respuesta = await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle' });
  const total = Date.now() - inicio;

  const tiempos = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const pintado = performance.getEntriesByType('paint');
    return {
      ttfb: Math.round(nav?.responseStart ?? 0),
      dom: Math.round(nav?.domContentLoadedEventEnd ?? 0),
      fcp: Math.round(pintado.find((p) => p.name === 'first-contentful-paint')?.startTime ?? 0),
    };
  });

  // El LCP se recoge con el observador estándar, esperando un momento a
  // que el navegador emita la última entrada.
  const lcp = await page.evaluate(
    () =>
      new Promise((resolver) => {
        let ultimo = 0;
        new PerformanceObserver((lista) => {
          for (const entrada of lista.getEntries()) ultimo = entrada.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        setTimeout(() => resolver(Math.round(ultimo)), 600);
      }),
  );

  const bytes = Object.values(porTipo).reduce((a, b) => a + b, 0);
  await contexto.close();

  return { estado: respuesta?.status(), peticiones, bytes, porTipo, tiempos, lcp, total };
}

const navegador = await chromium.launch();

for (const aparato of APARATOS) {
  console.log(`\n### ${aparato.nombre} (CPU ×${aparato.cpu})\n`);
  console.log('| Pantalla | Peticiones | Total | JS | CSS | Fuentes | TTFB | FCP | LCP |');
  console.log('|---|---|---|---|---|---|---|---|---|');

  for (const [nombre, ruta] of PANTALLAS) {
    const m = await medir(navegador, aparato, ruta);
    console.log(
      `| ${nombre} | ${m.peticiones} | ${kb(m.bytes)} | ${kb(m.porTipo.script)} | ${kb(
        m.porTipo.estilo,
      )} | ${kb(m.porTipo.fuente)} | ${m.tiempos.ttfb} ms | ${m.tiempos.fcp} ms | ${m.lcp} ms |`,
    );
  }
}

await navegador.close();
