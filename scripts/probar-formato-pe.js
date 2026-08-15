/**
 * Formato peruano: moneda, fechas y zona horaria.
 *
 * Va como prueba porque Intl no da solo el formato que se usa en el Perú:
 * para dólares devuelve "USD 120,000" y acá se escribe "US$ 120,000".
 *
 *   node scripts/probar-formato-pe.js
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

// cuenta.js corre en el navegador; lo evaluamos como módulo.
const fuente = readFileSync(join(RAIZ, 'public', 'cuenta.js'), 'utf8');
const modulo = await import(
  'data:text/javascript;base64,' + Buffer.from(fuente, 'utf8').toString('base64')
);
const { dinero, dineroExacto, porMetro, mensual, numero, fecha, fechaCorta, hace, LOCAL, ZONA } = modulo;

let fallos = 0;
const ok = (cond, nombre, detalle = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}${detalle ? ' — ' + detalle : ''}`);
  if (!cond) fallos++;
};
const igual = (real, esperado, nombre) =>
  ok(real === esperado, nombre, real === esperado ? real : `dio "${real}", se esperaba "${esperado}"`);

console.log('\n  Configuración regional\n');
ok(LOCAL === 'es-PE', 'la configuración regional es es-PE', LOCAL);
ok(ZONA === 'America/Lima', 'la zona horaria es America/Lima', ZONA);

console.log('\n  Precios\n');
igual(dinero(450000, 'PEN'), 'S/ 450,000', 'soles');
igual(dinero(120000, 'USD'), 'US$ 120,000', 'dólares con US$, no "USD"');
igual(dinero(1750, 'USD'), 'US$ 1,750', 'miles con coma');
igual(dinero(950), 'US$ 950', 'la moneda por defecto es el dólar');
igual(mensual(2500, 'PEN'), 'S/ 2,500 mensuales', 'alquiler mensual');
igual(porMetro(1750, 'USD'), 'US$ 1,750 por m²', 'precio por metro cuadrado');
igual(dineroExacto(280.5, 'PEN'), 'S/ 280.50', 'mantenimiento con decimales');
igual(numero(184), '184', 'números sueltos');
igual(numero(2285), '2,285', 'miles con coma en números sueltos');

console.log('\n  Fechas\n');
igual(fecha('2026-08-15T12:00:00Z'), '15 de agosto de 2026', 'fecha larga');
// En español la abreviatura del mes lleva punto: "ago." es lo correcto.
igual(fechaCorta('2026-08-15T12:00:00Z'), '15 ago. 2026', 'fecha corta con abreviatura');
{
  // 15 de agosto 02:00 UTC es todavía 14 de agosto en Lima (UTC-5).
  const enLima = fecha('2026-08-15T02:00:00Z');
  ok(enLima === '14 de agosto de 2026',
     'convierte a hora de Lima, no a UTC', enLima);
}
igual(hace(0), 'hoy', 'hoy');
igual(hace(1), 'ayer', 'ayer');
igual(hace(5), 'hace 5 días', 'días atrás');

console.log('\n  Sin formatos duplicados en las páginas\n');
{
  const paginas = ['index.html', 'buscar.html', 'panel.html', 'propiedad.html', 'publicar.html'];
  let duplicados = 0;
  let fechasSinZona = 0;
  for (const nombre of paginas) {
    const html = readFileSync(join(RAIZ, 'public', nombre), 'utf8');
    if (/const\s+dinero\s*=/.test(html)) { duplicados++; console.log('      duplicado en', nombre); }
    if (/toLocaleDateString|toLocaleString/.test(html)) {
      fechasSinZona++; console.log('      fecha sin zona en', nombre);
    }
  }
  ok(duplicados === 0, 'ninguna página redefine dinero()');
  ok(fechasSinZona === 0, 'ninguna página formatea fechas sin la zona de Lima');
}

console.log(fallos === 0 ? '\n  ✓ Todo en verde.\n' : `\n  ✗ ${fallos} fallo(s).\n`);
process.exit(fallos === 0 ? 0 : 1);
