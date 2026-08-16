import { describe, it, expect } from 'vitest';
import {
  leerFiltros,
  urlDeFiltros,
  urlSinFiltros,
  hayFiltros,
  cantidadDeFiltros,
  tituloDeBusqueda,
} from '@/lib/busqueda/filtros';
import { leerSegmentos, rutaCanonica } from '@/lib/busqueda/rutas';
import {
  agrupar,
  limitesDe,
  proyectar,
  ladoDeCelda,
  tienePuntoPublico,
  ZOOM_MAXIMO,
} from '@/lib/mapa/agrupar';
import { TIPO_INMUEBLE_PLURAL } from '@/lib/etiquetas';

describe('leer los filtros de la URL', () => {
  it('lee lo que reconoce', () => {
    const filtros = leerFiltros('rent', {
      distrito: 'Miraflores',
      tipo: 'departamento',
      dorm: '3',
      precioMax: '2500',
      moneda: 'PEN',
      verificados: '1',
    });

    expect(filtros.operacion).toBe('rent');
    expect(filtros.distrito).toBe('Miraflores');
    expect(filtros.tipo).toBe('apartment');
    expect(filtros.dorm).toBe(3);
    expect(filtros.precioMax).toBe(2500);
    expect(filtros.moneda).toBe('PEN');
    expect(filtros.verificados).toBe(true);
  });

  it('descarta lo inválido sin llevarse el resto por delante', () => {
    const filtros = leerFiltros('sale', {
      distrito: 'Barranco',
      dorm: 'muchos',
      precioMin: 'abc',
      tipo: 'castillo',
      moneda: 'EUR',
      orden: 'por-simpatia',
    });

    // Lo que se entiende sobrevive.
    expect(filtros.distrito).toBe('Barranco');
    // Lo que no, desaparece.
    expect(filtros.dorm).toBeUndefined();
    expect(filtros.precioMin).toBeUndefined();
    expect(filtros.tipo).toBeUndefined();
    expect(filtros.moneda).toBeUndefined();
    expect(filtros.orden).toBe('recientes');
  });

  it('recorta los números disparatados en vez de fallar', () => {
    const filtros = leerFiltros('sale', { dorm: '99999', pagina: '-4' });
    expect(filtros.dorm).toBe(30);
    expect(filtros.pagina).toBe(1);
  });

  it('endereza un rango escrito al revés', () => {
    // Mínimo 500,000 y máximo 100,000 no devolvería nada nunca.
    const filtros = leerFiltros('sale', { precioMin: '500000', precioMax: '100000' });
    expect(filtros.precioMin).toBe(100000);
    expect(filtros.precioMax).toBe(500000);
  });

  it('con un parámetro repetido se queda con el primero', () => {
    const filtros = leerFiltros('sale', { dorm: ['2', '3'] });
    expect(filtros.dorm).toBe(2);
  });

  it('aguanta una URL absurda sin romperse', () => {
    const filtros = leerFiltros('sale', {
      dorm: '<script>alert(1)</script>',
      distrito: "'; drop table properties; --",
      precioMax: 'Infinity',
      pagina: 'NaN',
    });

    expect(filtros.dorm).toBeUndefined();
    expect(filtros.precioMax).toBeUndefined();
    expect(filtros.pagina).toBeUndefined();
    // El texto sobrevive como texto: la consulta lo manda parametrizado,
    // así que no hay forma de que se ejecute.
    expect(filtros.distrito).toBe("'; drop table properties; --");
  });
});

describe('escribir los filtros en la URL', () => {
  it('la ida y la vuelta dan lo mismo', () => {
    const original = leerFiltros('rent', {
      distrito: 'Miraflores',
      tipo: 'departamento',
      dorm: '2',
      precioMax: '3000',
      mascotas: '1',
    });

    const url = urlDeFiltros(original);
    const params = Object.fromEntries(new URL(url, 'https://wasipe.pe').searchParams);
    const devuelta = leerFiltros('rent', params);

    expect(devuelta).toEqual(original);
  });

  it('no escribe los valores por defecto', () => {
    const filtros = leerFiltros('sale', { orden: 'recientes', pagina: '1', vista: 'lista' });
    // Con ellos, Google vería dos direcciones para la misma página.
    expect(urlDeFiltros(filtros)).toBe('/comprar');
  });

  it('cada operación mantiene su ruta', () => {
    expect(urlDeFiltros(leerFiltros('sale', {}))).toBe('/comprar');
    expect(urlDeFiltros(leerFiltros('rent', { dorm: '2' }))).toBe('/alquilar?dorm=2');
    expect(urlDeFiltros(leerFiltros('project', {}))).toBe('/proyectos');
  });

  it('limpiar conserva la operación, la vista y la moneda', () => {
    const filtros = leerFiltros('rent', {
      distrito: 'Barranco',
      dorm: '3',
      vista: 'mapa',
      moneda: 'PEN',
    });

    const limpia = urlSinFiltros(filtros);
    expect(limpia).toContain('/alquilar');
    expect(limpia).toContain('moneda=PEN');
    expect(limpia).toContain('vista=mapa');
    expect(limpia).not.toContain('distrito');
    expect(limpia).not.toContain('dorm');
  });

  it('cuenta cuántos filtros hay puestos', () => {
    expect(hayFiltros(leerFiltros('sale', { orden: 'precio-asc' }))).toBe(false);
    expect(cantidadDeFiltros(leerFiltros('sale', { dorm: '2', distrito: 'Lince' }))).toBe(2);
  });
});

describe('título de la búsqueda', () => {
  it('se arma con lo que se filtró, en castellano', () => {
    expect(
      tituloDeBusqueda(
        leerFiltros('rent', { tipo: 'departamento', distrito: 'Miraflores' }),
        TIPO_INMUEBLE_PLURAL,
      ),
    ).toBe('Departamentos en alquiler en Miraflores');

    expect(tituloDeBusqueda(leerFiltros('sale', { tipo: 'casa' }), TIPO_INMUEBLE_PLURAL)).toBe(
      'Casas en venta',
    );

    expect(tituloDeBusqueda(leerFiltros('sale', {}), TIPO_INMUEBLE_PLURAL)).toBe(
      'Propiedades en venta',
    );
  });
});

describe('rutas amigables', () => {
  it('entiende los segmentos en cualquier orden', () => {
    const a = leerSegmentos(['departamento', 'miraflores']);
    const b = leerSegmentos(['miraflores', 'departamento']);

    expect(a.tipo).toBe('apartment');
    expect(a.distrito).toBe('Miraflores');
    expect(b).toEqual(a);
  });

  it('completa provincia y departamento a partir del distrito', () => {
    const leidos = leerSegmentos(['yanahuara']);
    expect(leidos.distrito).toBe('Yanahuara');
    expect(leidos.provincia).toBe('Arequipa');
    expect(leidos.departamento).toBe('Arequipa');
  });

  it('marca lo que no reconoce', () => {
    expect(leerSegmentos(['narnia']).desconocido).toBe(true);
    expect(leerSegmentos(['casa', 'barranco']).desconocido).toBe(false);
  });

  it('la ruta canónica pone siempre el mismo orden', () => {
    expect(rutaCanonica('rent', { tipo: 'apartment', distrito: 'Miraflores' })).toBe(
      '/alquilar/departamento/miraflores',
    );
    expect(rutaCanonica('sale', { distrito: 'Santiago de Surco' })).toBe(
      '/comprar/santiago-de-surco',
    );
    expect(rutaCanonica('project', {})).toBe('/proyectos');
  });
});

describe('agrupación de marcadores', () => {
  const punto = (id: string, lat: number, lon: number) => ({ id, lat, lon });

  it('junta lo que cae en la misma celda', () => {
    const puntos = [
      punto('a', -12.121, -77.029),
      punto('b', -12.1215, -77.0295),
      punto('c', -12.4, -76.8),
    ];

    const grupos = agrupar(puntos, 4);
    expect(grupos).toHaveLength(2);
    expect(grupos.map((g) => g.puntos.length).sort()).toEqual([1, 2]);
  });

  it('acercar separa los grupos', () => {
    const puntos = [punto('a', -12.12, -77.03), punto('b', -12.13, -77.04)];
    expect(agrupar(puntos, 1)).toHaveLength(1);
    expect(agrupar(puntos, ZOOM_MAXIMO)).toHaveLength(2);
  });

  it('los grupos son estables: dos corridas dan lo mismo', () => {
    const puntos = Array.from({ length: 40 }, (_, i) =>
      punto(`p${i}`, -12.1 - i * 0.001, -77 - i * 0.001),
    );
    const primera = agrupar(puntos, 5).map((g) => g.id);
    const segunda = agrupar(puntos, 5).map((g) => g.id);
    expect(segunda).toEqual(primera);
  });

  it('el centro es el promedio y no el de la celda', () => {
    const grupos = agrupar([punto('a', -12.1, -77.0), punto('b', -12.11, -77.02)], 2);
    expect(grupos[0]?.lat).toBeCloseTo(-12.105, 5);
    expect(grupos[0]?.lon).toBeCloseTo(-77.01, 5);
  });

  it('los grupos grandes se dibujan al final para quedar encima', () => {
    const puntos = [
      punto('a', -12.1, -77.0),
      punto('b', -12.1001, -77.0001),
      punto('c', -13.5, -76.0),
    ];
    const grupos = agrupar(puntos, 6);
    const tamanos = grupos.map((g) => g.puntos.length);
    expect(tamanos[tamanos.length - 1]).toBe(Math.max(...tamanos));
  });

  it('descarta coordenadas que no son números', () => {
    const grupos = agrupar([punto('malo', NaN, -77), punto('bueno', -12.1, -77)], 4);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.puntos[0]?.id).toBe('bueno');
  });

  it('la celda se achica al acercar', () => {
    expect(ladoDeCelda(0)).toBeGreaterThan(ladoDeCelda(ZOOM_MAXIMO));
    // Fuera de rango se recorta, no se rompe.
    expect(ladoDeCelda(-5)).toBe(ladoDeCelda(0));
    expect(ladoDeCelda(999)).toBe(ladoDeCelda(ZOOM_MAXIMO));
  });
});

describe('proyección del mapa', () => {
  it('devuelve null si no hay puntos', () => {
    expect(limitesDe([])).toBeNull();
  });

  it('con un solo punto arma un recuadro utilizable', () => {
    const limites = limitesDe([{ id: 'a', lat: -12.1, lon: -77 }]);
    expect(limites).not.toBeNull();
    expect(limites!.norte).toBeGreaterThan(limites!.sur);
    expect(limites!.este).toBeGreaterThan(limites!.oeste);
  });

  it('el norte queda arriba y el este a la derecha', () => {
    const limites = {
      norte: -12.0,
      sur: -12.2,
      este: -76.9,
      oeste: -77.1,
    };

    const arriba = proyectar({ lat: -12.0, lon: -77.0 }, limites);
    const abajo = proyectar({ lat: -12.2, lon: -77.0 }, limites);
    const derecha = proyectar({ lat: -12.1, lon: -76.9 }, limites);

    expect(arriba.y).toBeLessThan(abajo.y);
    expect(derecha.x).toBeGreaterThan(50);
  });
});

describe('privacidad de la dirección', () => {
  it('un aviso "solo distrito" nunca va al mapa', () => {
    expect(
      tienePuntoPublico({ lat: -12.1, lon: -77.0, address_privacy: 'district_only' }),
    ).toBe(false);
  });

  it('los aproximados y los exactos sí', () => {
    expect(tienePuntoPublico({ lat: -12.1, lon: -77, address_privacy: 'approximate' })).toBe(
      true,
    );
    expect(tienePuntoPublico({ lat: -12.1, lon: -77, address_privacy: 'exact' })).toBe(true);
  });

  it('sin coordenadas tampoco', () => {
    expect(tienePuntoPublico({ lat: null, lon: null, address_privacy: 'exact' })).toBe(false);
  });
});
