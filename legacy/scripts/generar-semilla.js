/**
 * Genera 004_datos_semilla.sql a partir de los datos en scripts/datos/.
 *
 * Va como migración, no como script aparte, porque en un deploy manual
 * nadie corre scripts: sin ubicaciones el autocompletado del asistente
 * queda vacío y no se puede publicar nada.
 *
 *   node scripts/generar-semilla.js
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UBICACIONES } from './datos/ubicaciones.js';

const SALIDA = join(
  dirname(fileURLToPath(import.meta.url)), '..', 'src', 'db', 'migraciones', '004_datos_semilla.sql',
);

const txt = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => (v === null || v === undefined ? 'NULL' : String(v));
const arr = (a) => (a?.length ? `ARRAY[${a.map(txt).join(',')}]` : `'{}'`);

/* ------------------------------ ubicaciones ----------------------------- */

const ubic = UBICACIONES.map(
  ([dep, prov, dist, slug, alias, lat, lng, dest]) =>
    `  (${txt(dep)},${txt(prov)},${txt(dist)},${txt(slug)},${arr(alias)},${num(lat)},${num(lng)},${dest ? 'true' : 'false'})`,
).join(',\n');

/* ---------------------------- características --------------------------- */

const CARACTERISTICAS = [
  ['ascensor', 'Ascensor', 'edificio'],
  ['cochera', 'Cochera', 'edificio'],
  ['piscina', 'Piscina', 'exterior'],
  ['gimnasio', 'Gimnasio', 'edificio'],
  ['acepta-mascotas', 'Acepta mascotas', 'servicios'],
  ['amoblado', 'Amoblado', 'interior'],
  ['seguridad-24h', 'Seguridad 24h', 'seguridad'],
  ['areas-comunes', 'Áreas comunes', 'edificio'],
  ['balcon', 'Balcón', 'exterior'],
  ['deposito', 'Depósito', 'edificio'],
  ['terraza', 'Terraza', 'exterior'],
  ['jardin', 'Jardín', 'exterior'],
  ['sala-de-juegos', 'Sala de juegos', 'edificio'],
  ['vista-al-mar', 'Vista al mar', 'entorno'],
  ['cerca-al-parque', 'Cerca a un parque', 'entorno'],
  ['agua-caliente', 'Agua caliente', 'servicios'],
  ['cocina-equipada', 'Cocina equipada', 'interior'],
  ['closet-empotrado', 'Clósets empotrados', 'interior'],
];
const car = CARACTERISTICAS.map(
  ([slug, nombre, grupo], i) => `  (${txt(slug)},${txt(nombre)},${txt(grupo)},${i})`,
).join(',\n');

/* -------------------------------- planes -------------------------------- */
// Precios y topes de MONETIZACION.md + COMPETENCIA.md §5.2 (gratis = 2 avisos).
const PLANES = [
  // slug, nombre, precio, periodo, avisos, fotos, asientos, indice, destacados, dias, tel, roles, orden
  ['gratis', 'Gratis', 0, 'gratis', 2, 8, 1, 5, 0, 90, false, ['comprador', 'propietario'], 1],
  ['dueno-plus', 'Dueño Plus', 39, 'unico', 3, 30, 1, null, 1, 90, true, ['propietario'], 2],
  ['agente-inicial', 'Agente Inicial', 69, 'mensual', 8, 25, 1, null, 2, 90, true, ['agente'], 3],
  ['agente', 'Agente', 139, 'mensual', 20, 40, 1, null, 6, 90, true, ['agente'], 4],
  ['agente-pro', 'Agente Pro', 249, 'mensual', 50, 60, 1, null, 15, 90, true, ['agente'], 5],
  ['inmobiliaria', 'Inmobiliaria', 449, 'mensual', 100, 60, 3, null, 25, 120, true, ['inmobiliaria'], 6],
  ['inmobiliaria-plus', 'Inmobiliaria Plus', 899, 'mensual', 300, 80, 10, null, 60, 120, true, ['inmobiliaria'], 7],
  ['corporativa', 'Corporativa', 1899, 'mensual', null, 100, 30, null, 150, 120, true, ['inmobiliaria'], 8],
];
const pla = PLANES.map(
  ([s, n, p, per, av, fo, as_, ix, de, di, tel, roles, or_]) =>
    `  (${txt(s)},${txt(n)},${num(p)},'PEN',${txt(per)},${num(av)},${num(fo)},${num(as_)},` +
    `${num(ix)},${num(de)},${num(di)},${tel ? 'true' : 'false'},${arr(roles)},${num(or_)})`,
).join(',\n');

/* -------------------------------- índice -------------------------------- */
/**
 * Valores de ARRANQUE, no datos de mercado.
 *
 * Se cargan con muestras = 0, lo que la API traduce a confianza
 * "provisional" y la UI muestra como tal. Sirven para que el panel y el
 * badge "vs mercado" funcionen desde el primer día, NO para publicarlos
 * como si fueran un estudio.
 *
 * Reemplazar con el CSV mensual real antes de tener usuarios de verdad:
 * si los números se sienten inventados, se pierde la confianza y con ella
 * el argumento entero del producto.
 */
const INDICE = [
  ['san-isidro', 2600, 4200], ['miraflores', 2300, 3900], ['barranco', 2150, 3500],
  ['san-borja', 1950, 3100], ['santiago-de-surco', 1850, 3000], ['la-molina', 1700, 2900],
  ['jesus-maria', 1600, 2500], ['magdalena-del-mar', 1600, 2450], ['lince', 1550, 2350],
  ['pueblo-libre', 1500, 2300], ['surquillo', 1500, 2250], ['san-miguel', 1450, 2200],
  ['callao', 1050, 1500], ['chorrillos', 1250, 1900], ['los-olivos', 1100, 1500],
  ['brena', 1200, 1750], ['ate', 950, 1350], ['comas', 900, 1200],
  ['san-martin-de-porres', 1000, 1350], ['santa-anita', 950, 1300],
  ['arequipa', 1100, 1500], ['trujillo', 1000, 1400], ['cusco', 1150, 1500],
  ['chiclayo', 900, 1250], ['piura', 900, 1200],
];
// El período se calcula en SQL para no fijar una fecha en el archivo.
const idx = INDICE.map(
  ([slug, m2, alq]) =>
    `  ((SELECT id FROM ubicaciones WHERE slug = ${txt(slug)}), to_char(now(),'YYYY-MM'), ${num(m2)}, ${num(alq)}, 0, true)`,
).join(',\n');

/* -------------------------------- archivo ------------------------------- */

writeFileSync(
  SALIDA,
  `-- =====================================================================
-- 004 · Datos iniciales
--
-- GENERADO por scripts/generar-semilla.js — no editar a mano.
--
-- Va como migración porque en un deploy manual nadie corre scripts: sin
-- ubicaciones el autocompletado queda vacío y no se puede publicar nada.
-- Todo con ON CONFLICT DO NOTHING, así que es seguro repetirlo.
-- =====================================================================

INSERT INTO ubicaciones (departamento, provincia, distrito, slug, alias, lat, lng, destacado) VALUES
${ubic}
ON CONFLICT (slug) DO NOTHING;

INSERT INTO caracteristicas (slug, nombre, grupo, orden) VALUES
${car}
ON CONFLICT (slug) DO NOTHING;

INSERT INTO planes (slug, nombre, precio, moneda, periodo, tope_avisos, tope_fotos,
                    tope_asientos, cuota_indice_mes, destacados_mes, dias_vigencia_aviso,
                    telefono_visible, para_rol, orden) VALUES
${pla}
ON CONFLICT (slug) DO NOTHING;

-- Tipo de cambio de arranque. El cron lo actualiza a diario.
INSERT INTO tipo_cambio (fecha, usd_a_pen, fuente)
VALUES (CURRENT_DATE, 3.75, 'inicial')
ON CONFLICT (fecha) DO NOTHING;
`,
  'utf8',
);

// 005 aparte: 004 ya se aplicó en producción y una migración aplicada
// NUNCA se modifica — el runner no la vuelve a ejecutar y el cambio se
// pierde en silencio.
writeFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'db', 'migraciones', '005_indice_semilla.sql'),
  `-- =====================================================================
-- 005 · Índice de arranque
--
-- GENERADO por scripts/generar-semilla.js — no editar a mano.
--
-- muestras = 0  =>  la API lo reporta como confianza "provisional".
-- NO son datos de mercado: existen para que el panel y el badge
-- "vs mercado" funcionen desde el primer día. Reemplazar con el CSV
-- mensual real antes de tener usuarios de verdad.
-- =====================================================================

INSERT INTO indice_precios (ubicacion_id, periodo, precio_m2_usd, alquiler_2d_pen,
                            muestras, publicado) VALUES
${idx}
ON CONFLICT (ubicacion_id, periodo) DO NOTHING;
`,
  'utf8',
);

console.log(`  ✓ 004_datos_semilla.sql generado`);
console.log(`  ✓ 005_indice_semilla.sql generado (${INDICE.length} distritos)`);
console.log(`      ${UBICACIONES.length} ubicaciones`);
console.log(`      ${CARACTERISTICAS.length} características`);
console.log(`      ${PLANES.length} planes`);
