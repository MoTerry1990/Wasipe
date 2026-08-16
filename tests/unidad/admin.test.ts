import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  BANDERAS,
  DECISIONES,
  DECISIONES_VALIDAS,
  LAS_BANDERAS_NO_DECIDEN,
  MOTIVO_MINIMO,
  PUESTOS,
  PUESTOS_VALIDOS,
  SECCIONES,
  accedeASeccion,
  esBandera,
  esDecision,
  esPuesto,
  motivoValido,
  seccionesDe,
  type PuestoDeWasipe,
} from '@/lib/admin/permisos';

/**
 * Administración, moderación y confianza.
 *
 * Dos cosas se comprueban con insistencia: que cada puesto vea solo lo
 * suyo, y que ninguna decisión que le duela a alguien se pueda tomar sin
 * escribir por qué. La autorización de verdad está en la base; esto
 * vigila que la interfaz no ofrezca lo que la base va a rechazar.
 */

// ---------------------------------------------------------------------
// Separación de funciones
// ---------------------------------------------------------------------

describe('los cuatro puestos', () => {
  it('están los cuatro y ninguno más', () => {
    expect(PUESTOS_VALIDOS).toEqual(['moderator', 'support', 'finance', 'super_admin']);
    expect(esPuesto('moderator')).toBe(true);
    expect(esPuesto('dueño')).toBe(false);
    expect(esPuesto('constructor')).toBe(false);
  });

  it('cada uno dice qué hace y qué no', () => {
    for (const puesto of PUESTOS_VALIDOS) {
      expect(PUESTOS[puesto].etiqueta.length).toBeGreaterThan(3);
      expect(PUESTOS[puesto].resumen.length).toBeGreaterThan(15);
    }
    expect(PUESTOS.support.resumen).toMatch(/No toca plata/);
    expect(PUESTOS.finance.resumen).toMatch(/No ve denuncias/);
  });
});

describe('quién ve qué', () => {
  it('moderación ve avisos, banderas y denuncias', () => {
    const suyas = seccionesDe(['moderator']).map((s) => s.clave);
    expect(suyas).toContain('avisos');
    expect(suyas).toContain('banderas');
    expect(suyas).toContain('denuncias');
    expect(suyas).toContain('imagenes');
  });

  it('y NO ve pagos ni créditos: el dato de una tarjeta no le sirve', () => {
    const suyas = seccionesDe(['moderator']).map((s) => s.clave);
    expect(suyas).not.toContain('pagos');
    expect(suyas).not.toContain('creditos');
    expect(suyas).not.toContain('destacados');
  });

  it('finanzas ve la plata y NO las denuncias', () => {
    const suyas = seccionesDe(['finance']).map((s) => s.clave);
    expect(suyas).toContain('pagos');
    expect(suyas).toContain('creditos');
    expect(suyas).not.toContain('denuncias');
    expect(suyas).not.toContain('avisos');
  });

  it('soporte ve cuentas y nada más', () => {
    const suyas = seccionesDe(['support']).map((s) => s.clave);
    expect(suyas).toEqual(['usuarios']);
  });

  it('administración general lo ve todo', () => {
    expect(seccionesDe(['super_admin'])).toHaveLength(SECCIONES.length);
  });

  it('quien no es del equipo no ve nada', () => {
    expect(seccionesDe([])).toHaveLength(0);
    expect(accedeASeccion([], 'avisos')).toBe(false);
    expect(accedeASeccion([], 'usuarios')).toBe(false);
  });

  it('dos puestos suman, no se pisan', () => {
    const suyas = seccionesDe(['moderator', 'finance']).map((s) => s.clave);
    expect(suyas).toContain('avisos');
    expect(suyas).toContain('pagos');
  });

  it('nombrar personal es solo de administración general', () => {
    expect(accedeASeccion(['support'], 'usuarios')).toBe(true);
    expect(accedeASeccion(['moderator'], 'mercado')).toBe(false);
    expect(accedeASeccion(['super_admin'], 'mercado')).toBe(true);
  });

  it('cada sección declara sus puestos y si está construida', () => {
    for (const seccion of SECCIONES) {
      expect(seccion.href.startsWith('/panel/')).toBe(true);
      expect(seccion.descripcion.length).toBeGreaterThan(15);
      expect(typeof seccion.construida).toBe('boolean');
    }
  });
});

// ---------------------------------------------------------------------
// Ninguna decisión sin motivo
// ---------------------------------------------------------------------

describe('las decisiones de moderación', () => {
  it('están las cuatro que pide el sprint', () => {
    // En el orden en que se ofrecen, de menos a más grave.
    expect(DECISIONES_VALIDAS).toEqual(['approve', 'request_changes', 'reject', 'pause']);
    expect(esDecision('approve')).toBe(true);
    expect(esDecision('borrar')).toBe(false);
  });

  it('publicar no necesita motivo', () => {
    expect(DECISIONES.approve.exigeMotivo).toBe(false);
    expect(motivoValido('approve', '')).toBe(true);
  });

  it('rechazar, pedir cambios y pausar sí', () => {
    for (const decision of ['reject', 'request_changes', 'pause'] as const) {
      expect(DECISIONES[decision].exigeMotivo).toBe(true);
      expect(motivoValido(decision, '')).toBe(false);
      expect(motivoValido(decision, 'no va')).toBe(false);
      expect(motivoValido(decision, '         ')).toBe(false);
    }
  });

  it('un motivo de verdad sí pasa', () => {
    expect(motivoValido('reject', 'Las fotos son de otro departamento.')).toBe(true);
  });

  it('el mínimo es el mismo que exige la base', () => {
    expect(MOTIVO_MINIMO).toBe(10);
    expect(motivoValido('reject', 'a'.repeat(MOTIVO_MINIMO))).toBe(true);
    expect(motivoValido('reject', 'a'.repeat(MOTIVO_MINIMO - 1))).toBe(false);
  });

  it('cada decisión explica qué le pasa al aviso', () => {
    expect(DECISIONES.request_changes.explicacion).toMatch(/vuelve a borrador/i);
    expect(DECISIONES.reject.explicacion).toMatch(/ve el motivo/i);
    expect(DECISIONES.pause.explicacion).toMatch(/mientras se revisa/i);
  });
});

// ---------------------------------------------------------------------
// Las banderas no deciden
// ---------------------------------------------------------------------

describe('las banderas', () => {
  it('están los cuatro tipos', () => {
    for (const tipo of ['duplicate', 'suspicious_price', 'repeated_image', 'manual'] as const) {
      expect(esBandera(tipo)).toBe(true);
      expect(BANDERAS[tipo].etiqueta.length).toBeGreaterThan(3);
    }
    expect(esBandera('sospechoso')).toBe(false);
  });

  it('cada una dice qué mirar, no qué hacer', () => {
    expect(BANDERAS.duplicate.queMirar).toMatch(/mismo edificio, que es normal/i);
    expect(BANDERAS.suspicious_price.queMirar).toMatch(/cero de más|moneda equivocada/i);
    expect(BANDERAS.repeated_image.queMirar).toMatch(/republicando/i);
  });

  it('y se dice explícitamente que no despublican nada', () => {
    expect(LAS_BANDERAS_NO_DECIDEN).toMatch(/no despublica nada/i);
    expect(LAS_BANDERAS_NO_DECIDEN).toMatch(/Muchas son falsas/i);
  });
});

// ---------------------------------------------------------------------
// Nada sensible en el paquete del navegador
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

describe('lo sensible no llega al navegador', () => {
  it('ningún componente de cliente consulta la base directamente', () => {
    // El cliente del navegador existe para la autenticación y la subida
    // de fotos. Consultar tablas de administración desde ahí pondría los
    // datos —y la forma de pedirlos— en el paquete de JavaScript.
    const culpables = FUENTES.filter(
      (a) =>
        esCliente(a.fuente) &&
        /from\('(profiles|staff_members|audit_logs|moderation_flags|listing_reviews|subscriptions|credit_transactions|reports)'\)/.test(
          a.fuente,
        ),
    ).map((a) => a.ruta);
    expect(culpables).toEqual([]);
  });

  it('el guardia de administración es de servidor', () => {
    const guardia = FUENTES.find((a) => a.ruta === 'lib/auth/personal.ts');
    expect(guardia).toBeDefined();
    expect(guardia!.fuente).toMatch(/^import 'server-only';/m);
  });

  it('ninguna pantalla de administración se salta el guardia', () => {
    const paginas = FUENTES.filter((a) =>
      /^app\/\(dashboard\)\/panel\/(admin|moderacion)\/.*page\.tsx$/.test(a.ruta),
    );
    expect(paginas.length).toBeGreaterThan(3);

    for (const pagina of paginas) {
      // O exige una sección de administración, o exige un rol. Ninguna
      // se abre sola.
      // La portada de administración es la excepción: la ve cualquiera
      // del equipo, así que comprueba que tenga AL MENOS un puesto en vez
      // de exigir una sección. Las demás nombran la suya.
      expect(
        /requiereSeccionDeAdmin|requierePuesto|requiereSeccion|requiereRol|puestosDeLaSesion/.test(
          pagina.fuente,
        ),
        pagina.ruta,
      ).toBe(true);
    }
  });

  it('las acciones de administración exigen puesto antes de tocar la base', () => {
    const acciones = FUENTES.find((a) => a.ruta === 'features/admin/acciones.ts')!;
    // Cada función exportada empieza pidiendo el puesto.
    const exportadas = acciones.fuente.match(/export async function \w+/g) ?? [];
    expect(exportadas.length).toBeGreaterThan(4);

    const bloques = acciones.fuente.split(/export async function /).slice(1);
    for (const bloque of bloques) {
      expect(bloque).toMatch(/await requierePuesto\(/);
    }
  });

  it('la lista de personas no pide teléfono ni correo', () => {
    const pagina = FUENTES.find(
      (a) => a.ruta === 'app/(dashboard)/panel/admin/usuarios/page.tsx',
    )!;
    // Soporte necesita el teléfono cuando atiende un caso, no en una
    // lista de doscientas cuentas.
    expect(pagina.fuente).not.toMatch(/select\([^)]*\bphone\b/);
    expect(pagina.fuente).not.toMatch(/select\([^)]*\bemail\b/);
    expect(pagina.fuente).not.toMatch(/select\([^)]*whatsapp/);
  });

  it('la lista de denuncias no muestra quién denunció', () => {
    const pagina = FUENTES.find(
      (a) => a.ruta === 'app/(dashboard)/panel/admin/denuncias/page.tsx',
    )!;
    expect(pagina.fuente).not.toMatch(/reporter_id/);
  });
});

describe('los puestos que se piden en cada pantalla existen', () => {
  it('todas las secciones nombran puestos válidos', () => {
    for (const seccion of SECCIONES) {
      for (const puesto of seccion.puestos) {
        expect(PUESTOS_VALIDOS as readonly PuestoDeWasipe[]).toContain(puesto);
      }
    }
  });
});
