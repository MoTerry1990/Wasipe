/**
 * Divide un archivo .sql en sentencias.
 *
 * Recorre carácter por carácter, no línea por línea, porque hay que
 * respetar cuatro contextos donde un `;` NO separa nada:
 *
 *   · comentario de línea      -- hasta el fin de línea
 *   · comentario de bloque     /* ... *\/  (anidables en Postgres)
 *   · cadena entre comillas    'texto; con punto y coma'
 *   · cadena con dólar         $$ ... $$   y con etiqueta  $mig$ ... $mig$
 *
 * Una sola implementación, usada por el runner de migraciones y por las
 * pruebas: si difirieran, las pruebas dejarían de valer.
 */

const ES_ETIQUETA = /[A-Za-z0-9_]/;

export function dividirSql(texto) {
  const sentencias = [];
  let actual = '';
  let i = 0;

  const empujar = () => {
    const s = actual.trim();
    if (s && s !== ';') sentencias.push(s);
    actual = '';
  };

  while (i < texto.length) {
    const c = texto[i];
    const dos = texto.slice(i, i + 2);

    // -- comentario de línea
    if (dos === '--') {
      const fin = texto.indexOf('\n', i);
      i = fin === -1 ? texto.length : fin + 1;
      actual += '\n';
      continue;
    }

    // comentario de bloque, con anidamiento
    if (dos === '/*') {
      let nivel = 1;
      i += 2;
      while (i < texto.length && nivel > 0) {
        if (texto.slice(i, i + 2) === '/*') { nivel++; i += 2; }
        else if (texto.slice(i, i + 2) === '*/') { nivel--; i += 2; }
        else i++;
      }
      continue;
    }

    // 'cadena' con '' como escape
    if (c === "'") {
      actual += c; i++;
      while (i < texto.length) {
        if (texto[i] === "'" && texto[i + 1] === "'") { actual += "''"; i += 2; continue; }
        if (texto[i] === "'") { actual += "'"; i++; break; }
        actual += texto[i]; i++;
      }
      continue;
    }

    // "identificador entre comillas dobles"
    if (c === '"') {
      actual += c; i++;
      while (i < texto.length) {
        actual += texto[i];
        if (texto[i] === '"') { i++; break; }
        i++;
      }
      continue;
    }

    // $etiqueta$ ... $etiqueta$
    if (c === '$') {
      const etiqueta = leerEtiquetaDolar(texto, i);
      if (etiqueta) {
        const cierre = texto.indexOf(etiqueta, i + etiqueta.length);
        const hasta = cierre === -1 ? texto.length : cierre + etiqueta.length;
        actual += texto.slice(i, hasta);
        i = hasta;
        continue;
      }
    }

    if (c === ';') { actual += c; empujar(); i++; continue; }

    actual += c;
    i++;
  }

  empujar();
  return sentencias;
}

/** Devuelve "$$" o "$etiqueta$" si en `i` empieza una, o null. */
function leerEtiquetaDolar(texto, i) {
  if (texto[i] !== '$') return null;
  let j = i + 1;
  while (j < texto.length && ES_ETIQUETA.test(texto[j])) j++;
  return texto[j] === '$' ? texto.slice(i, j + 1) : null;
}
