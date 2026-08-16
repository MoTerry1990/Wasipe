import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  OPERACIONES,
  armarPeticion,
  datosParaElModelo,
  datosSuficientes,
  esOperacion,
  huellaDelPedido,
  interpretar,
  limpiar,
  sugerenciaUtil,
  AVISO_REVISION,
} from '@/lib/ia/asistente';
import { proveedorNinguno } from '@/lib/ia/proveedores/ninguno';
import { FallaDeProveedor, IA_NO_DISPONIBLE } from '@/lib/ia/proveedor';
import { proveedorDeIA, iaDisponible, olvidarProveedor, PROVEEDORES } from '@/lib/ia/registro';
import type { BorradorDeAviso } from '@/lib/validacion/aviso';

/**
 * Wasi AI: la parte que no depende de ninguna empresa de IA.
 *
 * Lo que se comprueba acá es el contrato del producto: que se pueda
 * cambiar de proveedor, que sin proveedor nada explote, que al modelo no
 * se le manden datos personales y que las seis prohibiciones estén
 * escritas en las instrucciones.
 */

const AVISO: BorradorDeAviso = {
  operacion: 'sale',
  tipo: 'departamento',
  departamento: 'Lima',
  provincia: 'Lima',
  distrito: 'Miraflores',
  direccion: 'Calle Berlín 245, dpto. 502',
  referencia: 'Frente a la bodega de la esquina',
  celular: '987654321',
  moneda: 'USD',
  precio: 185_000,
  areaTotal: 92,
  areaTechada: 88,
  dormitorios: 3,
  banos: 2,
  cocheras: 1,
  amoblado: 'none',
  caracteristicas: ['ascensor', 'deposito'],
  contacto: 'whatsapp',
};

// ---------------------------------------------------------------------
// Registro de proveedores
// ---------------------------------------------------------------------

describe('elegir el proveedor', () => {
  const original = { ...process.env };

  beforeEach(() => {
    olvidarProveedor();
  });

  afterEach(() => {
    process.env = { ...original };
    olvidarProveedor();
    vi.restoreAllMocks();
  });

  it('hay más de una opción y ninguna está incrustada en el código', () => {
    expect(PROVEEDORES).toContain('anthropic');
    expect(PROVEEDORES).toContain('ninguno');
  });

  it('se cambia con una variable de entorno', () => {
    process.env.IA_PROVEEDOR = 'ninguno';
    expect(proveedorDeIA().nombre).toBe('ninguno');
  });

  it('un nombre inventado apaga Wasi AI en vez de tumbar la aplicación', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.IA_PROVEEDOR = 'proveedor-que-no-existe';

    expect(() => proveedorDeIA()).not.toThrow();
    expect(iaDisponible()).toBe(false);
  });

  it('sin clave, el proveedor queda apagado', () => {
    process.env.IA_PROVEEDOR = 'anthropic';
    delete process.env.ANTHROPIC_API_KEY;
    expect(iaDisponible()).toBe(false);
  });

  it('con clave, queda disponible', () => {
    process.env.IA_PROVEEDOR = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'sk-de-mentira-para-la-prueba';
    expect(iaDisponible()).toBe(true);
  });
});

describe('el proveedor apagado', () => {
  it('falla con un mensaje que se le puede mostrar a la persona', async () => {
    const proveedor = proveedorNinguno();
    expect(proveedor.disponible()).toBe(false);

    await expect(
      proveedor.generarTexto({ sistema: '', mensajes: [], maximoTokens: 10 }),
    ).rejects.toThrow(IA_NO_DISPONIBLE);
  });

  it('y avisa que no vale la pena reintentar', async () => {
    try {
      await proveedorNinguno('motivo').generarTexto({
        sistema: '',
        mensajes: [],
        maximoTokens: 10,
      });
      expect.unreachable('tenía que fallar');
    } catch (error) {
      expect(error).toBeInstanceOf(FallaDeProveedor);
      expect((error as FallaDeProveedor).reintentable).toBe(false);
      expect((error as FallaDeProveedor).detalle).toBe('motivo');
    }
  });
});

// ---------------------------------------------------------------------
// Qué se le manda al modelo
// ---------------------------------------------------------------------

describe('los datos que salen hacia el modelo', () => {
  const ficha = datosParaElModelo(AVISO);

  it('llevan lo que sirve para redactar', () => {
    expect(ficha).toContain('Miraflores');
    expect(ficha).toContain('Departamento');
    expect(ficha).toContain('92 m²');
    expect(ficha).toContain('US$ 185,000');
    expect(ficha).toContain('Ascensor');
  });

  it('nunca llevan la dirección exacta ni el celular', () => {
    expect(ficha).not.toContain('Berlín');
    expect(ficha).not.toContain('245');
    expect(ficha).not.toContain('987654321');
    expect(ficha).not.toContain('bodega');
  });

  it('no inventan campos que la persona no llenó', () => {
    const flaco = datosParaElModelo({ operacion: 'rent', distrito: 'Surco' });
    expect(flaco).toContain('Surco');
    expect(flaco).not.toContain('Dormitorios');
    expect(flaco).not.toContain('Precio');
  });

  it('un borrador vacío no rompe nada', () => {
    expect(datosParaElModelo({})).toContain('Todavía no cargó');
  });
});

describe('cuándo se ofrece el asistente', () => {
  it('con lo mínimo para escribir algo', () => {
    expect(datosSuficientes(AVISO)).toBe(true);
  });

  it('y no antes', () => {
    expect(datosSuficientes({ operacion: 'sale', tipo: 'departamento' })).toBe(false);
    expect(datosSuficientes({})).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Las prohibiciones
// ---------------------------------------------------------------------

describe('lo que el modelo tiene prohibido afirmar', () => {
  const sistema = armarPeticion('descripcion', AVISO).sistema;

  it.each([
    ['titularidad legal', /saneada|título inscrito|partida registral|gravámenes/i],
    ['estado estructural', /humedad|rajaduras|buen estado/i],
    ['medidas exactas', /no estimes metros/i],
    ['seguridad de la zona', /zona es segura|delincuencia/i],
    ['licencias y permisos', /licencia de construcción|conformidad de obra/i],
    ['comodidades no declaradas', /no agregues ascensor|no esté en la lista/i],
  ])('%s está prohibida explícitamente', (_titulo, patron) => {
    expect(sistema).toMatch(patron);
  });

  it('la regla de no deducir es la principal', () => {
    expect(sistema).toMatch(/ÚNICAMENTE con los datos que te paso/);
    expect(sistema).toMatch(/No deduces, no completas/);
  });

  it('las instrucciones van en español peruano', () => {
    expect(sistema).toContain('departamento');
    expect(sistema).toContain('cochera');
    expect(sistema).toContain('S/ 450,000');
    expect(sistema).toContain('US$ 120,000');
    expect(sistema).not.toContain('USD 120');
  });
});

describe('armar el pedido', () => {
  it('cada operación pide algo distinto y respeta su tope', () => {
    for (const clave of ['titulo', 'descripcion', 'mejorar'] as const) {
      const peticion = armarPeticion(clave, { ...AVISO, descripcion: 'x'.repeat(60) });
      expect(peticion.maximoTokens).toBe(OPERACIONES[clave].maximoTokens);
      expect(peticion.mensajes).toHaveLength(1);
      expect(peticion.mensajes[0]?.rol).toBe('usuario');
    }
  });

  it('mejorar le pasa al modelo el texto que ya escribió la persona', () => {
    const peticion = armarPeticion('mejorar', {
      ...AVISO,
      descripcion: 'depa lindo en miraflores CON VISTA',
    });
    expect(peticion.mensajes[0]?.texto).toContain('depa lindo en miraflores CON VISTA');
  });

  it('reconoce las operaciones válidas y rechaza el resto', () => {
    expect(esOperacion('titulo')).toBe(true);
    expect(esOperacion('descripcion')).toBe(true);
    expect(esOperacion('borrar_todo')).toBe(false);
    expect(esOperacion('toString')).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Idempotencia
// ---------------------------------------------------------------------

describe('la huella del pedido', () => {
  it('dos pedidos iguales dan la misma huella', () => {
    expect(huellaDelPedido('titulo', AVISO)).toBe(huellaDelPedido('titulo', { ...AVISO }));
  });

  it('cambiar un dato del aviso la cambia', () => {
    expect(huellaDelPedido('titulo', AVISO)).not.toBe(
      huellaDelPedido('titulo', { ...AVISO, precio: 190_000 }),
    );
  });

  it('cambiar de operación también', () => {
    expect(huellaDelPedido('titulo', AVISO)).not.toBe(huellaDelPedido('descripcion', AVISO));
  });

  it('cambiar la dirección no, porque no se le manda al modelo', () => {
    expect(huellaDelPedido('titulo', AVISO)).toBe(
      huellaDelPedido('titulo', { ...AVISO, direccion: 'Otra calle 999' }),
    );
  });
});

// ---------------------------------------------------------------------
// Lo que vuelve del modelo
// ---------------------------------------------------------------------

describe('limpiar la respuesta', () => {
  it('quita markdown, viñetas y numeración', () => {
    const sucio = '```\n1. **Departamento** en Miraflores\n- con ascensor\n```';
    const limpio = limpiar(sucio);
    expect(limpio).not.toContain('```');
    expect(limpio).not.toContain('**');
    expect(limpio).not.toMatch(/^[-*]/m);
    expect(limpio).not.toMatch(/^\d+\./m);
    expect(limpio).toContain('Departamento');
  });

  it('quita las comillas que envuelven una línea entera', () => {
    expect(limpiar('"Departamento de 92 m² en Miraflores"')).toBe(
      'Departamento de 92 m² en Miraflores',
    );
  });
});

describe('interpretar la respuesta', () => {
  it('los títulos salen como opciones, hasta tres', () => {
    const sugerencia = interpretar(
      'titulo',
      'Departamento de 92 m² en Miraflores\nDepa de 3 dormitorios en Miraflores\nDepartamento con cochera en Miraflores\nUno de más',
    );
    expect(sugerencia.tipo).toBe('titulos');
    if (sugerencia.tipo !== 'titulos') return;
    expect(sugerencia.opciones).toHaveLength(3);
  });

  it('un título larguísimo se recorta al máximo del formulario', () => {
    const sugerencia = interpretar('titulo', 'D'.repeat(400));
    if (sugerencia.tipo !== 'titulos') return;
    expect(sugerencia.opciones[0]?.length).toBeLessThanOrEqual(120);
  });

  it('una descripción larguísima también', () => {
    const sugerencia = interpretar('descripcion', 'x'.repeat(9000));
    if (sugerencia.tipo !== 'texto') return;
    expect(sugerencia.texto.length).toBeLessThanOrEqual(6000);
  });

  it('una respuesta vacía no se muestra: es una falla', () => {
    expect(sugerenciaUtil(interpretar('titulo', ''))).toBe(false);
    expect(sugerenciaUtil(interpretar('descripcion', 'muy corto'))).toBe(false);
    expect(sugerenciaUtil(interpretar('descripcion', 'x'.repeat(200)))).toBe(true);
  });
});

// ---------------------------------------------------------------------
// El aviso a la vista
// ---------------------------------------------------------------------

describe('lo que se le dice a la persona', () => {
  it('el aviso deja claro que hay que revisar y que nada se publica solo', () => {
    expect(AVISO_REVISION).toMatch(/Revísalo/);
    expect(AVISO_REVISION).toMatch(/nada se publica sin tu confirmación/i);
  });

  it('el mensaje de caída ofrece seguir a mano', () => {
    expect(IA_NO_DISPONIBLE).toMatch(/escribir el aviso tú mismo/i);
  });
});

// ---------------------------------------------------------------------
// Las claves se quedan en el servidor
// ---------------------------------------------------------------------

const RAIZ = join(__dirname, '..', '..');

function archivos(carpeta: string): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(carpeta)) {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta));
    else if (/\.(ts|tsx)$/.test(nombre)) salida.push(ruta);
  }
  return salida;
}

const FUENTES = ['app', 'components', 'features', 'lib', 'config']
  .flatMap((c) => archivos(join(RAIZ, c)))
  .map((ruta) => ({
    ruta: relative(RAIZ, ruta).split(sep).join('/'),
    fuente: readFileSync(ruta, 'utf8'),
  }));

const esCliente = (fuente: string) => /^\s*['"]use client['"]/m.test(fuente);

describe('la clave del proveedor de IA', () => {
  it('solo se nombra dentro de su adaptador', () => {
    const culpables = FUENTES.filter(
      (a) =>
        a.fuente.includes('ANTHROPIC_API_KEY') && a.ruta !== 'lib/ia/proveedores/anthropic.ts',
    ).map((a) => a.ruta);
    expect(culpables).toEqual([]);
  });

  it('ninguna variable de IA lleva el prefijo público', () => {
    const culpables = FUENTES.filter((a) =>
      /NEXT_PUBLIC_[A-Z_]*(IA|ANTHROPIC|OPENAI|GEMINI)/.test(a.fuente),
    ).map((a) => a.ruta);
    expect(culpables).toEqual([]);
  });

  it('ningún componente de cliente importa un adaptador ni el SDK', () => {
    const culpables = FUENTES.filter(
      (a) =>
        esCliente(a.fuente) &&
        (a.fuente.includes('@anthropic-ai/sdk') ||
          a.fuente.includes('lib/ia/proveedores') ||
          a.fuente.includes('lib/ia/registro')),
    ).map((a) => a.ruta);
    expect(culpables).toEqual([]);
  });

  it('los adaptadores y el registro están marcados como de servidor', () => {
    const deServidor = FUENTES.filter(
      (a) => a.ruta === 'lib/ia/registro.ts' || a.ruta === 'lib/ia/proveedores/anthropic.ts',
    );
    expect(deServidor).toHaveLength(2);
    for (const archivo of deServidor) {
      expect(archivo.fuente).toMatch(/^import 'server-only';/m);
    }
  });
});

// ---------------------------------------------------------------------
// Aislamiento del entorno
// ---------------------------------------------------------------------

describe('a dónde habla Wasi AI', () => {
  const fuente = readFileSync(
    join(__dirname, '..', '..', 'lib', 'ia', 'proveedores', 'anthropic.ts'),
    'utf8',
  );

  it('la dirección del proveedor está escrita, no heredada del entorno', () => {
    // El SDK de Anthropic lee `ANTHROPIC_BASE_URL` del entorno cuando no
    // se le pasa `baseURL`. Cualquier herramienta que deje esa variable
    // puesta en la terminal redirige en silencio todas las llamadas de
    // Wasi AI a otro servidor, con la clave de Wasipe adentro.
    //
    // Pasó de verdad: esta terminal la tenía puesta.
    expect(fuente).toContain('https://api.anthropic.com');
    expect(fuente).toMatch(/baseURL:\s*BASE_DE_ANTHROPIC/);
  });

  it('y no se lee ninguna variable de entorno que no sea la clave', () => {
    const variables = [...fuente.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]);
    // Solo las de Wasipe. Nada que otra herramienta pueda dejar puesto.
    for (const variable of variables) {
      expect(['ANTHROPIC_API_KEY', 'IA_MODELO', 'IA_PROVEEDOR'], variable).toContain(variable);
    }
  });
});
