import { describe, it, expect } from 'vitest';
import { rastreable, ofreceSitemap } from '../e2e/robots';

/**
 * El evaluador de `robots.txt` que usan las pruebas de navegador.
 *
 * Se prueba la herramienta de medir, no el producto, y hace falta por una
 * razón concreta: en `seo.spec.ts` y `ficha.spec.ts` las afirmaciones
 * sobre lo privado y lo público **se apoyan enteras en esta función**. Si
 * devolviera siempre lo mismo, o se equivocara con los comodines, esas
 * pruebas seguirían en verde sin comprobar nada. Un instrumento roto no
 * avisa: da un número.
 *
 * Los dos cuerpos de abajo son los que sirve la aplicación de verdad, uno
 * por entorno.
 */

const FUERA_DE_PRODUCCION = ['User-Agent: *', 'Disallow: /', ''].join('\n');

const EN_PRODUCCION = [
  'User-Agent: *',
  'Allow: /',
  'Disallow: /panel',
  'Disallow: /bienvenida',
  'Disallow: /ingresar',
  'Disallow: /registrarse',
  'Disallow: /recuperar',
  'Disallow: /nueva-clave',
  'Disallow: /auth',
  'Disallow: /api',
  'Disallow: /comparar',
  'Disallow: /*?*vista=',
  'Disallow: /*?*orden=',
  'Disallow: /*?*pagina=',
  '',
  'Sitemap: https://wasipe.pe/sitemap.xml',
  'Host: https://wasipe.pe',
  '',
].join('\n');

describe('el evaluador de robots.txt', () => {
  it('fuera de producción no deja rastrear nada', () => {
    for (const ruta of ['/', '/comprar', '/propiedad/algo', '/panel']) {
      expect(rastreable(FUERA_DE_PRODUCCION, ruta), ruta).toBe(false);
    }
  });

  it('en producción deja lo público y cierra lo privado', () => {
    for (const publica of ['/', '/comprar', '/alquilar', '/propiedad/algo']) {
      expect(rastreable(EN_PRODUCCION, publica), publica).toBe(true);
    }
    for (const privada of ['/panel', '/panel/favoritos', '/ingresar', '/auth/callback', '/api/x']) {
      expect(rastreable(EN_PRODUCCION, privada), privada).toBe(false);
    }
  });

  it('gana el patrón más largo, no el primero que aparece', () => {
    // `Allow: /` coincide con todo; `Disallow: /panel` es más específico.
    // Si ganara el primero, el panel quedaría abierto y nadie se enteraría.
    expect(rastreable(EN_PRODUCCION, '/panel')).toBe(false);
    expect(rastreable(EN_PRODUCCION, '/precio-m2')).toBe(true);
  });

  it('entiende los comodines del medio', () => {
    // `Disallow: /*?*vista=` bloquea la vista de mapa pero no la búsqueda.
    expect(rastreable(EN_PRODUCCION, '/comprar?vista=mapa')).toBe(false);
    expect(rastreable(EN_PRODUCCION, '/comprar?dorm=3')).toBe(true);
  });

  it('un `Disallow:` vacío no bloquea nada', () => {
    const cuerpo = 'User-Agent: *\nDisallow:\n';
    expect(rastreable(cuerpo, '/lo-que-sea')).toBe(true);
  });

  it('sin reglas que coincidan, se puede rastrear', () => {
    expect(rastreable('', '/comprar')).toBe(true);
    expect(rastreable('User-Agent: Googlebot\nDisallow: /\n', '/comprar')).toBe(true);
  });

  it('distingue si hay sitemap o no', () => {
    expect(ofreceSitemap(EN_PRODUCCION)).toBe(true);
    expect(ofreceSitemap(FUERA_DE_PRODUCCION)).toBe(false);
  });

  it('no devuelve siempre lo mismo: los dos contratos difieren', () => {
    // La comprobación más tonta y la que más vale: si el evaluador
    // estuviera roto y contestara constante, todo lo de arriba podría
    // pasar por casualidad y las pruebas de navegador no medirían nada.
    expect(rastreable(EN_PRODUCCION, '/comprar')).not.toBe(
      rastreable(FUERA_DE_PRODUCCION, '/comprar'),
    );
  });
});
