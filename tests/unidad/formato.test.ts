import { describe, it, expect } from 'vitest';
import {
  dinero,
  dineroExacto,
  porMetro,
  mensual,
  numero,
  fecha,
  fechaCorta,
  hace,
  metros,
  contraMercado,
} from '@/lib/formato';

/**
 * Formato peruano.
 *
 * `Intl` con es-PE devuelve "USD 120,000" para dólares, y en el mercado
 * peruano se escribe "US$ 120,000". Estas pruebas fijan la diferencia
 * para que no se pierda al refactorizar.
 */
describe('moneda', () => {
  it('escribe soles con S/', () => {
    expect(dinero(450000, 'PEN')).toBe('S/ 450,000');
  });

  it('escribe dólares con US$, no con "USD"', () => {
    expect(dinero(120000, 'USD')).toBe('US$ 120,000');
    expect(dinero(120000, 'USD')).not.toContain('USD');
  });

  it('usa dólares por defecto', () => {
    expect(dinero(950)).toBe('US$ 950');
  });

  it('separa los miles con coma', () => {
    expect(dinero(1750, 'USD')).toBe('US$ 1,750');
  });

  it('muestra decimales cuando se piden', () => {
    expect(dineroExacto(280.5, 'PEN')).toBe('S/ 280.50');
  });

  it('arma el precio por metro cuadrado', () => {
    expect(porMetro(1750, 'USD')).toBe('US$ 1,750 por m²');
  });

  it('arma el alquiler mensual', () => {
    expect(mensual(2500, 'PEN')).toBe('S/ 2,500 mensuales');
  });
});

describe('números y áreas', () => {
  it('formatea miles', () => {
    expect(numero(2285)).toBe('2,285');
  });

  it('deja los números chicos sin separador', () => {
    expect(numero(184)).toBe('184');
  });

  it('escribe el área con la unidad', () => {
    expect(metros(92)).toBe('92 m²');
  });
});

describe('fechas', () => {
  it('escribe la fecha larga en español', () => {
    expect(fecha('2026-08-15T12:00:00Z')).toBe('15 de agosto de 2026');
  });

  it('abrevia el mes con punto, como corresponde en español', () => {
    expect(fechaCorta('2026-08-15T12:00:00Z')).toBe('15 ago. 2026');
  });

  it('convierte a hora de Lima, no a UTC', () => {
    // 15 de agosto 02:00 UTC es todavía 14 de agosto en Lima (UTC-5).
    expect(fecha('2026-08-15T02:00:00Z')).toBe('14 de agosto de 2026');
  });

  it('dice hoy, ayer o los días transcurridos', () => {
    expect(hace(0)).toBe('hoy');
    expect(hace(1)).toBe('ayer');
    expect(hace(5)).toBe('hace 5 días');
  });
});

describe('comparación contra el mercado', () => {
  it('dice cuánto está por debajo', () => {
    expect(contraMercado(-12, 'Miraflores')).toBe('12% debajo del promedio de Miraflores');
  });

  it('dice cuánto está por encima', () => {
    expect(contraMercado(18, 'San Isidro')).toBe('18% encima del promedio de San Isidro');
  });

  it('trata las diferencias mínimas como "en el promedio"', () => {
    expect(contraMercado(2, 'Barranco')).toBe('En el promedio de Barranco');
    expect(contraMercado(-3, 'Barranco')).toBe('En el promedio de Barranco');
  });
});
