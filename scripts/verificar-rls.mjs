/**
 * Verificación de RLS y permisos contra Supabase de verdad.
 *
 * Existe porque la suite de Vitest corre contra PGlite, y **PGlite no trae
 * el esquema `storage`**. O sea que las políticas de `storage.objects` y
 * buena parte del comportamiento real de RLS no las prueba nadie. Esto sí.
 *
 * Todo lo que escribe va dentro de una transacción que termina en ROLLBACK,
 * así que no deja ni una fila. Lo demás es lectura del catálogo.
 *
 * La cadena de conexión no se imprime nunca.
 *
 * Uso:
 *   node scripts/verificar-rls.mjs
 */

import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const verde = (t) => `\x1b[32m${t}\x1b[0m`;
const rojo = (t) => `\x1b[31m${t}\x1b[0m`;
const gris = (t) => `\x1b[90m${t}\x1b[0m`;
const amarillo = (t) => `\x1b[33m${t}\x1b[0m`;

function cargar() {
  const ruta = join(process.cwd(), '.env.local');
  if (!existsSync(ruta)) return;
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const l = linea.trim();
    if (!l || l.startsWith('#')) continue;
    const i = l.indexOf('=');
    if (i < 1) continue;
    const nombre = l.slice(0, i).trim();
    const valor = l
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (valor && !process.env[nombre]) process.env[nombre] = valor;
  }
}

cargar();

const cadena = process.env.SUPABASE_DB_URL;
if (!cadena) {
  console.error(rojo('Falta SUPABASE_DB_URL.'));
  process.exit(1);
}

const cliente = new pg.Client({
  connectionString: cadena,
  ssl: { rejectUnauthorized: false },
});

let fallos = 0;
let avisos = 0;

function bien(t) {
  console.log(`  ${verde('✓')} ${t}`);
}
function mal(t) {
  console.log(`  ${rojo('✗')} ${t}`);
  fallos++;
}
function ojo(t) {
  console.log(`  ${amarillo('⚠')} ${t}`);
  avisos++;
}
function titulo(t) {
  console.log(`\n${t}`);
  console.log(gris('─'.repeat(t.length)));
}

await cliente.connect();

// ---------------------------------------------------------------------
// Panorama
// ---------------------------------------------------------------------
titulo('Esquema aplicado');

const { rows: resumen } = await cliente.query(`
  select
    (select count(*) from pg_tables where schemaname = 'public')                    as tablas,
    (select count(*) from pg_views where schemaname = 'public')                     as vistas,
    (select count(*) from pg_indexes where schemaname = 'public')                   as indices,
    (select count(*) from pg_policies where schemaname = 'public')                  as politicas,
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public')                                                  as funciones,
    (select count(*) from pg_constraint c join pg_class t on t.oid = c.conrelid
       join pg_namespace n on n.oid = t.relnamespace
       where n.nspname = 'public')                                                  as restricciones,
    (select count(*) from storage.buckets)                                          as depositos
`);
const r = resumen[0];
console.log(`  tablas ${r.tablas} · vistas ${r.vistas} · índices ${r.indices}`);
console.log(`  funciones ${r.funciones} · restricciones ${r.restricciones}`);
console.log(`  políticas ${r.politicas} · depósitos ${r.depositos}`);

// ---------------------------------------------------------------------
// a. RLS habilitado en todas las tablas públicas
// ---------------------------------------------------------------------
titulo('a · RLS habilitado en todas las tablas públicas');

const { rows: sinRls } = await cliente.query(`
  select c.relname,
         c.relrowsecurity  as habilitada,
         c.relforcerowsecurity as forzada,
         (select count(*) from pg_policies p
            where p.schemaname = 'public' and p.tablename = c.relname) as politicas
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
   order by c.relname
`);

const desprotegidas = sinRls.filter((t) => !t.habilitada);
const sinPoliticas = sinRls.filter((t) => t.habilitada && Number(t.politicas) === 0);

if (desprotegidas.length === 0) {
  bien(`Las ${sinRls.length} tablas tienen RLS habilitado`);
} else {
  mal(
    `${desprotegidas.length} tabla(s) SIN RLS: ${desprotegidas.map((t) => t.relname).join(', ')}`,
  );
}

if (sinPoliticas.length > 0) {
  ojo(
    `${sinPoliticas.length} con RLS pero sin ninguna política (quedan cerradas a todo el mundo): ` +
      sinPoliticas.map((t) => t.relname).join(', '),
  );
}

// ---------------------------------------------------------------------
// g. EXECUTE innecesario para anon/authenticated
// ---------------------------------------------------------------------
titulo('g · Permisos EXECUTE para anon y authenticated');

const { rows: ejecutables } = await cliente.query(`
  select p.proname,
         pg_get_function_identity_arguments(p.oid) as argumentos,
         p.prosecdef as security_definer,
         string_agg(distinct a.rolname, ', ') as roles
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral (values ('anon'),('authenticated')) as g(rolname)
    join pg_roles a on a.rolname = g.rolname
   where n.nspname = 'public'
     and has_function_privilege(a.oid, p.oid, 'EXECUTE')
   group by p.proname, p.oid, p.prosecdef
   order by p.prosecdef desc, p.proname
`);

if (ejecutables.length === 0) {
  bien('Ni anon ni authenticated pueden ejecutar funciones de public');
} else {
  const definer = ejecutables.filter((f) => f.security_definer);
  console.log(
    gris(
      `  ${ejecutables.length} de ${r.funciones} función(es) ejecutables por anon/authenticated`,
    ),
  );
  if (definer.length > 0) {
    console.log(gris('  Las SECURITY DEFINER, que son las que importan:'));
    for (const f of definer) {
      console.log(`      ${rojo(f.proname)}(${f.argumentos})  ${gris(f.roles)}`);
    }
  }
  if (definer.length > 0) {
    ojo(
      `${definer.length} son SECURITY DEFINER: se ejecutan con los permisos del dueño y se saltan RLS. ` +
        'Cada una tiene que comprobar por su cuenta quién llama.',
    );
  } else {
    bien('Ninguna de las ejecutables es SECURITY DEFINER');
  }
}

// ---------------------------------------------------------------------
// Depósitos de almacenamiento
// ---------------------------------------------------------------------
titulo('Depósitos de almacenamiento');

const { rows: depositos } = await cliente.query(`
  select id, public, file_size_limit, allowed_mime_types
    from storage.buckets order by id
`);

for (const d of depositos) {
  const visibilidad = d.public ? rojo('PÚBLICO') : verde('privado');
  const limite = d.file_size_limit
    ? `${Math.round(d.file_size_limit / 1024 / 1024)} MB`
    : 'sin límite';
  console.log(`      ${d.id.padEnd(20)} ${visibilidad}  ${gris(limite)}`);
}

const originales = depositos.find((d) => d.id.includes('original'));
if (!originales) {
  ojo('No encontré un depósito de originales por nombre');
} else if (originales.public) {
  mal(`El depósito «${originales.id}» es PÚBLICO — los originales llevan EXIF con coordenadas`);
} else {
  bien(`El depósito «${originales.id}» es privado`);
}

// ---------------------------------------------------------------------
// Políticas de storage.objects
// ---------------------------------------------------------------------
titulo('Políticas de storage.objects');

const { rows: polAlmacen } = await cliente.query(`
  select policyname, cmd, roles::text
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
   order by cmd, policyname
`);

if (polAlmacen.length === 0) {
  mal('storage.objects no tiene ninguna política: nadie puede tocar nada, o RLS no está');
} else {
  for (const p of polAlmacen) {
    console.log(`      ${p.cmd.padEnd(8)} ${p.policyname}  ${gris(p.roles)}`);
  }
  const escrituraOriginales = polAlmacen.filter(
    (p) => ['UPDATE', 'DELETE'].includes(p.cmd) && /original/i.test(p.policyname),
  );
  if (escrituraOriginales.length === 0) {
    bien('Sin políticas de UPDATE ni DELETE sobre originales');
  } else {
    ojo(`Hay ${escrituraOriginales.length} política(s) de escritura sobre originales`);
  }
}

const { rows: rlsAlmacen } = await cliente.query(`
  select relrowsecurity from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'storage' and c.relname = 'objects'
`);
if (rlsAlmacen[0]?.relrowsecurity) bien('storage.objects tiene RLS habilitado');
else mal('storage.objects NO tiene RLS habilitado');

// ---------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------
titulo('Resumen');
if (fallos === 0 && avisos === 0) console.log(verde('  Sin fallos ni avisos.'));
else console.log(`  ${fallos} fallo(s), ${avisos} aviso(s).`);
console.log();

await cliente.end();
process.exitCode = fallos > 0 ? 1 : 0;
