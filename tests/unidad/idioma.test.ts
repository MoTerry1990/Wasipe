import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Guardián del idioma (REGLA OBLIGATORIA DE IDIOMA Y LOCALIZACIÓN).
 *
 * Toda la interfaz de Wasipe va en español peruano. El código —variables,
 * tipos, nombres de archivo— puede seguir en inglés; lo que nunca puede
 * quedar en inglés es el texto que ve la persona usuaria.
 *
 * Esta prueba lee los archivos .tsx de la interfaz, extrae solo el texto
 * visible (lo que está entre etiquetas JSX y los atributos que se muestran)
 * y falla si encuentra palabras en inglés.
 */

const RAIZ = join(__dirname, '..', '..');
const CARPETAS = ['app', 'components', 'features'];

/** Palabras en inglés que suelen colarse en interfaces. */
const PALABRAS_INGLESAS = [
  'search',
  'loading',
  'submit',
  'cancel',
  'save',
  'delete',
  'edit',
  'sign in',
  'sign up',
  'log in',
  'logout',
  'sign out',
  'welcome',
  'home',
  'about',
  'contact',
  'price',
  'property',
  'properties',
  'bedroom',
  'bathroom',
  'apartment',
  'house',
  'rent',
  'buy',
  'sell',
  'listing',
  'listings',
  'favorites',
  'settings',
  'profile',
  'dashboard',
  'error',
  'success',
  'warning',
  'not found',
  'try again',
  'coming soon',
  'read more',
  'see all',
  'view all',
  'learn more',
  'get started',
  'continue',
  'next',
  'back',
  'close',
  'open',
  'send',
  'email address',
  'password',
  'username',
  'required',
  'optional',
  'results',
  'no results',
  'filter',
  'filters',
  'sort',
  'showing',
  'available',
  'month',
  'monthly',
  'total',
  'from',
  'per',
  'usd',
];

/** Recorre una carpeta y devuelve todos los .tsx. */
function archivosTsx(carpeta: string): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(carpeta)) {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) {
      salida.push(...archivosTsx(ruta));
    } else if (nombre.endsWith('.tsx')) {
      salida.push(ruta);
    }
  }
  return salida;
}

/**
 * Extrae el texto que realmente ve la persona usuaria:
 *  - el contenido entre `>` y `<` de las etiquetas JSX,
 *  - los atributos que se muestran o se leen en voz alta.
 *
 * Se descartan comentarios, imports, clases de Tailwind y expresiones `{...}`,
 * porque ahí el inglés es legítimo (es código).
 */
function textoVisible(fuente: string): string {
  const sinComentarios = fuente
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/^\s*import[\s\S]*?from\s+'[^']*';/gm, ' ');

  const piezas: string[] = [];

  // Texto entre etiquetas: <p>Hola</p>
  for (const [, contenido] of sinComentarios.matchAll(/>([^<>{}]+)</g)) {
    piezas.push(contenido ?? '');
  }

  // Atributos visibles o audibles.
  const atributos = /\b(?:aria-label|title|alt|placeholder|label|ayuda|leyenda)="([^"]+)"/g;
  for (const [, valor] of sinComentarios.matchAll(atributos)) {
    piezas.push(valor ?? '');
  }

  return piezas.join(' \n ');
}

const HALLAZGOS: string[] = [];

for (const carpeta of CARPETAS) {
  for (const ruta of archivosTsx(join(RAIZ, carpeta))) {
    const visible = textoVisible(readFileSync(ruta, 'utf8')).toLowerCase();
    for (const palabra of PALABRAS_INGLESAS) {
      // \b no sirve con frases de dos palabras en todos los motores: se arma a mano.
      const patron = new RegExp(`(^|[^\\p{L}])${palabra}([^\\p{L}]|$)`, 'u');
      if (patron.test(visible)) {
        HALLAZGOS.push(`${relative(RAIZ, ruta).split(sep).join('/')} → "${palabra}"`);
      }
    }
  }
}

describe('regla de idioma', () => {
  it('encuentra archivos de interfaz que revisar', () => {
    const total = CARPETAS.reduce((n, c) => n + archivosTsx(join(RAIZ, c)).length, 0);
    expect(total).toBeGreaterThan(10);
  });

  it('no deja texto visible en inglés', () => {
    expect(HALLAZGOS).toEqual([]);
  });

  it('declara el idioma es-PE en el layout raíz', () => {
    const layout = readFileSync(join(RAIZ, 'app', 'layout.tsx'), 'utf8');
    expect(layout).toContain('lang="es-PE"');
  });

  it('nunca escribe "USD" en el formateador de moneda', () => {
    const formato = readFileSync(join(RAIZ, 'lib', 'formato.ts'), 'utf8');
    // El comportamiento está cubierto en formato.test.ts; aquí solo se fija
    // que el símbolo peruano siga presente en la fuente.
    expect(formato).toContain('US$ ');
  });
});
