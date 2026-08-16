import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CLAVES_DE_EDICION,
  EDICIONES,
  ETIQUETA_AMOBLADA,
  ETIQUETA_EDITADA,
  PROHIBIDO_EN_FOTOS,
  REGLAS,
  VARIANTES,
  agruparVariantes,
  armarPeticionDeImagen,
  esAmoblamiento,
  esEdicion,
  etiquetaDe,
  fotoDeVariante,
  huellaDeEdicion,
  rutaDeEdicion,
  variantesDisponibles,
  varianteDe,
  type FotoConVariante,
} from '@/lib/ia/imagenes';
import { leerRespuesta } from '@/lib/ia/proveedores/imagen-http';
import { proveedorImagenNinguno } from '@/lib/ia/proveedores/ninguno';
import { FallaDeProveedor, IMAGEN_NO_DISPONIBLE } from '@/lib/ia/proveedor';
import {
  proveedorDeImagen,
  imagenDisponible,
  olvidarProveedor,
  PROVEEDORES_DE_IMAGEN,
} from '@/lib/ia/registro';

/**
 * Mejora de fotos: las reglas del producto.
 *
 * Casi todo lo que se comprueba acá son prohibiciones. Es a propósito:
 * la parte difícil de retocar la foto de un inmueble no es que quede
 * bonita, es que no mienta.
 */

const IMAGEN = { datos: 'x'.repeat(200), tipo: 'image/webp' };

// ---------------------------------------------------------------------
// El catálogo
// ---------------------------------------------------------------------

describe('el catálogo de mejoras', () => {
  it('tiene las ocho herramientas y ninguna más', () => {
    expect(CLAVES_DE_EDICION).toEqual([
      'lighting',
      'white_balance',
      'perspective',
      'upscale',
      'staging',
      'style',
      'wall_color',
      'declutter',
    ]);
  });

  it('rechaza cualquier cosa que no esté en la lista', () => {
    expect(esEdicion('lighting')).toBe(true);
    expect(esEdicion('remove_damage')).toBe(false);
    expect(esEdicion('add_window')).toBe(false);
    expect(esEdicion('constructor')).toBe(false);
  });

  it('cada una dice qué hace, cuánto cuesta y a qué familia pertenece', () => {
    for (const clave of CLAVES_DE_EDICION) {
      const edicion = EDICIONES[clave];
      expect(edicion.etiqueta.length).toBeGreaterThan(3);
      expect(edicion.resumen.length).toBeGreaterThan(10);
      expect(edicion.instruccion.length).toBeGreaterThan(30);
      expect(edicion.costo).toBeGreaterThan(0);
      expect(['photo_enhance', 'virtual_staging']).toContain(edicion.familia);
    }
  });

  it('lo que muestra algo que no existe cuesta más que un retoque', () => {
    expect(EDICIONES.staging.costo).toBeGreaterThan(EDICIONES.lighting.costo);
  });
});

// ---------------------------------------------------------------------
// Las prohibiciones
// ---------------------------------------------------------------------

describe('lo que la IA no puede hacer nunca con una foto', () => {
  it.each([
    ['tapar daños de la construcción', /humedad|rajaduras|moho/i],
    ['agregar o quitar ambientes', /ventanas, puertas|ambientes/i],
    ['cambiar las dimensiones', /dimensiones ni las proporciones/i],
    ['tocar lo que está fuera del inmueble', /edificios vecinos|la calle/i],
    ['inventar instalaciones fijas', /instalaciones permanentes que no existen/i],
    ['meter gente, marcas o carteles', /personas, mascotas, marcas de agua/i],
  ])('%s', (_titulo, patron) => {
    expect(REGLAS).toMatch(patron);
  });

  it('las reglas viajan en todas las peticiones, sin importar qué se pidió', () => {
    for (const clave of CLAVES_DE_EDICION) {
      const peticion = armarPeticionDeImagen(clave, IMAGEN);
      for (const regla of PROHIBIDO_EN_FOTOS) {
        expect(peticion.reglas).toContain(regla);
      }
    }
  });

  it('ante la duda, se devuelve la foto sin cambios', () => {
    expect(REGLAS).toMatch(/devuelve la imagen sin cambios/i);
  });

  it('el amoblado virtual tiene prohibido tapar defectos', () => {
    expect(EDICIONES.staging.instruccion).toMatch(/no pueden tapar humedades, rajaduras/i);
  });

  it('quitar objetos se limita a lo movible', () => {
    expect(EDICIONES.declutter.instruccion).toMatch(/únicamente objetos personales sueltos/i);
    expect(EDICIONES.declutter.instruccion).toMatch(/No quites ni muebles fijos/i);
    expect(EDICIONES.declutter.instruccion).toMatch(/no cubras ninguna zona dañada/i);
  });

  it('enderezar no puede agrandar el ambiente', () => {
    expect(EDICIONES.perspective.instruccion).toMatch(/mismo tamaño que en la foto original/i);
  });

  it('subir resolución no inventa detalle', () => {
    expect(EDICIONES.upscale.instruccion).toMatch(/no inventes detalle/i);
  });
});

// ---------------------------------------------------------------------
// Armar el pedido
// ---------------------------------------------------------------------

describe('armar el pedido de imagen', () => {
  it('lleva la instrucción de la operación y la imagen', () => {
    const peticion = armarPeticionDeImagen('lighting', IMAGEN);
    expect(peticion.operacion).toBe('lighting');
    expect(peticion.instruccion).toContain('Corrige la exposición');
    expect(peticion.imagen).toEqual(IMAGEN);
  });

  it('suma la opción cuando la persona eligió una', () => {
    const peticion = armarPeticionDeImagen('staging', IMAGEN, 'Nórdico');
    expect(peticion.instruccion).toContain('Estilo: Nórdico');
  });

  it('e ignora una opción que no está en la lista', () => {
    const peticion = armarPeticionDeImagen('wall_color', IMAGEN, 'Rojo sangre');
    expect(peticion.instruccion).not.toContain('Rojo sangre');
  });
});

// ---------------------------------------------------------------------
// Etiquetas
// ---------------------------------------------------------------------

describe('las etiquetas', () => {
  it('el amoblamiento virtual dice que es referencial', () => {
    expect(etiquetaDe('staging')).toBe(ETIQUETA_AMOBLADA);
    expect(etiquetaDe('wall_color')).toBe(ETIQUETA_AMOBLADA);
    expect(ETIQUETA_AMOBLADA).toMatch(/imagen referencial/);
  });

  it('el retoque dice que fue modificada', () => {
    expect(etiquetaDe('lighting')).toBe(ETIQUETA_EDITADA);
    expect(etiquetaDe('declutter')).toBe(ETIQUETA_EDITADA);
    expect(ETIQUETA_EDITADA).toBe('Imagen modificada con Wasi AI');
  });

  it('y ninguna edición se queda sin etiqueta', () => {
    for (const clave of CLAVES_DE_EDICION) {
      expect(etiquetaDe(clave).length).toBeGreaterThan(10);
      expect(esAmoblamiento(clave)).toBe(etiquetaDe(clave) === ETIQUETA_AMOBLADA);
    }
  });
});

// ---------------------------------------------------------------------
// Idempotencia y rutas
// ---------------------------------------------------------------------

describe('la huella del pedido', () => {
  it('el mismo pedido dos veces da la misma huella', () => {
    expect(huellaDeEdicion('m1', 'lighting')).toBe(huellaDeEdicion('m1', 'lighting'));
  });

  it('otra foto, otra mejora u otra opción son pedidos distintos', () => {
    const base = huellaDeEdicion('m1', 'staging', 'Moderno');
    expect(base).not.toBe(huellaDeEdicion('m2', 'staging', 'Moderno'));
    expect(base).not.toBe(huellaDeEdicion('m1', 'style', 'Moderno'));
    expect(base).not.toBe(huellaDeEdicion('m1', 'staging', 'Nórdico'));
  });
});

describe('dónde se guarda lo editado', () => {
  it('en su propia subcarpeta, nunca encima de la foto original', () => {
    const ruta = rutaDeEdicion('aviso-1', 1755000000000);
    expect(ruta).toBe('aviso-1/ia/1755000000000.webp');
    expect(ruta).not.toContain('original');
  });
});

// ---------------------------------------------------------------------
// Variantes: original, mejorada, amoblada
// ---------------------------------------------------------------------

function foto(parcial: Partial<FotoConVariante> & { id: string }): FotoConVariante {
  return {
    url: `https://ejemplo/${parcial.id}.webp`,
    alt: null,
    ai_label: null,
    ai_edited: false,
    is_staged: false,
    original_media_id: null,
    is_cover: false,
    sort_order: 0,
    ...parcial,
  };
}

describe('agrupar las versiones de una foto', () => {
  const original = foto({ id: 'sala' });
  const mejorada = foto({
    id: 'sala-luz',
    ai_edited: true,
    original_media_id: 'sala',
    ai_label: ETIQUETA_EDITADA,
  });
  const amoblada = foto({
    id: 'sala-muebles',
    ai_edited: true,
    is_staged: true,
    original_media_id: 'sala',
    ai_label: ETIQUETA_AMOBLADA,
  });

  it('una foto sin versiones es una sola entrada', () => {
    const grupos = agruparVariantes([original]);
    expect(grupos).toHaveLength(1);
    expect(variantesDisponibles(grupos[0]!)).toEqual(['original']);
  });

  it('las versiones no se muestran como fotos aparte', () => {
    const grupos = agruparVariantes([original, mejorada, amoblada]);
    expect(grupos).toHaveLength(1);
    expect(variantesDisponibles(grupos[0]!)).toEqual(['original', 'mejorada', 'amoblada']);
  });

  it('se puede alternar entre las tres', () => {
    const grupo = agruparVariantes([original, mejorada, amoblada])[0]!;
    expect(fotoDeVariante(grupo, 'original').id).toBe('sala');
    expect(fotoDeVariante(grupo, 'mejorada').id).toBe('sala-luz');
    expect(fotoDeVariante(grupo, 'amoblada').id).toBe('sala-muebles');
  });

  it('si se mejoró dos veces, manda la última', () => {
    const otra = foto({ id: 'sala-luz-2', ai_edited: true, original_media_id: 'sala' });
    const grupo = agruparVariantes([original, mejorada, otra])[0]!;
    expect(fotoDeVariante(grupo, 'mejorada').id).toBe('sala-luz-2');
  });

  it('sin la versión pedida se cae a la original, no a una pantalla vacía', () => {
    const grupo = agruparVariantes([original])[0]!;
    expect(fotoDeVariante(grupo, 'amoblada').id).toBe('sala');
  });

  it('una versión cuyo original ya no está se muestra igual', () => {
    // Pasa cuando moderación retira la original: perder la otra en
    // silencio dejaría el aviso con menos fotos y sin explicación.
    const grupos = agruparVariantes([mejorada]);
    expect(grupos).toHaveLength(1);
    expect(variantesDisponibles(grupos[0]!)).toEqual(['mejorada']);
  });

  it('las tres opciones se llaman como se llaman', () => {
    expect(VARIANTES).toEqual({
      original: 'Original',
      mejorada: 'Mejorada',
      amoblada: 'Amoblada',
    });
  });

  it('cada foto sabe a qué variante pertenece', () => {
    expect(varianteDe(original)).toBe('original');
    expect(varianteDe(mejorada)).toBe('mejorada');
    expect(varianteDe(amoblada)).toBe('amoblada');
  });
});

// ---------------------------------------------------------------------
// El proveedor de imagen
// ---------------------------------------------------------------------

describe('elegir el proveedor de imagen', () => {
  const original = { ...process.env };

  beforeEach(() => olvidarProveedor());
  afterEach(() => {
    process.env = { ...original };
    olvidarProveedor();
    vi.restoreAllMocks();
  });

  it('se elige aparte del proveedor de texto', () => {
    expect(PROVEEDORES_DE_IMAGEN).toContain('http');
    expect(PROVEEDORES_DE_IMAGEN).toContain('ninguno');
  });

  it('sin configurar nada, la mejora de fotos queda apagada', () => {
    delete process.env.IA_PROVEEDOR_IMAGEN;
    delete process.env.IA_IMAGEN_URL;
    expect(imagenDisponible()).toBe(false);
  });

  it('un nombre inventado la apaga en vez de tumbar la aplicación', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.IA_PROVEEDOR_IMAGEN = 'no-existe';
    expect(() => proveedorDeImagen()).not.toThrow();
    expect(imagenDisponible()).toBe(false);
  });

  it('con endpoint configurado queda disponible', () => {
    process.env.IA_PROVEEDOR_IMAGEN = 'http';
    process.env.IA_IMAGEN_URL = 'https://ejemplo.pe/editar';
    expect(imagenDisponible()).toBe(true);
  });

  it('y se le puede limitar qué operaciones sabe hacer', () => {
    process.env.IA_PROVEEDOR_IMAGEN = 'http';
    process.env.IA_IMAGEN_URL = 'https://ejemplo.pe/editar';
    process.env.IA_IMAGEN_OPERACIONES = 'lighting, white_balance';

    const proveedor = proveedorDeImagen();
    expect(proveedor.soporta('lighting')).toBe(true);
    expect(proveedor.soporta('staging')).toBe(false);
  });

  it('sin la lista, sabe hacer todas', () => {
    process.env.IA_PROVEEDOR_IMAGEN = 'http';
    process.env.IA_IMAGEN_URL = 'https://ejemplo.pe/editar';
    delete process.env.IA_IMAGEN_OPERACIONES;
    expect(proveedorDeImagen().soporta('staging')).toBe(true);
  });
});

describe('el proveedor de imagen apagado', () => {
  it('no sabe hacer nada y lo dice en castellano', async () => {
    const proveedor = proveedorImagenNinguno();
    expect(proveedor.disponible()).toBe(false);
    expect(proveedor.soporta('lighting')).toBe(false);

    await expect(
      proveedor.editarImagen(armarPeticionDeImagen('lighting', IMAGEN)),
    ).rejects.toThrow(IMAGEN_NO_DISPONIBLE);
  });

  it('el mensaje ofrece publicar las fotos tal como están', () => {
    expect(IMAGEN_NO_DISPONIBLE).toMatch(/tal como las subiste/i);
  });
});

describe('leer lo que devuelve el proveedor', () => {
  it('acepta una imagen bien formada', () => {
    const respuesta = leerRespuesta({
      imagen: { datos: 'A'.repeat(500), tipo: 'image/webp' },
      modelo: 'algun-modelo',
      costo_micros: 2400,
    });
    expect(respuesta.modelo).toBe('algun-modelo');
    expect(respuesta.costoMicros).toBe(2400);
    expect(respuesta.proveedor).toBe('imagen-http');
  });

  it('rechaza una respuesta sin imagen', () => {
    expect(() => leerRespuesta({})).toThrow(FallaDeProveedor);
    expect(() => leerRespuesta({ imagen: { datos: 'corto', tipo: 'image/webp' } })).toThrow(
      /imagen vacía/i,
    );
  });

  it('rechaza un archivo que no es una imagen', () => {
    expect(() =>
      leerRespuesta({ imagen: { datos: 'A'.repeat(500), tipo: 'application/pdf' } }),
    ).toThrow(/no es una imagen/i);
  });

  it('un costo que no es un número no se inventa', () => {
    const respuesta = leerRespuesta({
      imagen: { datos: 'A'.repeat(500), tipo: 'image/webp' },
      costo_micros: 'carísimo',
    });
    expect(respuesta.costoMicros).toBeUndefined();
  });
});
