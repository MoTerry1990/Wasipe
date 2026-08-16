import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Que la clave de servicio no llegue al navegador.
 *
 * `SUPABASE_SERVICE_ROLE_KEY` se salta toda la seguridad a nivel de fila.
 * Si aparece en un componente de cliente, Next la mete en el paquete de
 * JavaScript y cualquiera la lee con dos clics. Esta prueba lo vigila de
 * forma estática, antes de que llegue a producción.
 */

const RAIZ = join(__dirname, '..', '..');
const CARPETAS = ['app', 'components', 'features', 'lib', 'config', 'types'];

function archivos(carpeta: string): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(carpeta)) {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta));
    else if (/\.(ts|tsx|mjs|js)$/.test(nombre)) salida.push(ruta);
  }
  return salida;
}

const TODOS = CARPETAS.flatMap((c) => archivos(join(RAIZ, c))).map((ruta) => ({
  ruta: relative(RAIZ, ruta).split(sep).join('/'),
  fuente: readFileSync(ruta, 'utf8'),
}));

const esCliente = (fuente: string) => /^\s*['"]use client['"]/m.test(fuente);

describe('clave de servicio', () => {
  it('solo se nombra donde corresponde', () => {
    const culpables = TODOS.filter(
      (a) =>
        a.fuente.includes('SUPABASE_SERVICE_ROLE_KEY') && a.ruta !== 'lib/supabase/entorno.ts',
    ).map((a) => a.ruta);

    // Un único punto de lectura: si hace falta otro, hay que pensarlo dos veces.
    expect(culpables).toEqual([]);
  });

  it('nunca lleva el prefijo NEXT_PUBLIC_', () => {
    const culpables = TODOS.filter((a) => /NEXT_PUBLIC_[A-Z_]*SERVICE/.test(a.fuente)).map(
      (a) => a.ruta,
    );
    expect(culpables).toEqual([]);
  });

  it('ningún componente de cliente importa el cliente administrador', () => {
    const culpables = TODOS.filter(
      (a) => esCliente(a.fuente) && a.fuente.includes('supabase/administrador'),
    ).map((a) => a.ruta);
    expect(culpables).toEqual([]);
  });

  it('los módulos de servidor están marcados con server-only', () => {
    for (const nombre of ['lib/supabase/servidor.ts', 'lib/supabase/administrador.ts']) {
      const archivo = TODOS.find((a) => a.ruta === nombre);
      expect(archivo, `falta ${nombre}`).toBeDefined();
      // Con esto, importarlo desde el cliente rompe el build en vez de
      // filtrar la clave en silencio.
      expect(archivo!.fuente).toMatch(/^import 'server-only';/m);
    }
  });

  it('el cliente administrador revienta si lo llaman desde el navegador', () => {
    const entorno = TODOS.find((a) => a.ruta === 'lib/supabase/entorno.ts')!;
    // Segundo cinturón, por si alguien quita el import de server-only.
    expect(entorno.fuente).toContain("typeof window !== 'undefined'");
  });
});

describe('secretos en el repositorio', () => {
  it('ningún archivo de la aplicación trae una clave escrita a mano', () => {
    const patrones = [
      /eyJhbGciOi[A-Za-z0-9._-]{20,}/, // JWT: las claves de Supabase lo son
      /sk_(live|test)_[A-Za-z0-9]{16,}/, // Culqi / Stripe
      /postgres(ql)?:\/\/[^\s:]+:[^\s@]+@/, // conexión con contraseña
    ];

    const culpables = TODOS.filter((a) => patrones.some((p) => p.test(a.fuente))).map(
      (a) => a.ruta,
    );
    expect(culpables).toEqual([]);
  });

  it('la plantilla .env.example no trae ningún valor real', () => {
    const plantilla = readFileSync(join(RAIZ, '.env.example'), 'utf8');
    const conValor = plantilla
      .split('\n')
      .filter((linea) => /^[A-Z_]+=.+/.test(linea))
      // La cadena de ejemplo de Postgres y la URL del sitio son
      // marcadores de posición, no credenciales.
      .filter((linea) => !/^DATABASE_URL=postgresql:\/\/usuario:/.test(linea))
      .filter((linea) => !/^(URL_SITIO|NEXT_PUBLIC_URL_SITIO)=/.test(linea))
      // IA_PROVEEDOR elige un adaptador por su nombre. No es una clave:
      // es la opción por defecto, y verla escrita es justamente lo que
      // muestra que se puede cambiar.
      .filter((linea) => !/^IA_PROVEEDOR(_IMAGEN|_VIDEO)?=/.test(linea))
      // `PAGOS_EN_VIVO=no` tampoco es una credencial: es el valor seguro
      // por defecto, y tiene que estar escrito. Dejarlo vacío haría que
      // «apagado» dependa de que nadie lo complete, en vez de ser una
      // decisión declarada.
      .filter((linea) => !/^PAGOS_EN_VIVO=no\s*$/.test(linea))
      // `NEXT_PUBLIC_ENTORNO=desarrollo` es el valor por defecto en local
      // y tampoco es una credencial. Vercel lo pisa solo con `preview` o
      // `production`.
      .filter((linea) => !/^NEXT_PUBLIC_ENTORNO=desarrollo\s*$/.test(linea));

    expect(conValor).toEqual([]);
  });
});
