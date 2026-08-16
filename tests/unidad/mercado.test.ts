import { describe, it, expect } from 'vitest';
import {
  AVISO_ESTIMACION_INFORMATIVA,
  BANDAS,
  CORTES,
  CLAVES_DE_PERIODO,
  MUESTRA_MINIMA,
  armarSerie,
  esPeriodo,
  evaluarPrecio,
  pieDeMuestra,
  type EstadisticaDeMercado,
} from '@/lib/mercado/evaluacion';
import { AVISO_RENTABILIDAD, costoMensual, rentabilidadBruta } from '@/lib/mercado/costos';

/**
 * Inteligencia de mercado.
 *
 * La mitad de estas pruebas comprueban que NO se publica una cifra: sin
 * muestra suficiente, sin mediana o con un dato absurdo, la respuesta es
 * «no se sabe». Una precisión falsa en la decisión de compra más grande
 * de la vida de alguien es peor que no decir nada.
 */

function stats(parcial: Partial<EstadisticaDeMercado> = {}): EstadisticaDeMercado {
  return {
    district: 'Miraflores',
    operation: 'sale',
    property_type: 'apartment',
    period: 'm12',
    listings: 40,
    avg_usd_per_m2: 2550,
    median_usd_per_m2: 2500,
    p25_usd_per_m2: 2200,
    p75_usd_per_m2: 2900,
    median_price_usd: 250_000,
    median_area: 100,
    outliers: 3,
    sufficient: true,
    pen_per_usd: 3.75,
    computed_at: '2026-08-15T12:00:00.000Z',
    ...parcial,
  };
}

// ---------------------------------------------------------------------
// Las bandas
// ---------------------------------------------------------------------

describe('evaluar el precio contra el distrito', () => {
  it.each([
    ['muy debajo', 1900, 'oportunidad'],
    ['justo en el corte de oportunidad', 2125, 'oportunidad'],
    ['algo debajo', 2300, 'competitivo'],
    ['en la mediana', 2500, 'promedio'],
    ['algo encima', 2700, 'promedio'],
    ['bien encima', 3000, 'elevado'],
  ])('%s → %s', (_titulo, precio, banda) => {
    expect(evaluarPrecio(precio, stats()).banda).toBe(banda);
  });

  it('los cortes no son simétricos, y está explicado por qué', () => {
    // En el Perú se publica con margen para negociar: 8% encima de la
    // mediana es normal, 15% debajo no lo es.
    expect(Math.abs(CORTES.oportunidad)).toBeGreaterThan(CORTES.elevado);
  });

  it('la diferencia se calcula contra la mediana, no contra el promedio', () => {
    const evaluacion = evaluarPrecio(
      2000,
      stats({ median_usd_per_m2: 2500, avg_usd_per_m2: 4000 }),
    );
    expect(evaluacion.diferencia).toBeCloseTo(-0.2, 3);
  });

  it('las cinco bandas están, con su texto', () => {
    for (const clave of [
      'oportunidad',
      'competitivo',
      'promedio',
      'elevado',
      'sin-datos',
    ] as const) {
      expect(BANDAS[clave].etiqueta.length).toBeGreaterThan(3);
      expect(BANDAS[clave].resumen.length).toBeGreaterThan(10);
    }
    expect(BANDAS.oportunidad.etiqueta).toBe('Oportunidad');
    expect(BANDAS.competitivo.etiqueta).toBe('Precio competitivo');
    expect(BANDAS.promedio.etiqueta).toBe('Precio promedio');
    expect(BANDAS.elevado.etiqueta).toBe('Precio elevado');
  });
});

// ---------------------------------------------------------------------
// Sin datos no se inventa precisión
// ---------------------------------------------------------------------

describe('cuando no alcanzan los datos', () => {
  it('sin estadística no hay banda ni diferencia', () => {
    const evaluacion = evaluarPrecio(2500, null);
    expect(evaluacion.banda).toBe('sin-datos');
    expect(evaluacion.diferencia).toBeNull();
  });

  it('con la muestra marcada insuficiente tampoco', () => {
    const evaluacion = evaluarPrecio(2500, stats({ sufficient: false, listings: 3 }));
    expect(evaluacion.banda).toBe('sin-datos');
    expect(evaluacion.diferencia).toBeNull();
  });

  it('debajo de la muestra mínima tampoco, aunque la base diga que sí', () => {
    // Doble cinturón: si la base y el código se desincronizan, gana el
    // más conservador.
    const evaluacion = evaluarPrecio(2500, stats({ sufficient: true, listings: 2 }));
    expect(evaluacion.banda).toBe('sin-datos');
  });

  it('sin mediana tampoco', () => {
    expect(evaluarPrecio(2500, stats({ median_usd_per_m2: null })).banda).toBe('sin-datos');
    expect(evaluarPrecio(2500, stats({ median_usd_per_m2: 0 })).banda).toBe('sin-datos');
  });

  it('sin precio por m² del aviso tampoco', () => {
    expect(evaluarPrecio(null, stats()).banda).toBe('sin-datos');
    expect(evaluarPrecio(0, stats()).banda).toBe('sin-datos');
    expect(evaluarPrecio(undefined, stats()).banda).toBe('sin-datos');
  });

  it('y la frase dice que faltan datos, no un número redondeado', () => {
    const evaluacion = evaluarPrecio(2500, stats({ sufficient: false }));
    expect(evaluacion.frase).toMatch(/avisos suficientes/i);
    expect(evaluacion.frase).not.toMatch(/\d+%/);
  });

  it('la muestra mínima es la misma que la de la base', () => {
    expect(MUESTRA_MINIMA).toBe(5);
  });
});

// ---------------------------------------------------------------------
// Todo lo que se publica dice de dónde sale
// ---------------------------------------------------------------------

describe('el pie de cada cifra', () => {
  const evaluacion = evaluarPrecio(2000, stats());

  it('dice de cuántos avisos sale', () => {
    expect(pieDeMuestra(evaluacion)).toContain('40 avisos');
  });

  it('dice cuántos se dejaron fuera por atípicos', () => {
    expect(pieDeMuestra(evaluacion)).toMatch(/3 quedaron fuera/);
  });

  it('dice cuándo se calculó', () => {
    expect(pieDeMuestra(evaluacion)).toMatch(/actualizado el 15 de agosto de 2026/);
  });

  it('y con qué tipo de cambio se normalizó', () => {
    // Sin el tipo de cambio y su fecha la cifra no se puede reproducir.
    expect(pieDeMuestra(evaluacion)).toMatch(/S\/ 3\.75 por dólar/);
    expect(evaluacion.tipoDeCambio?.valor).toBe(3.75);
    expect(evaluacion.tipoDeCambio?.fecha).toBe('2026-08-15T12:00:00.000Z');
  });

  it('un solo atípico se dice en singular', () => {
    expect(pieDeMuestra(evaluarPrecio(2000, stats({ outliers: 1 })))).toMatch(/1 quedó fuera/);
  });

  it('sin atípicos no se menciona el tema', () => {
    expect(pieDeMuestra(evaluarPrecio(2000, stats({ outliers: 0 })))).not.toMatch(/fuera/);
  });

  it('la frase siempre dice contra qué se compara', () => {
    expect(evaluacion.frase).toContain('Miraflores');
    expect(evaluacion.frase).toContain('40 avisos');
    expect(evaluacion.frase).toContain('US$ 2,500 por m²');
  });

  it('el aviso legal es el que pide el sprint, palabra por palabra', () => {
    expect(AVISO_ESTIMACION_INFORMATIVA).toBe(
      'Esta es una estimación informativa y no reemplaza una tasación profesional.',
    );
  });
});

describe('los períodos', () => {
  it('están los cuatro cortes de tiempo', () => {
    expect(CLAVES_DE_PERIODO).toEqual(['m3', 'm6', 'm12', 'todo']);
    expect(esPeriodo('m3')).toBe(true);
    expect(esPeriodo('siempre')).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------

describe('el historial de precios', () => {
  const historial = [
    {
      price: 200_000,
      currency: 'USD' as const,
      price_usd: 200_000,
      changed_at: '2026-01-10T00:00:00Z',
    },
    {
      price: 185_000,
      currency: 'USD' as const,
      price_usd: 185_000,
      changed_at: '2026-04-02T00:00:00Z',
    },
    {
      price: 175_000,
      currency: 'USD' as const,
      price_usd: 175_000,
      changed_at: '2026-07-15T00:00:00Z',
    },
  ];

  it('arma la serie en orden', () => {
    const serie = armarSerie([...historial].reverse())!;
    expect(serie.puntos.map((p) => p.valor)).toEqual([200_000, 185_000, 175_000]);
  });

  it('calcula la variación desde el primer precio', () => {
    const serie = armarSerie(historial)!;
    expect(serie.variacion).toBeCloseTo(-0.125, 3);
    expect(serie.resumen).toBe('Bajó 12% desde que se publicó.');
  });

  it('un solo punto no es una historia', () => {
    // Graficar un único precio sugiere un movimiento que no hubo.
    expect(armarSerie(historial.slice(0, 1))).toBeNull();
    expect(armarSerie([])).toBeNull();
  });

  it('grafica en dólares para que un cambio de moneda no invente un salto', () => {
    const serie = armarSerie([
      {
        price: 700_000,
        currency: 'PEN',
        price_usd: 186_667,
        changed_at: '2026-01-01T00:00:00Z',
      },
      {
        price: 180_000,
        currency: 'USD',
        price_usd: 180_000,
        changed_at: '2026-06-01T00:00:00Z',
      },
    ])!;

    expect(serie.puntos[0]?.valor).toBe(186_667);
    // La etiqueta sí conserva lo que se publicó ese día.
    expect(serie.puntos[0]?.etiqueta).toBe('S/ 700,000');
    expect(serie.puntos[1]?.etiqueta).toBe('US$ 180,000');
  });

  it('sin variación neta lo dice, en vez de inventar una tendencia', () => {
    const serie = armarSerie([
      {
        price: 100_000,
        currency: 'USD',
        price_usd: 100_000,
        changed_at: '2026-01-01T00:00:00Z',
      },
      {
        price: 110_000,
        currency: 'USD',
        price_usd: 110_000,
        changed_at: '2026-03-01T00:00:00Z',
      },
      {
        price: 100_000,
        currency: 'USD',
        price_usd: 100_000,
        changed_at: '2026-06-01T00:00:00Z',
      },
    ])!;
    expect(serie.resumen).toMatch(/sin variación neta/);
  });

  it('descarta los puntos sin precio en dólares', () => {
    const serie = armarSerie([
      ...historial,
      { price: 1, currency: 'USD', price_usd: null, changed_at: '2026-08-01T00:00:00Z' },
    ])!;
    expect(serie.puntos).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------
// Costo mensual
// ---------------------------------------------------------------------

describe('el costo mensual', () => {
  it('suma la cuota y el mantenimiento', () => {
    const costo = costoMensual({
      precio: 200_000,
      moneda: 'USD',
      mantenimiento: 375,
      tipoDeCambio: 3.75,
    })!;

    expect(costo.moneda).toBe('USD');
    expect(costo.cuota).toBeGreaterThan(0);
    // S/ 375 al tipo de cambio 3.75 son US$ 100.
    expect(costo.mantenimiento).toBe(100);
    expect(costo.total).toBeCloseTo(costo.cuota + 100, 2);
  });

  it('deja a la vista con qué tipo de cambio convirtió', () => {
    const costo = costoMensual({
      precio: 200_000,
      moneda: 'USD',
      mantenimiento: 375,
      tipoDeCambio: 3.8,
    })!;
    expect(costo.tipoDeCambio).toBe(3.8);
  });

  it('en soles no convierte nada, y lo dice no mostrando tipo de cambio', () => {
    const costo = costoMensual({
      precio: 700_000,
      moneda: 'PEN',
      mantenimiento: 380,
      tipoDeCambio: 3.75,
    })!;
    expect(costo.mantenimiento).toBe(380);
    expect(costo.tipoDeCambio).toBeNull();
  });

  it('sin mantenimiento el total es solo la cuota', () => {
    const costo = costoMensual({ precio: 200_000, moneda: 'USD', tipoDeCambio: 3.75 })!;
    expect(costo.mantenimiento).toBe(0);
    expect(costo.total).toBe(costo.cuota);
  });

  it('un precio absurdo no devuelve una cuota absurda: devuelve nada', () => {
    expect(costoMensual({ precio: 0, moneda: 'USD', tipoDeCambio: 3.75 })).toBeNull();
    expect(costoMensual({ precio: -100, moneda: 'USD', tipoDeCambio: 3.75 })).toBeNull();
  });

  it('lleva el aviso de que la cuota real la fija el banco', () => {
    const costo = costoMensual({ precio: 200_000, moneda: 'USD', tipoDeCambio: 3.75 })!;
    expect(costo.aviso).toMatch(/No es una oferta de crédito/);
  });
});

// ---------------------------------------------------------------------
// Rentabilidad
// ---------------------------------------------------------------------

describe('la rentabilidad bruta', () => {
  const alquileres = stats({ operation: 'rent', median_usd_per_m2: 14, listings: 25 });

  it('sale de la mediana de alquiler del distrito por el área', () => {
    const r = rentabilidadBruta({ precioUsd: 200_000, areaTotal: 100, alquileres })!;
    // 14 US$/m² × 100 m² = 1400 al mes → 16 800 al año → 8,4%.
    expect(r.alquilerEstimado).toBe(1400);
    expect(r.anual).toBeCloseTo(0.084, 4);
  });

  it('dice de cuántos alquileres sale', () => {
    const r = rentabilidadBruta({ precioUsd: 200_000, areaTotal: 100, alquileres })!;
    expect(r.frase).toContain('25 avisos');
    expect(r.muestra).toBe(25);
  });

  it('sin muestra suficiente de alquileres no se publica ninguna', () => {
    expect(
      rentabilidadBruta({
        precioUsd: 200_000,
        areaTotal: 100,
        alquileres: stats({ sufficient: false }),
      }),
    ).toBeNull();
    expect(
      rentabilidadBruta({
        precioUsd: 200_000,
        areaTotal: 100,
        alquileres: stats({ listings: 3 }),
      }),
    ).toBeNull();
    expect(
      rentabilidadBruta({ precioUsd: 200_000, areaTotal: 100, alquileres: null }),
    ).toBeNull();
  });

  it('un resultado imposible se descarta en vez de publicarse', () => {
    // 25% bruto anual no es una oportunidad: es un aviso de alquiler
    // cargado en la moneda equivocada.
    expect(rentabilidadBruta({ precioUsd: 50_000, areaTotal: 100, alquileres })).toBeNull();
  });

  it('sin precio o sin área no hay cuenta que hacer', () => {
    expect(rentabilidadBruta({ precioUsd: null, areaTotal: 100, alquileres })).toBeNull();
    expect(rentabilidadBruta({ precioUsd: 200_000, areaTotal: 0, alquileres })).toBeNull();
  });

  it('el aviso aclara que es bruta y qué no descuenta', () => {
    expect(AVISO_RENTABILIDAD).toMatch(/BRUTA/);
    expect(AVISO_RENTABILIDAD).toMatch(/mantenimiento/);
    expect(AVISO_RENTABILIDAD).toMatch(/meses en que el inmueble esté vacío/);
    expect(AVISO_RENTABILIDAD).toMatch(/rentabilidad neta siempre es menor/);
  });
});
