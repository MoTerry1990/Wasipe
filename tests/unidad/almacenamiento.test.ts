import { describe, it, expect } from 'vitest';
import { DEPOSITOS, type Deposito } from '@/lib/almacenamiento/proveedor';
import {
  LIMITES,
  nombreSeguro,
  rutaDeArchivo,
  tipoRealDe,
  validarArchivo,
} from '@/lib/almacenamiento/validacion';
import { esHuella, huellaDe, versionDe } from '@/lib/almacenamiento/huella';

/**
 * Almacenamiento.
 *
 * La regla que se vigila acá: **no se le cree nada a quien sube**. Ni el
 * tipo, ni la extensión, ni el nombre. Las tres las escribe el navegador
 * de la persona y las tres se ponen a mano.
 */

// Cabeceras de verdad, byte por byte.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
/** `MZ` — un ejecutable de Windows renombrado a .jpg. */
const EJECUTABLE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
/** `<?php` — el clásico que se sube a una carpeta de imágenes. */
const PHP = new Uint8Array([0x3c, 0x3f, 0x70, 0x68, 0x70, 0x20, 0x65, 0x63]);
/** `<svg` — se dibuja como imagen y puede traer scripts. */
const SVG = new Uint8Array([0x3c, 0x73, 0x76, 0x67, 0x20, 0x78, 0x6d, 0x6c]);

// ---------------------------------------------------------------------
// Los depósitos
// ---------------------------------------------------------------------

describe('los cinco depósitos', () => {
  it('los originales son privados, y eso no es negociable', () => {
    // El archivo sin tocar lleva los metadatos EXIF, y ahí van las
    // coordenadas GPS. Quien publica eligió mostrar el distrito.
    expect(DEPOSITOS.originales.publico).toBe(false);
    expect(DEPOSITOS.originales.porQue).toMatch(/GPS|EXIF/);
  });

  it('lo que genera Wasi AI también, hasta que alguien lo apruebe', () => {
    expect(DEPOSITOS.generadas.publico).toBe(false);
  });

  it('los videos también', () => {
    expect(DEPOSITOS.videos.publico).toBe(false);
  });

  it('solo son públicas las que se ven en el portal', () => {
    // `avatares` y `logos` estaban fundidas en un solo depósito
    // `perfiles` hasta el sprint 24. Se separaron porque en Storage son
    // dos buckets con políticas distintas, y el contrato no sabía nombrar
    // el segundo: ver P-28.
    const publicos = (Object.keys(DEPOSITOS) as Deposito[]).filter((d) => DEPOSITOS[d].publico);
    expect(publicos.sort()).toEqual(['avatares', 'logos', 'publicas']);
  });

  it('cada uno explica por qué está de su lado', () => {
    for (const [nombre, info] of Object.entries(DEPOSITOS)) {
      expect(info.porQue.length, nombre).toBeGreaterThan(40);
    }
  });
});

// ---------------------------------------------------------------------
// Qué es el archivo de verdad
// ---------------------------------------------------------------------

describe('el tipo se lee del contenido, no de lo que declara el navegador', () => {
  it('reconoce los formatos que aceptamos', () => {
    expect(tipoRealDe(JPEG)?.tipo).toBe('image/jpeg');
    expect(tipoRealDe(PNG)?.tipo).toBe('image/png');
    expect(tipoRealDe(WEBP)?.tipo).toBe('image/webp');
  });

  it('un ejecutable con nombre de foto no pasa', () => {
    // Es el caso que motiva todo este archivo: `virus.exe` renombrado a
    // `casa.jpg` llega declarando `image/jpeg`, y una validación que
    // mira `file.type` lo deja entrar.
    expect(tipoRealDe(EJECUTABLE)).toBeNull();

    const resultado = validarArchivo('publicas', EJECUTABLE, 5000);
    expect(resultado.ok).toBe(false);
  });

  it('un PHP tampoco', () => {
    expect(tipoRealDe(PHP)).toBeNull();
    expect(validarArchivo('publicas', PHP, 900).ok).toBe(false);
  });

  it('un SVG tampoco: se dibuja como imagen y puede traer scripts', () => {
    expect(tipoRealDe(SVG)).toBeNull();
    expect(validarArchivo('publicas', SVG, 900).ok).toBe(false);
  });

  it('lo que no reconoce, no entra', () => {
    // Lista de permitidos, no de prohibidos: la de prohibidos siempre se
    // queda corta.
    const raro = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
    expect(tipoRealDe(raro)).toBeNull();
  });

  it('un archivo cortado no rompe nada', () => {
    expect(tipoRealDe(new Uint8Array([0xff]))).toBeNull();
    expect(tipoRealDe(new Uint8Array([]))).toBeNull();
  });
});

// ---------------------------------------------------------------------
// Tamaño
// ---------------------------------------------------------------------

describe('el tamaño', () => {
  it('una foto normal entra', () => {
    expect(validarArchivo('publicas', JPEG, 2_000_000).ok).toBe(true);
  });

  it('una de 30 MB no, y se dice cuánto pesa y cuál es el tope', () => {
    const r = validarArchivo('publicas', JPEG, 31_457_280);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toContain('30.0 MB');
      expect(r.motivo).toContain('15 MB');
      // Quien sube una foto grande necesita saber qué hacer.
      expect(r.motivo).toMatch(/resoluci/i);
    }
  });

  it('el original admite más que la versión pública', () => {
    // 20 MB: no entra en `publicas`, sí en `originales`. Es a propósito:
    // el original se guarda entero o no sirve.
    expect(validarArchivo('publicas', JPEG, 20_000_000).ok).toBe(false);
    expect(validarArchivo('originales', JPEG, 20_000_000).ok).toBe(true);
  });

  it('un archivo vacío no entra', () => {
    expect(validarArchivo('publicas', JPEG, 0).ok).toBe(false);
  });

  it('cada depósito declara su límite y sus tipos', () => {
    for (const [nombre, limite] of Object.entries(LIMITES)) {
      expect(limite.bytes, nombre).toBeGreaterThan(0);
      expect(limite.tipos.length, nombre).toBeGreaterThan(0);
      expect(limite.comoSeDice, nombre).toMatch(/MB/);
    }
  });
});

describe('el HEIC del iPhone', () => {
  it('entra como original pero no como imagen pública', () => {
    const heic = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
    ]);
    expect(tipoRealDe(heic)?.tipo).toBe('image/heic');
    expect(validarArchivo('originales', heic, 3_000_000).ok).toBe(true);
    // Safari lo muestra; Chrome en Android no. La versión pública se
    // convierte antes de subirse.
    expect(validarArchivo('publicas', heic, 3_000_000).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Nombres y rutas
// ---------------------------------------------------------------------

describe('el nombre del archivo', () => {
  it('no deja salir de la carpeta', () => {
    // Sin esto, `../../otro-aviso/portada.jpg` escribe en el aviso de
    // otra persona si la política solo mira el prefijo.
    expect(nombreSeguro('../../otro-aviso/foto.jpg')).not.toContain('..');
    expect(nombreSeguro('../../otro-aviso/foto.jpg')).not.toContain('/');
    expect(nombreSeguro('..\\..\\windows\\system32')).not.toContain('\\');
  });

  it('quita lo que termina en un atributo HTML', () => {
    const sucio = nombreSeguro('<img src=x onerror=alert(1)>.jpg');
    expect(sucio).not.toMatch(/[<>"'()]/);
  });

  it('quita tildes y eñes sin perder el nombre', () => {
    expect(nombreSeguro('Fachada del Departamento.JPG')).toBe('fachada-del-departamento.jpg');
    expect(nombreSeguro('cocina-pequeña.png')).toBe('cocina-pequena.png');
  });

  it('un nombre kilométrico se corta', () => {
    const largo = 'a'.repeat(500) + '.jpg';
    expect(nombreSeguro(largo).length).toBeLessThanOrEqual(80);
  });

  it('un nombre que queda vacío no devuelve una cadena vacía', () => {
    expect(nombreSeguro('...')).toBe('archivo');
    expect(nombreSeguro('')).toBe('archivo');
    expect(nombreSeguro('///')).toBe('archivo');
  });
});

describe('la ruta', () => {
  const aviso = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

  it('empieza siempre por el aviso: es lo que lee la política', () => {
    const ruta = rutaDeArchivo(aviso, 'Fachada.jpg', 'webp', 1_700_000_000_000);
    expect(ruta.startsWith(`${aviso}/`)).toBe(true);
    expect(ruta.endsWith('.webp')).toBe(true);
  });

  it('dos archivos con el mismo nombre no se pisan', () => {
    const a = rutaDeArchivo(aviso, 'foto.jpg', 'webp', 1_700_000_000_000);
    const b = rutaDeArchivo(aviso, 'foto.jpg', 'webp', 1_700_000_000_001);
    expect(a).not.toBe(b);
  });

  it('un nombre malicioso no cambia la carpeta', () => {
    const ruta = rutaDeArchivo(aviso, '../../otro/x.jpg', 'webp', 1);
    expect(ruta.split('/')[0]).toBe(aviso);
    expect(ruta.split('/').length).toBe(2);
  });
});

// ---------------------------------------------------------------------
// La huella
// ---------------------------------------------------------------------

describe('la huella de una imagen', () => {
  it('el mismo archivo da siempre la misma', () => {
    // Determinista: una bandera que aparece y desaparece no la mira nadie.
    return Promise.all([huellaDe(JPEG), huellaDe(JPEG)]).then(([a, b]) => {
      expect(a).toBe(b);
    });
  });

  it('un byte distinto da otra', async () => {
    const otro = new Uint8Array(JPEG);
    otro[7] = 0x47;
    expect(await huellaDe(JPEG)).not.toBe(await huellaDe(otro));
  });

  it('lleva la versión del algoritmo adelante', async () => {
    // Para que el día que entre un hash perceptual las viejas se
    // distingan solas y se puedan recalcular sin adivinar.
    const huella = await huellaDe(PNG);
    expect(huella.startsWith('sha256:')).toBe(true);
    expect(versionDe(huella)).toBe('sha256');
  });

  it('tiene la forma que espera la base', async () => {
    const huella = await huellaDe(WEBP);
    expect(esHuella(huella)).toBe(true);
    // La función `anotar_huella` exige al menos 8 caracteres.
    expect(huella.length).toBeGreaterThan(8);
  });

  it('lo que no es una huella se reconoce', () => {
    expect(esHuella(null)).toBe(false);
    expect(esHuella('')).toBe(false);
    expect(esHuella('sha256:corta')).toBe(false);
    expect(esHuella('md5:' + 'a'.repeat(64))).toBe(false);
  });

  it('acepta ArrayBuffer y Uint8Array por igual', async () => {
    const desdeArreglo = await huellaDe(JPEG);
    const desdeBuffer = await huellaDe(
      JPEG.buffer.slice(JPEG.byteOffset, JPEG.byteOffset + JPEG.byteLength),
    );
    expect(desdeArreglo).toBe(desdeBuffer);
  });
});
