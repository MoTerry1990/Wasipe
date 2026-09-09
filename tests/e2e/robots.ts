/**
 * Evaluador de `robots.txt`: ¿este robot puede rastrear esta ruta?
 *
 * Existe para poder afirmar lo mismo en los dos entornos sin partir la
 * prueba en dos ramas. El problema de una rama es que la mitad que no se
 * ejecuta no comprueba nada, y una prueba que en cierto entorno no afirma
 * nada es un `skip` con otro nombre.
 *
 * Con esto, en cambio, la afirmación es una sola y vale siempre:
 *
 *     lo privado   → nunca rastreable, en producción y fuera de ella
 *     lo público   → rastreable si y solo si es producción
 *
 * Las dos corren en todos los entornos. Si el servidor sirviera el
 * contrato equivocado —abierto en un Preview, cerrado en producción—,
 * fallan; no se acomodan.
 *
 * Implementa las reglas del estándar que importan acá: gana el patrón más
 * largo que coincida, `Allow` gana los empates, un `Disallow:` vacío no
 * bloquea nada, y `*` y `$` valen dentro del patrón.
 */

type Regla = { permite: boolean; patron: string };

/** Traduce un patrón de robots.txt a una expresión regular anclada al inicio. */
function coincide(patron: string, ruta: string): boolean {
  // Se escapa todo, incluido el `*`, y recién después se le devuelve su
  // valor de comodín. Al revés, el escape convertiría en literal el punto
  // que se acaba de poner.
  const escapado = patron.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');

  // Un `$` al final del patrón ancla el final de la ruta.
  const anclado = escapado.endsWith('\\$')
    ? '^' + escapado.slice(0, -2) + '$'
    : '^' + escapado;

  return new RegExp(anclado).test(ruta);
}

/** Las reglas del grupo `User-agent: *`, que es el único que usamos. */
function reglasDe(cuerpo: string): Regla[] {
  const reglas: Regla[] = [];
  let dentroDelGrupo = false;

  for (const linea of cuerpo.split('\n')) {
    const limpia = linea.trim();
    if (limpia === '' || limpia.startsWith('#')) continue;

    const corte = limpia.indexOf(':');
    if (corte === -1) continue;

    const clave = limpia.slice(0, corte).trim().toLowerCase();
    const valor = limpia.slice(corte + 1).trim();

    if (clave === 'user-agent') {
      dentroDelGrupo = valor === '*';
      continue;
    }
    if (!dentroDelGrupo) continue;
    if (clave === 'allow') reglas.push({ permite: true, patron: valor });
    if (clave === 'disallow') reglas.push({ permite: false, patron: valor });
  }

  return reglas;
}

/**
 * `true` si un robot que respeta el archivo puede pedir esa ruta.
 *
 * Sin ninguna regla que coincida, se puede: así funciona el estándar, y
 * es la respuesta correcta para un `robots.txt` vacío o ausente.
 */
export function rastreable(cuerpo: string, ruta: string): boolean {
  let mejor: Regla | null = null;

  for (const regla of reglasDe(cuerpo)) {
    // `Disallow:` sin valor significa «no bloqueo nada».
    if (regla.patron === '') continue;
    if (!coincide(regla.patron, ruta)) continue;

    const masLargo = !mejor || regla.patron.length > mejor.patron.length;
    const empateQuePermite =
      mejor !== null && regla.patron.length === mejor.patron.length && regla.permite;

    if (masLargo || empateQuePermite) mejor = regla;
  }

  return mejor ? mejor.permite : true;
}

/** `true` si el archivo ofrece un sitemap. */
export const ofreceSitemap = (cuerpo: string) => /^\s*Sitemap:\s*\S+/im.test(cuerpo);
