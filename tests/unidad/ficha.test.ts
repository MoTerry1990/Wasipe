import { describe, it, expect } from 'vitest';
import { aSlug, enlaceDeAviso, codigoDesdeRuta } from '@/lib/avisos/enlace';
import { calcularHipoteca, ingresoSugerido, AVISO_HIPOTECA } from '@/lib/hipoteca';
import {
  esquemaConsulta,
  esquemaVisita,
  esquemaDenuncia,
  revisarTrampa,
  CAMPO_TRAMPA,
  SEGUNDOS_MINIMOS,
  RESPUESTA_A_ROBOT,
} from '@/lib/validacion/contacto';
import { nombreDeCaracteristica } from '@/lib/etiquetas';

const AVISO = {
  code: 'WSP-001247',
  property_type: 'apartment',
  operation: 'sale',
  district: 'Miraflores',
  built_area: 92,
  total_area: 92,
} as const;

describe('dirección de la ficha', () => {
  it('arma una dirección legible', () => {
    expect(enlaceDeAviso(AVISO)).toBe(
      '/propiedad/departamento-en-venta-miraflores-92m2-wsp-001247',
    );
  });

  it('usa el código público y no el identificador interno', () => {
    // El UUID no aparece: se dicta por teléfono el código, no un uuid.
    expect(enlaceDeAviso(AVISO)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  it('convierte tildes y eñes en la dirección', () => {
    expect(aSlug('Jesús María')).toBe('jesus-maria');
    expect(aSlug('Breña')).toBe('brena');
    expect(aSlug('  Santiago de Surco  ')).toBe('santiago-de-surco');
  });

  it('lee el código del final de la dirección', () => {
    expect(codigoDesdeRuta('departamento-en-venta-miraflores-92m2-wsp-001247')).toBe(
      'WSP-001247',
    );
    expect(codigoDesdeRuta('WSP-000001')).toBe('WSP-000001');
  });

  it('sobrevive a que el texto de adelante cambie', () => {
    // Si se corrige el título o el distrito, el enlace viejo sigue
    // llevando al mismo aviso: lo único que se lee es el código.
    expect(codigoDesdeRuta('cualquier-cosa-vieja-wsp-001247')).toBe('WSP-001247');
  });

  it('rechaza una dirección sin código', () => {
    expect(codigoDesdeRuta('departamento-en-miraflores')).toBeNull();
    expect(codigoDesdeRuta('wsp-12')).toBeNull();
    expect(codigoDesdeRuta('')).toBeNull();
  });

  it('cambia el texto de la operación', () => {
    expect(enlaceDeAviso({ ...AVISO, operation: 'rent' })).toContain('en-alquiler');
    expect(enlaceDeAviso({ ...AVISO, operation: 'project' })).toContain('proyecto');
  });
});

describe('estimación de cuota', () => {
  it('calcula la cuota de un crédito francés', () => {
    // US$ 195,000 con 20% de inicial = US$ 156,000 a 20 años al 9% TEA.
    const resultado = calcularHipoteca({ precio: 195000 });

    expect(resultado).not.toBeNull();
    expect(resultado!.cuotaInicial).toBe(39000);
    expect(resultado!.monto).toBe(156000);
    // Con la tasa mensual equivalente ((1.09)^(1/12) − 1 = 0.7207%).
    expect(resultado!.cuota).toBeGreaterThan(1300);
    expect(resultado!.cuota).toBeLessThan(1400);
  });

  it('usa la tasa efectiva anual, no la dividida entre doce', () => {
    // Dividir la TEA entre 12 daría una cuota más baja que la real. La
    // diferencia tiene que notarse.
    const correcta = calcularHipoteca({ precio: 200000, tasaAnual: 9 })!;
    const ingenua = calcularHipoteca({ precio: 200000, tasaAnual: 8.65 })!;
    expect(correcta.cuota).toBeGreaterThan(ingenua.cuota);
  });

  it('a más plazo, cuota más baja pero más intereses', () => {
    const corto = calcularHipoteca({ precio: 200000, anios: 10 })!;
    const largo = calcularHipoteca({ precio: 200000, anios: 25 })!;

    expect(largo.cuota).toBeLessThan(corto.cuota);
    expect(largo.intereses).toBeGreaterThan(corto.intereses);
  });

  it('sin intereses la cuota es una división simple', () => {
    const resultado = calcularHipoteca({
      precio: 120000,
      porcentajeInicial: 0,
      anios: 10,
      tasaAnual: 0,
    })!;
    expect(resultado.cuota).toBe(1000);
    expect(resultado.intereses).toBe(0);
  });

  it('devuelve null cuando no hay nada que financiar', () => {
    expect(calcularHipoteca({ precio: 0 })).toBeNull();
    expect(calcularHipoteca({ precio: -5000 })).toBeNull();
    expect(calcularHipoteca({ precio: 100000, porcentajeInicial: 1 })).toBeNull();
    expect(calcularHipoteca({ precio: 100000, anios: 0 })).toBeNull();
  });

  it('el ingreso sugerido sale de la regla del 30%', () => {
    expect(ingresoSugerido(1500)).toBe(5000);
  });

  it('el aviso deja claro que no es una oferta de crédito', () => {
    expect(AVISO_HIPOTECA).toMatch(/referencial/i);
    expect(AVISO_HIPOTECA).toMatch(/no es una oferta/i);
  });
});

describe('validación del contacto', () => {
  const valido = {
    aviso: 'c0000001-0000-4000-8000-000000000001',
    nombre: 'Lucía Ferrer',
    celular: '987654321',
    correo: 'lucia@ejemplo.pe',
    mensaje: 'Hola, ¿el departamento sigue disponible? Quisiera coordinar una visita.',
  };

  it('acepta una consulta completa', () => {
    expect(esquemaConsulta.safeParse(valido).success).toBe(true);
  });

  it('el correo es opcional; el celular no', () => {
    expect(esquemaConsulta.safeParse({ ...valido, correo: '' }).success).toBe(true);
    expect(esquemaConsulta.safeParse({ ...valido, celular: '' }).success).toBe(false);
  });

  it('exige un celular peruano', () => {
    // Un fijo de Lima no sirve: le van a responder por WhatsApp.
    expect(esquemaConsulta.safeParse({ ...valido, celular: '014567890' }).success).toBe(false);
  });

  it('rechaza un mensaje de dos palabras', () => {
    const corto = esquemaConsulta.safeParse({ ...valido, mensaje: 'hola' });
    expect(corto.success).toBe(false);
    if (!corto.success) expect(corto.error.issues[0]?.message).toMatch(/diez caracteres/);
  });

  it('la visita necesita una fecha de hoy en adelante', () => {
    const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const ayer = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    expect(esquemaVisita.safeParse({ ...valido, fecha: manana }).success).toBe(true);
    expect(esquemaVisita.safeParse({ ...valido, fecha: ayer }).success).toBe(false);
    expect(esquemaVisita.safeParse({ ...valido, fecha: 'el jueves' }).success).toBe(false);
  });

  it('la denuncia exige un motivo del catálogo', () => {
    expect(esquemaDenuncia.safeParse({ aviso: 'x', motivo: 'scam' }).success).toBe(true);
    expect(esquemaDenuncia.safeParse({ aviso: 'x', motivo: 'no me gusta' }).success).toBe(
      false,
    );
  });
});

describe('protección contra envíos automáticos', () => {
  const hace = (segundos: number) => Date.now() - segundos * 1000;

  it('deja pasar a una persona que se tomó su tiempo', () => {
    expect(revisarTrampa({ trampa: '', abiertoEn: hace(20) })).toEqual({ paso: true });
  });

  it('frena a quien completó el campo trampa', () => {
    const resultado = revisarTrampa({ trampa: 'Quispe', abiertoEn: hace(20) });
    expect(resultado.paso).toBe(false);
  });

  it('frena un envío instantáneo', () => {
    expect(revisarTrampa({ trampa: '', abiertoEn: hace(0.5) }).paso).toBe(false);
    expect(revisarTrampa({ trampa: '', abiertoEn: hace(SEGUNDOS_MINIMOS + 1) }).paso).toBe(
      true,
    );
  });

  it('sin marca de tiempo deja pasar', () => {
    // Quien navega con JavaScript desactivado no manda la marca, y no se
    // le puede cerrar la puerta por eso.
    expect(revisarTrampa({ trampa: '', abiertoEn: undefined }).paso).toBe(true);
    expect(revisarTrampa({ trampa: '', abiertoEn: 'ayer' }).paso).toBe(true);
  });

  it('acepta una pestaña olvidada durante horas', () => {
    expect(revisarTrampa({ trampa: '', abiertoEn: hace(8 * 3600) }).paso).toBe(true);
  });

  it('al robot se le responde que todo salió bien', () => {
    // Decirle "detectamos un robot" es regalarle lo que necesita para
    // ajustar su script.
    expect(RESPUESTA_A_ROBOT).not.toMatch(/robot|spam|bloque/i);
    expect(RESPUESTA_A_ROBOT).toMatch(/enviamos tu mensaje/i);
  });

  it('el campo trampa tiene nombre de campo real', () => {
    // "apellido_materno" es creíble para un robot; "honeypot" no.
    expect(CAMPO_TRAMPA).toBe('apellido_materno');
  });
});

describe('características', () => {
  it('traduce las del catálogo', () => {
    expect(nombreDeCaracteristica('porteria_24h')).toBe('Portería 24 horas');
    expect(nombreDeCaracteristica('area_parrillas')).toBe('Área de parrillas');
  });

  it('muestra las que no conoce en vez de esconderlas', () => {
    expect(nombreDeCaracteristica('vista_al_volcan')).toBe('Vista al volcan');
  });
});
