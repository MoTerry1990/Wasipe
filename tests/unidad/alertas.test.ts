import { describe, it, expect } from 'vitest';
import { armarCorreo } from '@/lib/alertas/mensaje';
import type { AvisoDeAlerta } from '@/lib/alertas/mensaje';

/**
 * El correo de una alerta.
 *
 * `saved_searches` guardaba `alert_frequency` desde el esquema inicial y
 * nada la recorría: las alertas se guardaban y no avisaban nunca. Al
 * construir la tarea, el contenido del correo es lo único que no se puede
 * verificar mirando la base, así que se prueba acá.
 *
 * Lo que se comprueba no es que el texto sea bonito, sino tres cosas que
 * si faltan convierten un aviso útil en spam: que diga de qué búsqueda
 * viene, que el precio esté en formato peruano, y que explique cómo
 * dejar de recibirlo.
 */

const aviso = (partes: Partial<AvisoDeAlerta> = {}): AvisoDeAlerta => ({
  id: 'a1',
  code: 'WSP-001001',
  title: 'Departamento de 92 m² en Miraflores',
  district: 'Miraflores',
  operation: 'sale',
  property_type: 'apartment',
  currency: 'USD',
  price: 180000,
  ...partes,
});

describe('el correo de una alerta', () => {
  it('dice de qué búsqueda viene', () => {
    // Alguien puede tener cinco alertas y no acordarse de cuál es esta.
    const m = armarCorreo({
      nombreDeLaBusqueda: 'Departamentos en Barranco',
      avisos: [aviso()],
      total: 1,
      para: 'lucia@ejemplo.pe',
    });

    expect(m.asunto).toContain('Departamentos en Barranco');
    expect(m.cuerpo).toContain('Departamentos en Barranco');
  });

  it('trae el precio en formato peruano', () => {
    const m = armarCorreo({
      nombreDeLaBusqueda: 'x',
      avisos: [aviso({ price: 180000, currency: 'USD' })],
      total: 1,
      para: 'a@b.pe',
    });

    expect(m.cuerpo).toContain('US$ 180,000');
    // Nunca «USD»: la regla de idioma del proyecto es explícita.
    expect(m.cuerpo).not.toContain('USD');
  });

  it('y en soles cuando corresponde', () => {
    const m = armarCorreo({
      nombreDeLaBusqueda: 'x',
      avisos: [aviso({ price: 450000, currency: 'PEN' })],
      total: 1,
      para: 'a@b.pe',
    });

    expect(m.cuerpo).toContain('S/ 450,000');
  });

  it('SIEMPRE explica cómo dejar de recibirlo', () => {
    // Un correo automático sin salida es spam, aunque lo haya pedido
    // quien lo recibe.
    const m = armarCorreo({
      nombreDeLaBusqueda: 'x',
      avisos: [aviso()],
      total: 1,
      para: 'a@b.pe',
    });

    expect(m.cuerpo).toMatch(/dejar de recibirlos/i);
    expect(m.cuerpo).toContain('/panel/alertas');
  });

  it('cuenta bien en singular y en plural', () => {
    const uno = armarCorreo({
      nombreDeLaBusqueda: 'x',
      avisos: [aviso()],
      total: 1,
      para: 'a@b.pe',
    });
    expect(uno.asunto).toContain('Una propiedad nueva');

    const varios = armarCorreo({
      nombreDeLaBusqueda: 'x',
      avisos: [aviso(), aviso({ id: 'a2' })],
      total: 2,
      para: 'a@b.pe',
    });
    expect(varios.asunto).toContain('2 propiedades nuevas');
  });

  it('avisa cuando hay más de los que entraron', () => {
    const m = armarCorreo({
      nombreDeLaBusqueda: 'x',
      avisos: [aviso(), aviso({ id: 'a2' })],
      total: 5,
      para: 'a@b.pe',
    });

    expect(m.cuerpo).toContain('3 más que no entraron');
  });

  it('no habla en inglés en ninguna parte', () => {
    const m = armarCorreo({
      nombreDeLaBusqueda: 'Casas en Surco',
      avisos: [aviso({ operation: 'rent', property_type: 'house' })],
      total: 1,
      para: 'a@b.pe',
    });

    const texto = `${m.asunto}\n${m.cuerpo}`;
    for (const palabra of ['sale', 'rent', 'apartment', 'house', 'unsubscribe', 'New']) {
      expect(texto).not.toContain(palabra);
    }
  });
});
