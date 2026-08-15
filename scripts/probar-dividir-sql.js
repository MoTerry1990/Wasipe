/** Pruebas del divisor de SQL. Es código que corre en el deploy: si se
 *  equivoca, la migración falla en producción.  node scripts/probar-dividir-sql.js */
import { dividirSql } from '../src/db/dividir-sql.js';

let fallos = 0;
const ok = (cond, nombre, detalle = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}${detalle ? ' — ' + detalle : ''}`);
  if (!cond) fallos++;
};

console.log('\n  Divisor de SQL\n');

ok(dividirSql('SELECT 1; SELECT 2;').length === 2, 'dos sentencias simples');
ok(dividirSql('-- comentario\nSELECT 1;').length === 1, 'ignora comentarios de línea');
ok(dividirSql('SELECT 1').length === 1, 'acepta la última sin punto y coma');
ok(dividirSql('\n\n  \n').length === 0, 'texto vacío no produce sentencias');

{
  const sql = [
    'CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS',
    '$$ BEGIN NEW.x := 1; RETURN NEW; END $$;',
    'SELECT 2;',
  ].join('\n');
  const r = dividirSql(sql);
  ok(r.length === 2, 'el ; dentro de $$ ... $$ no separa', `${r.length} sentencias`);
  ok(r[0].includes('RETURN NEW'), 'la función queda entera');
}

{
  // El caso que rompía: etiqueta con nombre.
  const sql = [
    'DO $mig$',
    'BEGIN',
    '  ALTER TABLE a ADD COLUMN y int;',
    'EXCEPTION WHEN duplicate_object THEN NULL;',
    'END',
    '$mig$;',
    'SELECT 3;',
  ].join('\n');
  const r = dividirSql(sql);
  ok(r.length === 2, 'el ; dentro de $mig$ ... $mig$ no separa', `${r.length} sentencias`);
  ok(r[0].includes('EXCEPTION'), 'el bloque DO queda entero');
}

{
  // Una etiqueta distinta adentro es texto literal, no cierra.
  const sql = "SELECT $out$ hola $in$ mundo $out$; SELECT 4;";
  const r = dividirSql(sql);
  ok(r.length === 2, 'una etiqueta distinta anidada no cierra la de afuera', `${r.length}`);
}

{
  const sql = 'INSERT INTO t VALUES (1);\n-- final\n';
  ok(dividirSql(sql).length === 1, 'comentario al final no genera sentencia vacía');
}

console.log(fallos === 0 ? '\n  ✓ Todo en verde.\n' : `\n  ✗ ${fallos} fallo(s).\n`);
process.exit(fallos === 0 ? 0 : 1);
