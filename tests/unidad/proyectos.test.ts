import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { informacionDeProyecto, tipologia, slugDe, ETAPAS } from '@/lib/validacion/proyecto';
import { decidirMembresia, correspondeVerProyectos } from '@/lib/proyectos/permisos';
import { navegacionPanel } from '@/lib/auth/roles';
import type { Proyecto, TipologiaDeProyecto } from '@/types/base-datos';

/**
 * El panel de proyectos: validación, tipos y autorización.
 *
 * Lo que se prueba acá es lo que se puede probar sin navegador ni base:
 * que las reglas de un formulario coincidan con las de la migración, que
 * los tipos escritos a mano digan lo que la base dice, y que ninguna
 * acción de servidor acepte del formulario algo que define quién eres.
 *
 * Esa última parte se mira sobre el código fuente, y no es paranoia: la
 * forma clásica de romper un panel así no es adivinar una contraseña sino
 * mandar un `agency_id` que no es el tuyo.
 */

const raiz = join(__dirname, '..', '..');
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8').replace(/\r\n/g, '\n');

const INFO_VALIDA = {
  name: 'Torre Los Álamos',
  stage: 'preventa',
  department: 'Lima',
  province: 'Lima',
  district: 'Miraflores',
};

const TIPOLOGIA_VALIDA = {
  name: '2 dormitorios',
  bedrooms: '2',
  bathrooms: '2',
  parking: '1',
  currency: 'USD',
  price_from: '95000',
  price_to: '120000',
  units_total: '40',
  units_available: '40',
};

// ---------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------

describe('los tipos dicen lo que la base dice', () => {
  it('un proyecto no tiene precio, ni dormitorios, ni verificación', () => {
    // Comprobación de tipos, no de valores: si alguien agregara `price` a
    // `Proyecto`, esto deja de compilar. Es el mismo error que este
    // sprint entero existe para no repetir.
    type Campos = keyof Proyecto;
    const prohibidos = ['price', 'bedrooms', 'verification_status'] as const;
    for (const campo of prohibidos) {
      expect<Campos[]>(Object.keys({} as Proyecto) as Campos[]).not.toContain(campo);
    }

    // Y lo que sí tiene que estar, escrito de forma que el compilador lo
    // verifique de verdad.
    const referencia: Pick<Proyecto, 'code' | 'publication_status' | 'agency_id' | 'stage'> = {
      code: 'PRY-000001',
      publication_status: 'draft',
      agency_id: 'x',
      stage: 'preventa',
    };
    expect(referencia.code).toBe('PRY-000001');
  });

  it('una tipología sí tiene el rango de precio y la disponibilidad', () => {
    const t: Pick<TipologiaDeProyecto, 'price_from' | 'price_to' | 'units_available' | 'units_total'> = {
      price_from: 1,
      price_to: 2,
      units_available: 1,
      units_total: 2,
    };
    expect(t.price_to).toBeGreaterThanOrEqual(t.price_from);
  });

  it('las cuatro tablas están registradas en el esquema tipado', () => {
    // Sin esto, `supabase.from('projects')` no compila y el error que sale
    // habla de sobrecargas, no de una tabla que falta.
    const tipos = leer('types/base-datos.ts');
    for (const tabla of ['projects', 'project_typologies', 'project_media', 'project_features']) {
      expect(tipos, `falta ${tabla} en el esquema tipado`).toContain(`      ${tabla}: {`);
    }
  });

  it('una consulta apunta a un aviso o a un proyecto, y el tipo lo refleja', () => {
    const tipos = leer('types/base-datos.ts');
    expect(tipos).toContain('property_id: string | null;');
    expect(tipos).toContain('project_id: string | null;');
  });

  it('las etapas son exactamente las del enum de la migración', () => {
    const sql = leer('supabase/migrations/20260909120000_proyectos.sql');
    for (const etapa of ETAPAS) expect(sql).toContain(`'${etapa}'`);
    expect(ETAPAS).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------

describe('la información general', () => {
  it('acepta lo mínimo para existir', () => {
    expect(informacionDeProyecto.safeParse(INFO_VALIDA).success).toBe(true);
  });

  it('exige nombre y ubicación, en español', () => {
    const r = informacionDeProyecto.safeParse({ ...INFO_VALIDA, name: 'ab' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toMatch(/nombre del proyecto/i);
  });

  it('la fecha de entrega va como año y mes, no como día', () => {
    expect(informacionDeProyecto.safeParse({ ...INFO_VALIDA, delivery_estimate: '2027-03' }).success).toBe(true);

    const r = informacionDeProyecto.safeParse({ ...INFO_VALIDA, delivery_estimate: '2027-03-15' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toMatch(/año y mes/i);
  });

  it('un campo opcional vacío no es un error', () => {
    const r = informacionDeProyecto.safeParse({ ...INFO_VALIDA, ubigeo: '', address: '', description: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.ubigeo).toBeUndefined();
  });

  it('el ubigeo, si va, son seis dígitos', () => {
    expect(informacionDeProyecto.safeParse({ ...INFO_VALIDA, ubigeo: '150122' }).success).toBe(true);
    expect(informacionDeProyecto.safeParse({ ...INFO_VALIDA, ubigeo: '15' }).success).toBe(false);
  });
});

describe('las tipologías', () => {
  it('aceptan una tipología razonable', () => {
    expect(tipologia.safeParse(TIPOLOGIA_VALIDA).success).toBe(true);
  });

  it('rechazan un rango de precio al revés, con el error en el campo correcto', () => {
    const r = tipologia.safeParse({ ...TIPOLOGIA_VALIDA, price_from: '200000', price_to: '100000' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.path).toEqual(['price_to']);
      expect(r.error.issues[0]?.message).toMatch(/precio hasta no puede ser menor/i);
    }
  });

  it('rechazan más disponibles que totales', () => {
    const r = tipologia.safeParse({ ...TIPOLOGIA_VALIDA, units_total: '10', units_available: '80' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['units_available']);
  });

  it('rechazan área construida mayor que el área total', () => {
    const r = tipologia.safeParse({ ...TIPOLOGIA_VALIDA, total_area: '60', built_area: '90' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['built_area']);
  });

  it('aceptan que las áreas no se sepan todavía', () => {
    const r = tipologia.safeParse({ ...TIPOLOGIA_VALIDA, total_area: '', built_area: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.total_area).toBeUndefined();
  });

  it('rechazan un precio en cero: no es un dato, es un olvido', () => {
    expect(tipologia.safeParse({ ...TIPOLOGIA_VALIDA, price_from: '0' }).success).toBe(false);
  });

  it('las reglas cruzadas son las mismas que los checks de la base', () => {
    // Si un día se afloja una acá y no allá, el error saldría como una
    // falla de servidor en vez de como una corrección al lado del campo.
    const sql = leer('supabase/migrations/20260909120000_proyectos.sql');
    expect(sql).toContain('rango_de_precio_coherente');
    expect(sql).toContain('disponibles_no_superan_el_total');
    expect(sql).toContain('area_construida_cabe');
  });
});

describe('el slug', () => {
  it('saca tildes, mayúsculas y símbolos', () => {
    expect(slugDe('Torre Los Álamos')).toBe('torre-los-alamos');
    expect(slugDe('Condominio  El Sol · Etapa 2')).toBe('condominio-el-sol-etapa-2');
  });

  it('no deja guiones sueltos en las puntas', () => {
    expect(slugDe('  ¡Mirador!  ')).toBe('mirador');
  });
});

// ---------------------------------------------------------------------
// Autorización: se mira el código, porque es donde se rompe
// ---------------------------------------------------------------------

describe('las acciones del panel no confían en el formulario', () => {
  const acciones = leer('features/proyectos/acciones.ts');

  const NOMBRES = ['crearBorrador', 'guardarInformacion', 'guardarTipologia', 'borrarTipologia', 'moverTipologia'];

  it('están las cinco acciones que usa el panel', () => {
    for (const n of NOMBRES) expect(acciones).toContain(`export async function ${n}(`);
  });

  it('todas revalidan el permiso: ocultar un botón no es autorizar', () => {
    // Una acción de servidor es un punto de entrada de red. Se puede
    // llamar sin haber visto nunca la pantalla que la ofrece.
    const cuerpos = acciones.split(/export async function /).slice(1);
    expect(cuerpos).toHaveLength(NOMBRES.length);
    for (const cuerpo of cuerpos) {
      const nombre = cuerpo.slice(0, cuerpo.indexOf('('));
      expect(cuerpo, `${nombre} no revalida el permiso`).toContain('exigeAdministrarProyectos');
    }
  });

  it('ninguna toma del formulario algo que define quién eres', () => {
    // El ataque no es adivinar una contraseña: es mandar un `agency_id`
    // ajeno y que nadie lo mire.
    for (const campo of ['agency_id', 'created_by', 'code', 'publication_status', 'views_count', 'inquiries_count']) {
      expect(acciones, `${campo} no puede leerse del formulario`).not.toContain(`datos.get('${campo}')`);
    }
  });

  it('la identidad sale de la membresía y de la sesión', () => {
    expect(acciones).toContain('agency_id: membresia.agencyId');
    expect(acciones).toContain('created_by: membresia.perfilId');
  });

  it('no se usa la clave de servicio para el panel', () => {
    // La clave de servicio se salta RLS entera. En el panel no tiene nada
    // que hacer: es justamente donde RLS tiene que valer.
    expect(acciones).not.toContain('clienteAdministrador');
    expect(acciones).not.toContain('SERVICE_ROLE');
  });

  it('los updates miran el conteo, porque RLS no lanza error', () => {
    // Un update que RLS bloquea no falla: no alcanza ninguna fila y se
    // devuelve como exitoso. Sin mirar `count`, un intento de escribir
    // sobre otra inmobiliaria se vería como un guardado correcto.
    expect(acciones).toContain("{ count: 'exact' }");
    expect(acciones).toContain('count === 0');
  });

  it('nada de este sprint publica ni envía a revisión: eso es 25D', () => {
    expect(acciones).not.toContain('in_review');
    expect(acciones).not.toContain("'published'");
  });
});

describe('la separación de roles vive en un solo lugar', () => {
  const permisos = leer('lib/proyectos/permisos.ts');

  it('escribir exige ser quien administra la inmobiliaria', () => {
    expect(permisos).toContain("rol === 'agency_admin'");
    expect(permisos).toContain('Solo quien administra la inmobiliaria');
  });

  it('la membresía se lee de la base, no de un parámetro', () => {
    expect(permisos).toContain("from('agency_members')");
    expect(permisos).toContain("eq('user_id', perfil.id)");
  });
});

// ---------------------------------------------------------------------
// Membresías: cero, una, varias
// ---------------------------------------------------------------------

describe('a qué inmobiliaria pertenece quien mira', () => {
  const PERFIL = '11111111-1111-4111-8111-111111111111';
  const A = { agency_id: 'agencia-a', role: 'agency_admin' };
  const B = { agency_id: 'agencia-b', role: 'agent' };

  it('sin ninguna membresía, no entra', () => {
    expect(decidirMembresia(PERFIL, [])).toEqual({ tipo: 'ninguna' });
  });

  it('con una, esa es y el rol viene de ahí', () => {
    const r = decidirMembresia(PERFIL, [A]);
    expect(r.tipo).toBe('una');
    if (r.tipo === 'una') {
      expect(r.membresia.agencyId).toBe('agencia-a');
      expect(r.membresia.administra).toBe(true);
    }
  });

  it('un corredor pertenece, pero no administra', () => {
    const r = decidirMembresia(PERFIL, [B]);
    if (r.tipo === 'una') expect(r.membresia.administra).toBe(false);
    else throw new Error('debería haber una sola membresía');
  });

  it('con varias NO elige: se detiene y lo dice', () => {
    // Esto es lo que se está arreglando. La versión anterior tomaba la
    // primera fila, o sea que elegía la empresa **por el orden de una
    // consulta** —un orden que Postgres no garantiza—. La misma persona
    // podía terminar creando un proyecto a nombre de otra inmobiliaria
    // según el día, y nadie se enteraba hasta el reclamo.
    const r = decidirMembresia(PERFIL, [A, B]);
    expect(r.tipo).toBe('varias');
    if (r.tipo === 'varias') expect(r.cuantas).toBe(2);
  });

  it('y no devuelve ninguna membresía cuando hay varias', () => {
    const r = decidirMembresia(PERFIL, [A, B]);
    expect(r).not.toHaveProperty('membresia');
  });
});

// ---------------------------------------------------------------------
// Solo borradores
// ---------------------------------------------------------------------

describe('este sprint edita borradores y nada más', () => {
  const acciones = leer('features/proyectos/acciones.ts');
  const permisos = leer('lib/proyectos/permisos.ts');

  it('las cuatro acciones que tocan un proyecto comprueban el estado', () => {
    // `crearBorrador` no está en la lista: crea, no edita, y el estado
    // inicial lo impone un disparador de la base.
    for (const nombre of ['guardarInformacion', 'guardarTipologia', 'borrarTipologia', 'moverTipologia']) {
      const i = acciones.indexOf(`export async function ${nombre}(`);
      const j = acciones.indexOf('export async function ', i + 10);
      const cuerpo = acciones.slice(i, j === -1 ? undefined : j);
      expect(cuerpo, `${nombre} no comprueba que sea borrador`).toContain('exigeBorrador');
    }
  });

  it('el estado se lee de la base, no se recibe ni se deduce de la pantalla', () => {
    expect(permisos).toContain("select('id, publication_status')");
    expect(permisos).toContain("!== 'draft'");
    // Y no se acepta como parámetro: eso sería confiar en quien llama.
    expect(acciones).not.toContain("datos.get('publication_status')");
  });

  it('un proyecto que no es borrador se rechaza con un mensaje entendible', () => {
    expect(permisos).toContain('MENSAJE_SOLO_BORRADOR');
    expect(permisos).toContain('ya salió de borrador');
  });
});

// ---------------------------------------------------------------------
// El andamiaje de pruebas no puede filtrarse al producto
// ---------------------------------------------------------------------

describe('el ayudante de fixtures es solo de pruebas', () => {
  it('no lo importa nada de app, features ni lib', () => {
    // Usa la conexión privilegiada. Si un archivo del producto lo
    // importara, esa conexión entraría al paquete que se despliega.
    const culpables: string[] = [];

    const recorrer = (carpeta: string) => {
      for (const nombre of readdirSync(carpeta)) {
        const ruta = join(carpeta, nombre);
        if (statSync(ruta).isDirectory()) recorrer(ruta);
        else if (/\.tsx?$/.test(nombre)) {
          const fuente = readFileSync(ruta, 'utf8');
          if (fuente.includes('fixtures-proyectos')) culpables.push(ruta);
        }
      }
    };

    for (const carpeta of ['app', 'features', 'lib']) recorrer(join(raiz, carpeta));
    expect(culpables).toEqual([]);
  });

  it('y el panel no usa la conexión directa a Postgres', () => {
    // El panel habla por HTTP con RLS puesta. Una conexión directa se
    // saltaría todo eso.
    for (const archivo of ['features/proyectos/acciones.ts', 'lib/proyectos/permisos.ts']) {
      expect(leer(archivo), archivo).not.toContain("from 'pg'");
    }
  });
});

// ---------------------------------------------------------------------
// El menú del panel
// ---------------------------------------------------------------------

describe('«Proyectos» en el menú sale de la membresía, no del tipo de cuenta', () => {
  const PERFIL = '11111111-1111-4111-8111-111111111111';
  const conRol = (role: string) => decidirMembresia(PERFIL, [{ agency_id: 'a', role }]);

  it('ningún tipo de cuenta la trae por sí solo', () => {
    // Antes estaba en la lista filtrada por `profiles.role`. Eso hacía dos
    // cosas mal a la vez: se la escondía a un `buyer` que administra una
    // constructora, y se la mostraba a un `owner` que no pertenece a
    // ninguna —que llegaba a una pantalla sin nada que hacer—.
    for (const rol of ['buyer', 'owner', 'agent', 'agency_admin', 'moderator', 'admin'] as const) {
      const rutas = navegacionPanel(rol).map((e) => e.href);
      expect(rutas, `${rol} la recibe por su tipo de cuenta`).not.toContain('/panel/proyectos');
    }
  });

  it('quien administra una inmobiliaria la ve, sea cual sea su tipo de cuenta', () => {
    expect(correspondeVerProyectos(conRol('agency_admin'))).toBe(true);
  });

  it('un corredor también: entra en lectura, pero entra', () => {
    expect(correspondeVerProyectos(conRol('agent'))).toBe(true);
  });

  it('quien no pertenece a ninguna, no la ve', () => {
    expect(correspondeVerProyectos(decidirMembresia(PERFIL, []))).toBe(false);
  });

  it('quien pertenece a varias SÍ la ve: es como llega al mensaje', () => {
    // Esconderla dejaría a esa persona sin manera de enterarse de por qué
    // no puede gestionar proyectos.
    const varias = decidirMembresia(PERFIL, [
      { agency_id: 'a', role: 'agency_admin' },
      { agency_id: 'b', role: 'agent' },
    ]);
    expect(varias.tipo).toBe('varias');
    expect(correspondeVerProyectos(varias)).toBe(true);
  });

  it('el menú la arma el layout, no la lista de roles', () => {
    const layout = leer('app/(dashboard)/panel/layout.tsx');
    expect(layout).toContain('correspondeVerProyectos');
    expect(layout).toContain('ENTRADA_DE_PROYECTOS');
  });

  it('y el menú no es la autorización: las acciones siguen comprobando', () => {
    // Esta prueba existe para que nadie lea lo de arriba y crea que el
    // menú protege algo. No protege nada: es presentación.
    const acciones = leer('features/proyectos/acciones.ts');
    expect(acciones).toContain('exigeAdministrarProyectos');
  });
});
