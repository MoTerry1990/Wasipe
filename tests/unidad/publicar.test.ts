import { describe, it, expect } from 'vitest';
import {
  PASOS,
  revisarPaso,
  pasosIncompletos,
  sePuedeEnviar,
  revisarFoto,
  rutaDeFoto,
  esquemaDeAviso,
  FOTOS_MINIMAS,
  FOTOS_MAXIMAS,
  PESO_MAXIMO_FOTO,
  type BorradorDeAviso,
} from '@/lib/validacion/aviso';
import { desplazarPunto, centroDeDistrito, DESPLAZAMIENTO_M } from '@/lib/avisos/desplazar';

/** Un aviso completo, para ir rompiéndolo de a un campo. */
const COMPLETO: BorradorDeAviso = {
  operacion: 'sale',
  tipo: 'departamento',
  departamento: 'Lima',
  provincia: 'Lima',
  distrito: 'Miraflores',
  direccion: 'Calle Berlín 245',
  privacidad: 'approximate',
  moneda: 'USD',
  precio: 195000,
  areaTotal: 92,
  areaTechada: 92,
  dormitorios: 3,
  banos: 2,
  cocheras: 1,
  antiguedad: 11,
  amoblado: 'none',
  caracteristicas: ['ascensor', 'porteria_24h'],
  titulo: 'Departamento de 92 m² a dos cuadras del parque Kennedy',
  descripcion:
    'Departamento en un edificio de 2015, piso 7 con vista despejada y tres dormitorios amplios.',
  fotos: [
    { id: '1', url: 'https://ejemplo.pe/a.webp', alt: 'Sala', portada: true },
    { id: '2', url: 'https://ejemplo.pe/b.webp', alt: '', portada: false },
    { id: '3', url: 'https://ejemplo.pe/c.webp', alt: '', portada: false },
  ],
  contacto: 'whatsapp',
  celular: '987654321',
};

describe('pasos del asistente', () => {
  it('son diez y terminan en el envío', () => {
    expect(PASOS).toHaveLength(10);
    expect(PASOS[PASOS.length - 1]?.clave).toBe('envio');
  });

  it('un borrador vacío marca como pendientes los pasos obligatorios', () => {
    const faltan = pasosIncompletos({});

    // Siete: los ocho que piden datos menos "qué más tiene", que es todo
    // opcional. Un departamento sin gimnasio ni parrilla es un aviso
    // perfectamente válido.
    expect(faltan).toHaveLength(7);
    expect(faltan).not.toContain('caracteristicas');
    expect(faltan).not.toContain('vista-previa');
    expect(faltan).not.toContain('envio');
  });

  it('un aviso completo no tiene pasos pendientes', () => {
    expect(pasosIncompletos(COMPLETO)).toEqual([]);
    expect(sePuedeEnviar(COMPLETO)).toBe(true);
  });

  it('cada paso se valida por su cuenta', () => {
    // Se puede tener el precio listo aunque falten las fotos: esa es la
    // razón de dividir la validación por pasos.
    const aMedias: BorradorDeAviso = { moneda: 'USD', precio: 195000 };
    expect(revisarPaso('precio', aMedias).completo).toBe(true);
    expect(revisarPaso('fotos', aMedias).completo).toBe(false);
  });

  it('los errores vienen por campo, para poder mostrarlos donde van', () => {
    const revision = revisarPaso('descripcion', { titulo: 'Corto', descripcion: 'Poco' });
    expect(revision.completo).toBe(false);
    expect(revision.errores.titulo).toMatch(/10 caracteres/);
    expect(revision.errores.descripcion).toMatch(/40 caracteres/);
  });

  it('la vista previa y el envío nunca bloquean', () => {
    expect(revisarPaso('vista-previa', {}).completo).toBe(true);
    expect(revisarPaso('envio', {}).completo).toBe(true);
  });
});

describe('no se puede enviar a medias', () => {
  it('sin las fotos mínimas', () => {
    const dos = { ...COMPLETO, fotos: COMPLETO.fotos!.slice(0, 2) };
    expect(sePuedeEnviar(dos)).toBe(false);
    expect(revisarPaso('fotos', dos).errores.fotos).toMatch(
      new RegExp(`${FOTOS_MINIMAS} fotos`),
    );
  });

  it('sin precio', () => {
    expect(sePuedeEnviar({ ...COMPLETO, precio: undefined })).toBe(false);
  });

  it('sin dirección', () => {
    expect(sePuedeEnviar({ ...COMPLETO, direccion: '' })).toBe(false);
  });

  it('con un celular que no es peruano', () => {
    expect(sePuedeEnviar({ ...COMPLETO, celular: '014567890' })).toBe(false);
  });

  it('con área techada mayor que la total', () => {
    // La base tiene la misma restricción; acá se avisa antes de enviar.
    const mal = { ...COMPLETO, areaTotal: 80, areaTechada: 120 };
    expect(revisarPaso('areas', mal).errores.areaTechada).toMatch(/no puede ser mayor/);
    expect(sePuedeEnviar(mal)).toBe(false);
  });

  it('con un tipo de propiedad inventado', () => {
    expect(sePuedeEnviar({ ...COMPLETO, tipo: 'castillo' })).toBe(false);
  });

  it('el esquema completo acepta el aviso entero', () => {
    expect(esquemaDeAviso.safeParse(COMPLETO).success).toBe(true);
  });
});

describe('fotos', () => {
  const foto = (extra: Partial<{ name: string; size: number; type: string }> = {}) => ({
    name: 'sala.jpg',
    size: 2_400_000,
    type: 'image/jpeg',
    ...extra,
  });

  it('acepta una foto de celular', () => {
    expect(revisarFoto(foto())).toEqual({ ok: true });
  });

  it('rechaza lo que pasa de 15 MB', () => {
    const revision = revisarFoto(foto({ size: PESO_MAXIMO_FOTO + 1 }));
    expect(revision.ok).toBe(false);
    if (!revision.ok) expect(revision.error).toContain('15 MB');
  });

  it('rechaza un archivo vacío y uno que no es imagen', () => {
    expect(revisarFoto(foto({ size: 0 })).ok).toBe(false);
    expect(revisarFoto(foto({ name: 'plano.pdf', type: 'application/pdf' })).ok).toBe(false);
  });

  it('nombra el archivo en el error, para saber cuál falló', () => {
    const revision = revisarFoto(foto({ name: 'terraza.pdf', type: 'application/pdf' }));
    if (!revision.ok) expect(revision.error).toContain('terraza.pdf');
  });

  it('guarda cada foto en la carpeta de su aviso', () => {
    const ruta = rutaDeFoto('c0000001-0000-4000-8000-000000000001', 1_755_000_000_000);
    expect(ruta.split('/')[0]).toBe('c0000001-0000-4000-8000-000000000001');
    expect(ruta).toMatch(/\.webp$/);
  });

  it('el original va a su propia subcarpeta', () => {
    // La política de storage no deja borrar nada dentro de "original".
    const ruta = rutaDeFoto('abc', 1, true);
    expect(ruta).toBe('abc/original/1.bin');
    expect(ruta.split('/')[1]).toBe('original');
  });

  it('no reutiliza el nombre del archivo que subieron', () => {
    // Un nombre como "../../otro/foto.jpg" saldría de la carpeta.
    const ruta = rutaDeFoto('abc', 1);
    expect(ruta).not.toContain('..');
  });

  it('permite hasta treinta fotos', () => {
    const muchas = Array.from({ length: FOTOS_MAXIMAS + 1 }, (_, i) => ({
      id: String(i),
      url: `https://ejemplo.pe/${i}.webp`,
      portada: i === 0,
    }));
    expect(revisarPaso('fotos', { ...COMPLETO, fotos: muchas }).completo).toBe(false);
  });
});

describe('punto público del aviso', () => {
  const centro = { lat: -12.1211, lon: -77.0298 };

  it('desplaza el punto unos 300 metros', () => {
    const movido = desplazarPunto(centro, 'un-aviso');

    // Distancia aproximada en metros, con la corrección por latitud.
    const dNorte = (movido.lat - centro.lat) * 111_320;
    const dEste = (movido.lon - centro.lon) * 111_320 * Math.cos((centro.lat * Math.PI) / 180);
    const distancia = Math.hypot(dNorte, dEste);

    expect(distancia).toBeGreaterThan(DESPLAZAMIENTO_M - 5);
    expect(distancia).toBeLessThan(DESPLAZAMIENTO_M + 5);
  });

  it('el mismo aviso da siempre el mismo punto', () => {
    // Si el desplazamiento fuera al azar, bastaría recargar diez veces y
    // promediar los puntos para obtener la dirección exacta.
    expect(desplazarPunto(centro, 'aviso-a')).toEqual(desplazarPunto(centro, 'aviso-a'));
  });

  it('dos avisos distintos se desplazan hacia lados distintos', () => {
    const a = desplazarPunto(centro, 'aviso-a');
    const b = desplazarPunto(centro, 'aviso-b');
    expect(a).not.toEqual(b);
  });

  it('el punto desplazado nunca coincide con el real', () => {
    for (const semilla of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const movido = desplazarPunto(centro, semilla);
      expect(movido.lat === centro.lat && movido.lon === centro.lon).toBe(false);
    }
  });

  it('conoce los distritos donde más se publica', () => {
    expect(centroDeDistrito('Miraflores').lat).toBeCloseTo(-12.1211, 3);
    expect(centroDeDistrito('miraflores')).toEqual(centroDeDistrito('Miraflores'));
    expect(centroDeDistrito('Jesús María').lat).toBeCloseTo(-12.0742, 3);
  });

  it('cae en el centro de Lima si no conoce el distrito', () => {
    expect(centroDeDistrito('Villa Inventada')).toEqual({ lat: -12.0464, lon: -77.0428 });
  });
});
