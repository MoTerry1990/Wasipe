import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ACERCAMIENTO_MAXIMO,
  AVISO_DE_VIDEO,
  CLAVES_DE_FORMATO,
  CLAVES_DE_PLANTILLA,
  DIAS_DE_VIGENCIA,
  ETIQUETA_VIDEO,
  FORMATOS,
  MOVIMIENTOS,
  MOVIMIENTOS_PROHIBIDOS,
  PLANTILLAS,
  areaSegura,
  armarGuion,
  armarNarracion,
  esFormato,
  esPlantilla,
  fichaCorta,
  huellaDeVideo,
  lineasNecesarias,
  movimientoValido,
  puedeMarcarInmobiliaria,
  recortarParaFormato,
  rutaDeVideo,
  textoEntraEnZonaSegura,
  TIPOGRAFIA,
  type DatosDelVideo,
} from '@/lib/ia/video';
import { leerEstado } from '@/lib/ia/proveedores/video-http';
import { proveedorVideoNinguno } from '@/lib/ia/proveedores/ninguno';
import { FallaDeProveedor, VIDEO_NO_DISPONIBLE } from '@/lib/ia/proveedor';
import {
  proveedorDeVideo,
  videoDisponible,
  olvidarProveedor,
  PROVEEDORES_DE_VIDEO,
} from '@/lib/ia/registro';

/**
 * Video automático: lo que promete y lo que no.
 *
 * Dos cosas se comprueban con especial insistencia: que la narración no
 * pueda decir nada que no esté en el aviso, y que el texto entre en la
 * zona segura de los tres formatos. Lo primero es honestidad; lo segundo
 * es que el video sirva para algo cuando lo suban a Instagram.
 */

const AVISO: DatosDelVideo = {
  titulo: 'Departamento de 92 m² a dos cuadras del parque Kennedy',
  distrito: 'Miraflores',
  provincia: 'Lima',
  operacion: 'sale',
  tipo: 'apartment',
  moneda: 'USD',
  precio: 185_000,
  areaTotal: 92,
  dormitorios: 3,
  banos: 2,
  cocheras: 1,
  fotos: [
    { url: 'https://ejemplo/1.webp', etiqueta: null },
    { url: 'https://ejemplo/2.webp', etiqueta: null },
    { url: 'https://ejemplo/3.webp', etiqueta: 'Imagen modificada con Wasi AI' },
    { url: 'https://ejemplo/4.webp', etiqueta: null },
  ],
  contacto: { nombre: 'Rosa Quispe', whatsapp: '987654321' },
};

// ---------------------------------------------------------------------
// Formatos
// ---------------------------------------------------------------------

describe('los tres formatos', () => {
  it('están los tres y ninguno más', () => {
    expect(CLAVES_DE_FORMATO).toEqual(['vertical', 'square', 'horizontal']);
    expect(esFormato('vertical')).toBe(true);
    expect(esFormato('panoramico')).toBe(false);
  });

  it('cada uno tiene la relación de aspecto que dice tener', () => {
    expect(FORMATOS.vertical.ancho / FORMATOS.vertical.alto).toBeCloseTo(9 / 16, 3);
    expect(FORMATOS.square.ancho / FORMATOS.square.alto).toBeCloseTo(1, 3);
    expect(FORMATOS.horizontal.ancho / FORMATOS.horizontal.alto).toBeCloseTo(16 / 9, 3);
  });

  it('la zona segura cabe dentro del lienzo', () => {
    for (const clave of CLAVES_DE_FORMATO) {
      const zona = areaSegura(clave);
      const f = FORMATOS[clave];
      expect(zona.ancho).toBeGreaterThan(0);
      expect(zona.alto).toBeGreaterThan(0);
      expect(zona.x + zona.ancho).toBeLessThanOrEqual(f.ancho);
      expect(zona.y + zona.alto).toBeLessThanOrEqual(f.alto);
    }
  });

  it('en vertical el margen de abajo es el grande: ahí pinta la red social', () => {
    // Nombre de cuenta, descripción y botones tapan el pie del video.
    expect(FORMATOS.vertical.seguro.abajo).toBeGreaterThan(FORMATOS.vertical.seguro.arriba);
    expect(FORMATOS.vertical.seguro.abajo).toBeGreaterThan(FORMATOS.square.seguro.abajo);
  });
});

// ---------------------------------------------------------------------
// El texto entra
// ---------------------------------------------------------------------

describe('el texto no se sale de la zona segura', () => {
  it.each(CLAVES_DE_FORMATO)('en %s, con un aviso normal', (formato) => {
    const guion = armarGuion(AVISO, { formato, plantilla: 'modern' });
    for (const escena of guion.escenas) {
      expect(textoEntraEnZonaSegura(escena, formato)).toBe(true);
    }
  });

  it.each(CLAVES_DE_FORMATO)('en %s, con las cuatro plantillas', (formato) => {
    for (const plantilla of CLAVES_DE_PLANTILLA) {
      const guion = armarGuion(AVISO, { formato, plantilla });
      for (const escena of guion.escenas) {
        expect(textoEntraEnZonaSegura(escena, formato)).toBe(true);
      }
    }
  });

  it('un título larguísimo se recorta antes de desbordar', () => {
    const largo = 'Departamento amplio y luminoso '.repeat(8);
    const recortado = recortarParaFormato(largo, TIPOGRAFIA.vertical.titulo, 'vertical');

    expect(recortado.length).toBeLessThan(largo.length);
    expect(recortado.endsWith('…')).toBe(true);
    expect(
      lineasNecesarias(recortado, TIPOGRAFIA.vertical.titulo, 'vertical'),
    ).toBeLessThanOrEqual(2);
  });

  it('y un texto imposible se detecta en vez de pasar de largo', () => {
    const imposible = {
      tipo: 'foto' as const,
      url: 'x',
      segundos: 3,
      movimiento: 'fijo' as const,
      escala: 1,
      texto: ['A'.repeat(600)],
      etiquetaIA: null,
    };
    expect(textoEntraEnZonaSegura(imposible, 'vertical')).toBe(false);
  });
});

// ---------------------------------------------------------------------
// La cámara no recorre el inmueble
// ---------------------------------------------------------------------

describe('el movimiento de cámara', () => {
  it('solo hay tres, y ninguno recorre nada', () => {
    expect(MOVIMIENTOS).toEqual(['fijo', 'acercar', 'alejar']);
  });

  it('el acercamiento tiene tope, para que no parezca una toma en movimiento', () => {
    expect(ACERCAMIENTO_MAXIMO).toBeLessThanOrEqual(1.1);
    expect(movimientoValido('acercar', ACERCAMIENTO_MAXIMO)).toBe(true);
    expect(movimientoValido('acercar', 1.4)).toBe(false);
  });

  it('un paneo o un recorrido no son movimientos válidos', () => {
    expect(movimientoValido('paneo', 1)).toBe(false);
    expect(movimientoValido('recorrido', 1)).toBe(false);
    expect(movimientoValido('parallax', 1)).toBe(false);
  });

  it('las plantillas se quedan dentro del tope', () => {
    for (const plantilla of CLAVES_DE_PLANTILLA) {
      const guion = armarGuion(AVISO, { formato: 'vertical', plantilla });
      for (const escena of guion.escenas) {
        if (escena.tipo !== 'foto') continue;
        expect(movimientoValido(escena.movimiento, escena.escala)).toBe(true);
      }
    }
  });

  it('y se le explica a la persona por qué', () => {
    expect(MOVIMIENTOS_PROHIBIDOS.join(' ')).toMatch(/eso no lo verificó nadie/i);
    expect(AVISO_DE_VIDEO).toMatch(/La cámara no recorre el inmueble/);
  });
});

// ---------------------------------------------------------------------
// La narración solo dice lo que el aviso dice
// ---------------------------------------------------------------------

describe('la narración', () => {
  const texto = armarNarracion(AVISO);

  it('dice el tipo, la operación y el distrito', () => {
    expect(texto).toContain('Departamento');
    expect(texto).toContain('en venta');
    expect(texto).toContain('Miraflores');
  });

  it('dice el área, los ambientes y el precio, con el formato del Perú', () => {
    expect(texto).toContain('92 m²');
    expect(texto).toContain('3 dormitorios');
    expect(texto).toContain('2 baños');
    expect(texto).toContain('US$ 185,000');
    expect(texto).not.toContain('USD 185');
  });

  it('no dice ni un adjetivo de venta', () => {
    for (const palabra of [
      'excelente',
      'increíble',
      'oportunidad',
      'tranquil',
      'seguro',
      'lujo',
      'ideal',
      'único',
    ]) {
      expect(texto.toLowerCase()).not.toContain(palabra);
    }
  });

  it('un dato que falta simplemente no aparece: no se rellena', () => {
    const sinAmbientes = armarNarracion({
      ...AVISO,
      dormitorios: null,
      banos: null,
      cocheras: null,
    });
    expect(sinAmbientes).not.toContain('dormitorio');
    expect(sinAmbientes).not.toContain('baño');
    expect(sinAmbientes).toContain('92 m²');
  });

  it('el alquiler se narra como alquiler, no como venta', () => {
    const alquiler = armarNarracion({
      ...AVISO,
      operacion: 'rent',
      moneda: 'PEN',
      precio: 2500,
    });
    expect(alquiler).toContain('en alquiler');
    expect(alquiler).toContain('Alquiler: S/ 2,500 mensuales');
  });

  it('el singular y el plural están bien', () => {
    const uno = armarNarracion({ ...AVISO, dormitorios: 1, banos: 1, cocheras: 1 });
    expect(uno).toContain('1 dormitorio,');
    expect(uno).toContain('1 baño,');
    expect(uno).toContain('1 cochera');
    expect(uno).not.toContain('1 dormitorios');
  });

  it('cada cifra que dice sale de un campo del aviso', () => {
    // Toda cifra de la narración tiene que estar entre las del aviso.
    // Sin arrastrar el punto final de la frase: "185,000." no es una cifra.
    const cifras = texto.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
    const permitidas = new Set(['92', '3', '2', '1', '185,000']);
    for (const cifra of cifras) expect(permitidas.has(cifra)).toBe(true);
  });

  it('la plantilla mínima va sin narración', () => {
    const guion = armarGuion(AVISO, { formato: 'square', plantilla: 'minimal' });
    expect(guion.narracion).toBe('');
  });
});

// ---------------------------------------------------------------------
// El guion
// ---------------------------------------------------------------------

describe('el guion', () => {
  it('es determinista: la vista previa es lo que se va a renderizar', () => {
    const a = armarGuion(AVISO, { formato: 'vertical', plantilla: 'modern' });
    const b = armarGuion(AVISO, { formato: 'vertical', plantilla: 'modern' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('muestra el título, el precio, el distrito y la ficha', () => {
    const guion = armarGuion(AVISO, { formato: 'vertical', plantilla: 'modern' });
    const todo = guion.escenas.flatMap((e) => e.texto).join(' | ');

    expect(todo).toContain(AVISO.titulo);
    expect(todo).toContain('US$ 185,000');
    expect(todo).toContain('Miraflores');
    expect(todo).toContain('3 dorm.');
    expect(todo).toContain('2 baños');
    expect(todo).toContain('92 m²');
  });

  it('termina con una llamada a contactar', () => {
    const guion = armarGuion(AVISO, { formato: 'square', plantilla: 'modern' });
    const cierre = guion.escenas.at(-1)!;
    expect(cierre.tipo).toBe('cierre');
    if (cierre.tipo !== 'cierre') return;
    expect(cierre.llamada).toContain('WhatsApp');
    expect(cierre.marca).toBe('Wasipe');
  });

  it('sin WhatsApp, la llamada cambia en vez de prometer un canal que no hay', () => {
    const guion = armarGuion(
      { ...AVISO, contacto: { nombre: 'Rosa', whatsapp: null } },
      { formato: 'square', plantilla: 'modern' },
    );
    const cierre = guion.escenas.at(-1)!;
    if (cierre.tipo !== 'cierre') return;
    expect(cierre.llamada).not.toContain('WhatsApp');
  });

  it('la marca de la inmobiliaria aparece cuando corresponde', () => {
    const guion = armarGuion(
      { ...AVISO, inmobiliaria: { nombre: 'Inmobiliaria Lima Sur', logo: null } },
      { formato: 'square', plantilla: 'premium' },
    );
    const cierre = guion.escenas.at(-1)!;
    if (cierre.tipo !== 'cierre') return;
    expect(cierre.marca).toBe('Inmobiliaria Lima Sur');
  });

  it('y solo con los planes que la incluyen', () => {
    expect(puedeMarcarInmobiliaria('agencia')).toBe(true);
    expect(puedeMarcarInmobiliaria('corporativo')).toBe(true);
    expect(puedeMarcarInmobiliaria('gratis')).toBe(false);
    expect(puedeMarcarInmobiliaria(null)).toBe(false);
    expect(puedeMarcarInmobiliaria(undefined)).toBe(false);
  });

  it('respeta el tope de fotos de cada plantilla', () => {
    const muchas = {
      ...AVISO,
      fotos: Array.from({ length: 30 }, (_, i) => ({ url: `${i}`, etiqueta: null })),
    };
    for (const plantilla of CLAVES_DE_PLANTILLA) {
      const guion = armarGuion(muchas, { formato: 'vertical', plantilla });
      const fotos = guion.escenas.filter((e) => e.tipo === 'foto');
      expect(fotos.length).toBeLessThanOrEqual(PLANTILLAS[plantilla].fotosMaximas);
    }
  });

  it('arrastra la etiqueta de las fotos hechas con IA', () => {
    const guion = armarGuion(AVISO, { formato: 'vertical', plantilla: 'modern' });
    const conEtiqueta = guion.escenas.filter((e) => e.tipo === 'foto' && e.etiquetaIA !== null);
    expect(conEtiqueta).toHaveLength(1);
  });

  it('los subtítulos van uno por escena', () => {
    const guion = armarGuion(AVISO, { formato: 'vertical', plantilla: 'modern' });
    expect(guion.subtitulos).toHaveLength(guion.escenas.length);
  });

  it('y se pueden apagar', () => {
    const guion = armarGuion(AVISO, {
      formato: 'vertical',
      plantilla: 'modern',
      subtitulos: false,
    });
    expect(guion.subtitulos).toHaveLength(0);
  });

  it('el reel es corto de verdad', () => {
    const guion = armarGuion(AVISO, { formato: 'vertical', plantilla: 'reel' });
    expect(guion.segundosTotales).toBeLessThan(20);
  });

  it('la ficha corta se lee de un vistazo', () => {
    expect(fichaCorta(AVISO)).toBe('3 dorm. · 2 baños · 1 cochera · 92 m²');
  });
});

describe('las cuatro plantillas', () => {
  it('están las cuatro', () => {
    expect(CLAVES_DE_PLANTILLA).toEqual(['modern', 'premium', 'minimal', 'reel']);
    expect(esPlantilla('modern')).toBe(true);
    expect(esPlantilla('cinematica')).toBe(false);
  });

  it('la mínima no lleva música ni narración', () => {
    expect(PLANTILLAS.minimal.musica).toBe('');
    expect(PLANTILLAS.minimal.narracionPorDefecto).toBe(false);
  });

  it('cada una cuesta algo y la premium cuesta más', () => {
    for (const plantilla of CLAVES_DE_PLANTILLA) {
      expect(PLANTILLAS[plantilla].costo).toBeGreaterThan(0);
    }
    expect(PLANTILLAS.premium.costo).toBeGreaterThan(PLANTILLAS.minimal.costo);
  });
});

// ---------------------------------------------------------------------
// Idempotencia, rutas y vigencia
// ---------------------------------------------------------------------

describe('la huella y las rutas', () => {
  it('el mismo pedido da la misma huella', () => {
    expect(huellaDeVideo('p1', 'vertical', 'modern', true)).toBe(
      huellaDeVideo('p1', 'vertical', 'modern', true),
    );
  });

  it('otro formato, otra plantilla u otra narración son pedidos distintos', () => {
    const base = huellaDeVideo('p1', 'vertical', 'modern', true);
    expect(base).not.toBe(huellaDeVideo('p1', 'square', 'modern', true));
    expect(base).not.toBe(huellaDeVideo('p1', 'vertical', 'reel', true));
    expect(base).not.toBe(huellaDeVideo('p1', 'vertical', 'modern', false));
  });

  it('el archivo va a la carpeta del aviso', () => {
    expect(rutaDeVideo('aviso-1', 1755000000000)).toBe('aviso-1/1755000000000.mp4');
  });

  it('los videos caducan: un precio viejo circulando es un problema', () => {
    expect(DIAS_DE_VIGENCIA).toBeGreaterThan(0);
    expect(DIAS_DE_VIGENCIA).toBeLessThanOrEqual(180);
  });

  it('el video lleva su etiqueta de transparencia', () => {
    expect(ETIQUETA_VIDEO).toBe('Video generado con Wasi AI');
  });
});

// ---------------------------------------------------------------------
// El proveedor
// ---------------------------------------------------------------------

describe('elegir el proveedor de video', () => {
  const original = { ...process.env };

  beforeEach(() => olvidarProveedor());
  afterEach(() => {
    process.env = { ...original };
    olvidarProveedor();
    vi.restoreAllMocks();
  });

  it('se elige aparte del de texto y del de imagen', () => {
    expect(PROVEEDORES_DE_VIDEO).toContain('http');
    expect(PROVEEDORES_DE_VIDEO).toContain('ninguno');
  });

  it('sin configurar nada, el video queda apagado', () => {
    delete process.env.IA_PROVEEDOR_VIDEO;
    delete process.env.IA_VIDEO_URL;
    expect(videoDisponible()).toBe(false);
  });

  it('un nombre inventado lo apaga en vez de tumbar la aplicación', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.IA_PROVEEDOR_VIDEO = 'no-existe';
    expect(() => proveedorDeVideo()).not.toThrow();
    expect(videoDisponible()).toBe(false);
  });

  it('con endpoint queda disponible y se le puede limitar qué sabe hacer', () => {
    process.env.IA_PROVEEDOR_VIDEO = 'http';
    process.env.IA_VIDEO_URL = 'https://ejemplo.pe/video';
    process.env.IA_VIDEO_FORMATOS = 'vertical,square';
    process.env.IA_VIDEO_PLANTILLAS = 'modern';

    const proveedor = proveedorDeVideo();
    expect(proveedor.disponible()).toBe(true);
    expect(proveedor.soporta('vertical', 'modern')).toBe(true);
    expect(proveedor.soporta('horizontal', 'modern')).toBe(false);
    expect(proveedor.soporta('vertical', 'reel')).toBe(false);
  });
});

describe('el proveedor de video apagado', () => {
  it('no encola nada y lo dice en castellano', async () => {
    const proveedor = proveedorVideoNinguno();
    expect(proveedor.disponible()).toBe(false);
    expect(proveedor.soporta('vertical', 'modern')).toBe(false);

    await expect(
      proveedor.encolar({
        guion: {},
        formato: 'vertical',
        plantilla: 'modern',
        ancho: 1080,
        alto: 1920,
        idempotencia: 'x',
      }),
    ).rejects.toThrow(VIDEO_NO_DISPONIBLE);
  });

  it('el mensaje ofrece compartir el aviso', () => {
    expect(VIDEO_NO_DISPONIBLE).toMatch(/compartir el enlace de tu aviso/i);
  });
});

describe('leer el estado del render', () => {
  it('mientras trabaja, informa el avance', () => {
    const estado = leerEstado({ estado: 'trabajando', progreso: 42 });
    expect(estado).toEqual({ estado: 'trabajando', progreso: 42 });
  });

  it('nunca llega a 100 sin estar listo', () => {
    const estado = leerEstado({ estado: 'trabajando', progreso: 140 });
    if (estado.estado !== 'trabajando') return;
    expect(estado.progreso).toBe(99);
  });

  it('un avance que no es número no rompe la barra', () => {
    const estado = leerEstado({ estado: 'trabajando', progreso: 'casi' });
    if (estado.estado !== 'trabajando') return;
    expect(estado.progreso).toBe(0);
  });

  it('listo trae el archivo, la duración y el costo', () => {
    const estado = leerEstado({
      estado: 'listo',
      video: { url: 'https://ejemplo/v.mp4', tipo: 'video/mp4', bytes: 900 },
      duracion_ms: 27000,
      costo_micros: 34000,
    });
    if (estado.estado !== 'listo') return;
    expect(estado.video.url).toBe('https://ejemplo/v.mp4');
    expect(estado.duracionMs).toBe(27000);
    expect(estado.costoMicros).toBe(34000);
  });

  it('listo sin archivo es una falla, no un video', () => {
    expect(() => leerEstado({ estado: 'listo', video: {} })).toThrow(FallaDeProveedor);
  });

  it('una falla sin detalle se reintenta igual', () => {
    const estado = leerEstado({ estado: 'falla' });
    if (estado.estado !== 'falla') return;
    expect(estado.reintentable).toBe(true);
  });

  it('y una que dice que no, no', () => {
    const estado = leerEstado({
      estado: 'falla',
      detalle: 'guion inválido',
      reintentable: false,
    });
    if (estado.estado !== 'falla') return;
    expect(estado.reintentable).toBe(false);
    expect(estado.detalle).toBe('guion inválido');
  });
});
