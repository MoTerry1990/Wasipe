import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { aJsonSeguro } from '@/lib/seo/json-seguro';

/**
 * Revisión de seguridad, escrita como pruebas.
 *
 * Un documento de auditoría envejece en cuanto alguien toca el código.
 * Estas pruebas no: si mañana vuelve a aparecer una interpolación sin
 * escapar o una clave de servicio en un componente de cliente, falla el
 * build antes de que llegue a producción.
 */

const RAIZ = join(__dirname, '..', '..');

function archivos(carpeta: string, extensiones: RegExp): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(carpeta)) {
    if (nombre === 'node_modules' || nombre === '.next') continue;
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta, extensiones));
    else if (extensiones.test(nombre)) salida.push(ruta);
  }
  return salida;
}

/**
 * Lee las fuentes con los finales de linea normalizados.
 *
 * El retorno de carro no es un detalle cosmetico aca. Estas pruebas
 * analizan texto, y varias quitan comentarios con expresiones que
 * terminan en $. En JavaScript el CR es un terminador de linea: el
 * punto no lo cruza y el $ sin la bandera m exige el final de la
 * cadena, asi que en un archivo con CRLF **el reemplazo no ocurre** y
 * el comentario se queda.
 *
 * Esto no es teorico. `core.autocrlf` esta en `true` en este
 * repositorio, o sea que en Windows todo archivo recien sacado de git
 * llega con CRLF. El guardian de P-13 dio un falso positivo apenas se
 * revirtio un commit de formato: la unica diferencia era que prettier
 * habia normalizado esos archivos a LF, y sin esa casualidad el
 * guardian leia mal.
 *
 * Un guardian de seguridad cuyo resultado depende de los finales de
 * linea no es un guardian. Se normaliza aca, una vez, para todas.
 */
const leer = (rutas: string[]) =>
  rutas.map((ruta) => ({
    ruta: relative(RAIZ, ruta).split(sep).join('/'),
    fuente: readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n'),
  }));

const FUENTES = leer(
  ['app', 'components', 'features', 'lib', 'config'].flatMap((c) =>
    archivos(join(RAIZ, c), /\.(ts|tsx)$/),
  ),
);

// ---------------------------------------------------------------------
// P-01 · XSS almacenado en el sitio anterior
// ---------------------------------------------------------------------

const LEGACY = leer(archivos(join(RAIZ, 'legacy', 'public'), /\.html$/));

/**
 * Los campos que la API devuelve y que alguien puede escribir. El título
 * de un aviso es el caso claro: la validación solo comprobaba el largo.
 */
const DE_LA_API = [
  'p.titulo',
  'p.distrito',
  'p.provincia',
  'p.descripcion',
  'p.slug',
  'p.publica',
  'x.distrito',
  'r.distrito',
  'err.message',
  'e.message',
];

describe('P-01: el sitio anterior escapa lo que dibuja', () => {
  it('hay páginas que revisar', () => {
    expect(LEGACY.length).toBeGreaterThan(4);
  });

  it('ningún campo de la API se interpola sin escapar', () => {
    const crudos: string[] = [];

    for (const pagina of LEGACY) {
      for (const campo of DE_LA_API) {
        // `${p.titulo}` a secas es la vulnerabilidad.
        // `${esc(p.titulo)}` es la corrección.
        if (pagina.fuente.includes('${' + campo + '}')) {
          crudos.push(`${pagina.ruta}: \${${campo}}`);
        }
      }
    }

    expect(crudos).toEqual([]);
  });

  it('las páginas que dibujan datos importan el escapador', () => {
    const conDatos = LEGACY.filter((p) => p.fuente.includes('esc('));
    expect(conDatos.length).toBeGreaterThan(3);

    for (const pagina of conDatos) {
      expect(pagina.fuente, pagina.ruta).toMatch(
        /import \{[^}]*\besc\b[^}]*\} from '\/cuenta\.js'/,
      );
    }
  });

  it('las direcciones de imagen pasan por escUrl, no por esc', () => {
    // Escapar el HTML no alcanza en un `src`: `javascript:alert(1)` no
    // tiene ni un carácter especial y corre igual.
    for (const pagina of LEGACY) {
      expect(pagina.fuente, pagina.ruta).not.toMatch(/src="\$\{p\.portada\}"/);
      expect(pagina.fuente, pagina.ruta).not.toMatch(/src="\$\{esc\(p\.portada\)\}"/);
    }
  });
});

describe('el escapador del sitio anterior', () => {
  const cuenta = readFileSync(join(RAIZ, 'legacy', 'public', 'cuenta.js'), 'utf8');

  it('escapa los cinco caracteres, y el ampersand primero', () => {
    // Si `&` se escapa después, convierte los que acaban de introducir
    // los otros reemplazos y sale `&amp;lt;` en pantalla.
    const orden = ['&', '<', '>', '"', "'"].map((c) => cuenta.indexOf(`'${c}'`));
    expect(cuenta).toContain("replaceAll('&', '&amp;')");
    expect(orden[0]).toBeLessThan(orden[1]!);
  });

  it('escUrl solo deja pasar http, https y rutas propias', () => {
    expect(cuenta).toMatch(/\^\(https\?:\\\/\\\/\|\\\/\)/);
  });
});

// ---------------------------------------------------------------------
// XSS en la aplicación nueva
// ---------------------------------------------------------------------

describe('los datos estructurados no se pueden romper', () => {
  it('un título con </script> no cierra el bloque', () => {
    const veneno = { name: 'Lindo depa </script><img src=x onerror=alert(1)>' };
    const salida = aJsonSeguro(veneno);

    expect(salida).not.toContain('</script>');
    expect(salida).not.toContain('<');
    expect(salida).toContain('\\u003c');
  });

  it('ni un comentario HTML cambia cómo se lee el resto', () => {
    expect(aJsonSeguro({ x: '<!--' })).not.toContain('<!--');
    expect(aJsonSeguro({ x: '-->' })).not.toContain('-->');
  });

  it('y sigue siendo el mismo dato al leerlo', () => {
    // `\\u003c` dentro de una cadena JSON ES `<`. Un buscador lee el
    // título correcto; el navegador ya no ve una etiqueta que cerrar.
    const original = { name: 'Depa <con> "comillas" & símbolos' };
    expect(JSON.parse(aJsonSeguro(original))).toEqual(original);
  });

  it('nadie serializa a mano dentro de un script', () => {
    const culpables = FUENTES.filter(
      (a) =>
        a.fuente.includes('dangerouslySetInnerHTML') &&
        a.fuente.includes('JSON.stringify') &&
        !a.fuente.includes('aJsonSeguro'),
    ).map((a) => a.ruta);

    expect(culpables).toEqual([]);
  });

  it('y no hay ningún otro innerHTML suelto', () => {
    const culpables = FUENTES.filter(
      (a) =>
        a.fuente.includes('dangerouslySetInnerHTML') && a.ruta !== 'components/ui/migas.tsx',
    ).map((a) => a.ruta);

    // Un solo archivo puede escribir HTML crudo. Si aparece otro, hay
    // que mirarlo a mano antes de dejarlo pasar.
    expect(culpables).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// Secretos
// ---------------------------------------------------------------------

describe('los secretos', () => {
  it('ninguna clave de servicio sale de lib/supabase/entorno.ts', () => {
    const culpables = FUENTES.filter(
      (a) =>
        a.fuente.includes('SUPABASE_SERVICE_ROLE_KEY') && a.ruta !== 'lib/supabase/entorno.ts',
    ).map((a) => a.ruta);
    expect(culpables).toEqual([]);
  });

  it('ninguna clave de proveedor lleva el prefijo del navegador', () => {
    /**
     * La única excepción legítima. La clave anónima de Supabase está
     * hecha para ir en el navegador: no da más permisos que los que RLS
     * concede a un visitante, y sin ella el cliente no puede autenticar
     * a nadie. Que sea pública no la hace peligrosa; lo que la haría
     * peligrosa es una política de RLS mal escrita, y eso se prueba en
     * `tests/base-datos/`.
     */
    const PUBLICA_A_PROPOSITO = ['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

    const culpables: string[] = [];
    for (const a of FUENTES) {
      for (const encontrado of a.fuente.matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) {
        const nombre = encontrado[0];
        if (PUBLICA_A_PROPOSITO.includes(nombre)) continue;
        if (/KEY|SECRET|TOKEN|PASSWORD|SERVICE/.test(nombre)) {
          culpables.push(`${a.ruta}: ${nombre}`);
        }
      }
    }
    expect([...new Set(culpables)]).toEqual([]);
  });

  it('no hay ninguna credencial escrita en el código', () => {
    const sospechosos: string[] = [];
    const patrones = [
      // Claves de las plataformas que Wasipe usa o va a usar.
      /sk-ant-[A-Za-z0-9-]{20,}/,
      /sk_live_[A-Za-z0-9]{16,}/,
      /pk_live_[A-Za-z0-9]{16,}/,
      /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{30,}/,
      /AKIA[0-9A-Z]{16}/,
    ];

    for (const a of FUENTES) {
      for (const patron of patrones) {
        if (patron.test(a.fuente)) sospechosos.push(`${a.ruta}: ${patron.source}`);
      }
    }
    expect(sospechosos).toEqual([]);
  });

  it('el ejemplo de entorno no trae ningún valor de verdad', () => {
    const ejemplo = readFileSync(join(RAIZ, '.env.example'), 'utf8');

    for (const linea of ejemplo.split('\n')) {
      if (!linea.includes('=') || linea.trim().startsWith('#')) continue;
      const valor = linea.split('=').slice(1).join('=').trim();
      // Vacío o un marcador. Nunca algo que parezca una clave.
      expect(valor.length, linea).toBeLessThan(60);
      expect(valor, linea).not.toMatch(/^(sk-|sk_live|eyJ|AKIA)/);
    }
  });
});

// ---------------------------------------------------------------------
// Registros
// ---------------------------------------------------------------------

describe('lo que se escribe en los registros', () => {
  it('nadie registra un correo, un teléfono ni una clave', () => {
    const culpables: string[] = [];

    for (const a of FUENTES) {
      for (const linea of a.fuente.split('\n')) {
        if (!/console\.(log|info|warn|error)/.test(linea)) continue;
        // Un registro con datos personales termina en el panel de
        // Vercel, que ve todo el equipo, y ahí ya no lo borra nadie.
        if (/\b(email|correo|phone|telefono|password|clave|whatsapp|dni|ruc)\b/i.test(linea)) {
          culpables.push(`${a.ruta}: ${linea.trim().slice(0, 80)}`);
        }
      }
    }

    expect(culpables).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// P-13 · El original de una foto nunca en un depósito público
// ---------------------------------------------------------------------
/**
 * Esta es la prueba que faltó en el sprint 18.
 *
 * Ese sprint creó el depósito privado `originales`, escribió la capa
 * `lib/almacenamiento/` y dio P-13 por cerrado. Todo eso era cierto y
 * nada de eso estaba conectado: `features/publicar/fotos.tsx` es un
 * componente de cliente, no podía importar una capa `server-only`, y
 * siguió escribiendo `'avisos'` a mano —el bucket público— para el
 * archivo sin tocar. Con sus metadatos EXIF y las coordenadas GPS de la
 * casa adentro, accesibles adivinando la ruta.
 *
 * El sprint 21 verificó que el bucket privado era inaccesible, y pasó:
 * estaba vacío. Nadie verificó por dónde entraban las fotos de verdad.
 *
 * Una prueba de comportamiento no lo habría visto tampoco —subir una
 * foto «funciona» de las dos maneras—. Por eso esta mira el código.
 */
describe('el original de una foto no puede terminar en un depósito público', () => {
  const PUBLICOS = ['avisos', 'avatares', 'logos'];

  /** Las fuentes que manejan fotos de un aviso. */
  const DE_FOTOS = FUENTES.filter(
    ({ ruta }) => ruta.startsWith('features/publicar/') || ruta.startsWith('features/avisos/'),
  );

  it('ninguna nombra un bucket a mano: pasan por BUCKET_DE', () => {
    const culpables = DE_FOTOS.filter(({ fuente }) =>
      PUBLICOS.some((b) => fuente.includes(".from('" + b + "')")),
    ).map(({ ruta }) => ruta);

    // Un literal suelto es exactamente cómo empezó P-13: el mapa decía
    // una cosa y la llamada real decía otra, y nadie las comparó.
    expect(culpables).toEqual([]);
  });

  it('donde se arma la ruta del original, el depósito es el privado', () => {
    let revisadas = 0;

    for (const { ruta, fuente } of DE_FOTOS) {
      const lineas = fuente.split('\n');

      lineas.forEach((linea, i) => {
        if (!/rutaDeFoto\([^)]*,\s*true\s*\)/.test(linea)) return;
        revisadas++;

        // Sin comentarios: el que explica por qué esto cambió nombra el
        // bucket viejo, y la prueba tiene que mirar el código, no la
        // prosa que lo rodea.
        const alrededor = lineas
          .slice(Math.max(0, i - 4), i + 8)
          .map((l) => l.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, ''))
          .join('\n');
        const donde = ruta + ':' + (i + 1);

        // Vale el nombre lógico del depósito o el del mapa.
        expect(
          /BUCKET_DE\.originales|'originales'/.test(alrededor),
          donde + ' arma la ruta del original sin nombrar el depósito privado',
        ).toBe(true);

        expect(
          PUBLICOS.some((b) => alrededor.includes(b)),
          donde + ' arma la ruta del original cerca de un depósito público',
        ).toBe(false);
      });
    }

    // Sin esto, el día que nadie suba originales la prueba pasaría sin
    // haber comprobado nada, que es la forma más silenciosa de fallar.
    expect(revisadas).toBeGreaterThan(0);
  });

  it('y el depósito de originales está declarado privado', async () => {
    const { DEPOSITOS } = await import('@/lib/almacenamiento/proveedor');
    expect(DEPOSITOS.originales.publico).toBe(false);
    expect(DEPOSITOS.generadas.publico).toBe(false);
    expect(DEPOSITOS.videos.publico).toBe(false);
  });
});
