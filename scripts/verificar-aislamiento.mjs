/**
 * Pruebas de comportamiento de RLS contra Supabase de verdad.
 *
 * No mira el catálogo: **actúa**. Se hace pasar por dos usuarios distintos
 * y comprueba qué puede hacer cada uno, que es la única forma de saber si
 * RLS protege de verdad. Mirar que las políticas «existen» no dice nada
 * sobre si funcionan.
 *
 * Todo ocurre dentro de una transacción que termina en ROLLBACK. No queda
 * ni una fila.
 *
 * La cadena de conexión no se imprime nunca.
 *
 * Uso:
 *   node scripts/verificar-aislamiento.mjs
 */

import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const verde = (t) => `\x1b[32m${t}\x1b[0m`;
const rojo = (t) => `\x1b[31m${t}\x1b[0m`;
const gris = (t) => `\x1b[90m${t}\x1b[0m`;

function cargar() {
  const ruta = join(process.cwd(), '.env.local');
  if (!existsSync(ruta)) return;
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const l = linea.trim();
    if (!l || l.startsWith('#')) continue;
    const i = l.indexOf('=');
    if (i < 1) continue;
    const n = l.slice(0, i).trim();
    const v = l
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (v && !process.env[n]) process.env[n] = v;
  }
}
cargar();

const cliente = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

let fallos = 0;
const bien = (t) => console.log(`  ${verde('✓')} ${t}`);
const mal = (t) => {
  console.log(`  ${rojo('✗')} ${t}`);
  fallos++;
};
const titulo = (t) => {
  console.log(`\n${t}`);
  console.log(gris('─'.repeat(t.length)));
};

/** Se hace pasar por un usuario autenticado, como hace PostgREST. */
async function como(uid) {
  await cliente.query('reset role');
  if (uid === null) {
    await cliente.query(`select set_config('request.jwt.claims', '', true)`);
    await cliente.query('set local role anon');
  } else {
    await cliente.query(
      `select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: uid, role: 'authenticated' })],
    );
    await cliente.query('set local role authenticated');
  }
}

/**
 * Corre algo y devuelve las filas, o el error, sin reventar la transacción.
 *
 * El punto de guardado no es un adorno. En Postgres, **un error aborta la
 * transacción entera**: todo lo que venga después falla con «current
 * transaction is aborted», y una prueba que espera un error lo lee como si
 * hubiera pasado. Sin esto, la primera denegación legítima pintaba de verde
 * todo lo que venía detrás sin haberlo probado.
 */
let punto = 0;
async function intentar(sql, params = []) {
  const guardado = `p${++punto}`;
  await cliente.query(`savepoint ${guardado}`);
  try {
    const r = await cliente.query(sql, params);
    await cliente.query(`release savepoint ${guardado}`);
    return { ok: true, filas: r.rows, cantidad: r.rowCount };
  } catch (e) {
    await cliente.query(`rollback to savepoint ${guardado}`);
    return { ok: false, error: e.message.split('\n')[0] };
  }
}

await cliente.connect();
await cliente.query('begin');

const A = randomUUID();
const B = randomUUID();

try {
  // -------------------------------------------------------------------
  // Montar dos usuarios y un aviso de cada uno
  // -------------------------------------------------------------------
  titulo('Preparación (todo dentro de la transacción)');

  for (const [uid, nombre] of [
    [A, 'Usuaria A'],
    [B, 'Usuario B'],
  ]) {
    await cliente.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                               created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
               $2, 'x', now(), now(), '{}'::jsonb, jsonb_build_object('full_name', $3::text))`,
      [uid, `${uid}@prueba.invalid`, nombre],
    );
  }

  const perfiles = await cliente.query('select id, full_name, phone from profiles where id = any($1)', [
    [A, B],
  ]);
  if (perfiles.rowCount === 2) bien('El disparador creó los dos perfiles al registrarse');
  else {
    for (const [uid, nombre] of [
      [A, 'Usuaria A'],
      [B, 'Usuario B'],
    ]) {
      await cliente.query(
        `insert into profiles (id, full_name) values ($1, $2) on conflict (id) do nothing`,
        [uid, nombre],
      );
    }
    console.log(gris('  (los perfiles se insertaron a mano)'));
  }

  // Teléfono de B: dato privado por excelencia.
  await cliente.query(`update profiles set phone = '999888777' where id = $1`, [B]);

  const avisoDeB = randomUUID();
  await cliente.query(
    `insert into properties (id, code, owner_id, title, description, operation, property_type,
                             currency, price, total_area, furnished, address_privacy,
                             department, province, district, status, publication_status,
                             verification_status)
     values ($1, 'PRUEBA-B', $2, 'Departamento de B en Miraflores',
             'Departamento en Miraflores con vista al parque, cochera y deposito. Sin publicar.',
             'sale', 'apartment', 'USD', 150000, 90, 'none', 'district_only',
             'Lima', 'Lima', 'Miraflores', 'available', 'draft', 'unverified')`,
    [avisoDeB, B],
  );
  bien('Aviso de B creado, en borrador');

  // -------------------------------------------------------------------
  // b · A no puede leer ni modificar los datos privados de B
  // -------------------------------------------------------------------
  titulo('b · Usuario A frente a los datos privados de B');

  await como(A);

  const leeAviso = await intentar('select id, title from properties where id = $1', [avisoDeB]);
  if (leeAviso.ok && leeAviso.cantidad === 0) bien('A no ve el aviso en borrador de B');
  else if (leeAviso.ok) mal(`A SÍ ve el aviso en borrador de B (${leeAviso.cantidad} fila)`);
  else bien(`A no puede consultarlo: ${leeAviso.error}`);

  const leeTelefono = await intentar('select phone from profiles where id = $1', [B]);
  if (leeTelefono.ok && leeTelefono.cantidad === 0) {
    bien('A no ve el perfil de B en absoluto');
  } else if (leeTelefono.ok && leeTelefono.filas[0]?.phone === null) {
    bien('A ve el perfil de B pero el teléfono le llega vacío');
  } else if (leeTelefono.ok) {
    mal('A LEE el teléfono de B');
  } else {
    bien(`A no puede consultar el perfil: ${leeTelefono.error}`);
  }

  const cambiaPerfil = await intentar(
    `update profiles set full_name = 'Secuestrado' where id = $1`,
    [B],
  );
  if (cambiaPerfil.ok && cambiaPerfil.cantidad === 0) bien('A no puede modificar el perfil de B');
  else if (cambiaPerfil.ok) mal(`A MODIFICÓ el perfil de B (${cambiaPerfil.cantidad} fila)`);
  else bien(`A no puede modificarlo: ${cambiaPerfil.error}`);

  // -------------------------------------------------------------------
  // c · Un propietario solo administra sus propios avisos
  // -------------------------------------------------------------------
  titulo('c · A intenta administrar el aviso de B');

  const cambiaPrecio = await intentar(`update properties set price = 1 where id = $1`, [avisoDeB]);
  if (cambiaPrecio.ok && cambiaPrecio.cantidad === 0) bien('A no puede cambiarle el precio a B');
  else if (cambiaPrecio.ok) mal(`A CAMBIÓ el precio del aviso de B (${cambiaPrecio.cantidad} fila)`);
  else bien(`A no puede cambiarlo: ${cambiaPrecio.error}`);

  const borra = await intentar('delete from properties where id = $1', [avisoDeB]);
  if (borra.ok && borra.cantidad === 0) bien('A no puede borrar el aviso de B');
  else if (borra.ok) mal(`A BORRÓ el aviso de B (${borra.cantidad} fila)`);
  else bien(`A no puede borrarlo: ${borra.error}`);

  const publica = await intentar(
    `update properties set publication_status = 'published' where id = $1`,
    [avisoDeB],
  );
  if (publica.ok && publica.cantidad === 0) bien('A no puede publicar el aviso de B');
  else if (publica.ok) mal('A PUBLICÓ el aviso de B');
  else bien(`A no puede publicarlo: ${publica.error}`);

  const propio = await intentar(
    `insert into properties (code, owner_id, title, description, operation, property_type,
                             currency, price, total_area, furnished, address_privacy,
                             department, province, district, status, publication_status,
                             verification_status)
     values ('PRUEBA-A2', $1, 'Aviso propio de A en Surco',
             'Departamento en Surco con tres dormitorios, cochera doble y area de servicio.',
             'sale', 'apartment', 'USD',
             100000, 50, 'none', 'district_only', 'Lima', 'Lima', 'Surco',
             'available', 'draft', 'unverified') returning id`,
    [A],
  );
  if (propio.ok) bien('A sí puede crear un aviso propio');
  else mal(`A no puede crear ni su propio aviso: ${propio.error}`);

  const ajeno = await intentar(
    `insert into properties (code, owner_id, title, description, operation, property_type,
                             currency, price, total_area, furnished, address_privacy,
                             department, province, district, status, publication_status,
                             verification_status)
     values ('PRUEBA-FALSO', $1, 'Aviso a nombre de B',
             'Intento de crear un aviso ajeno, para comprobar que RLS lo impide como debe.',
             'sale', 'apartment', 'USD',
             100000, 50, 'none', 'district_only', 'Lima', 'Lima', 'Surco',
             'available', 'draft', 'unverified')`,
    [B],
  );
  if (!ajeno.ok) bien('A no puede crear un aviso a nombre de B');
  else mal('A CREÓ un aviso a nombre de B');

  // -------------------------------------------------------------------
  // f · Operaciones administrativas
  // -------------------------------------------------------------------
  titulo('f · A, que no es personal, intenta operaciones administrativas');

  const esAdmin = await intentar('select es_admin() as v, es_moderador() as m, mi_rol() as r');
  if (esAdmin.ok) {
    const { v, m, r } = esAdmin.filas[0];
    if (!v && !m) bien(`es_admin() y es_moderador() dicen que no (rol: ${r})`);
    else mal(`A pasa por personal: admin=${v} moderador=${m}`);
  } else mal(`No pude comprobarlo: ${esAdmin.error}`);

  const revisa = await intentar(`select revisar_aviso($1, 'approve', 'sin motivo')`, [avisoDeB]);
  if (!revisa.ok) bien(`revisar_aviso rechazada: ${revisa.error}`);
  else mal('A APROBÓ un aviso sin ser moderador');

  const verifica = await intentar(
    `select verificar_anunciante($1, 'verified', 'sin motivo')`,
    [randomUUID()],
  );
  if (!verifica.ok) bien(`verificar_anunciante rechazada: ${verifica.error}`);
  else mal('A VERIFICÓ un anunciante sin ser personal');

  const auditoria = await intentar('select count(*)::int as n from audit_logs');
  if (auditoria.ok && auditoria.filas[0].n === 0) bien('A no ve el registro de auditoría');
  else if (auditoria.ok) mal(`A LEE el registro de auditoría (${auditoria.filas[0].n} filas)`);
  else bien(`A no puede leer auditoría: ${auditoria.error}`);

  const personal = await intentar('select count(*)::int as n from staff_members');
  if (personal.ok && personal.filas[0].n === 0) bien('A no ve quién es personal de Wasipe');
  else if (personal.ok) mal(`A LEE la tabla de personal (${personal.filas[0].n} filas)`);
  else bien(`A no puede leer el personal: ${personal.error}`);

  const asciende = await intentar(
    `insert into staff_members (user_id, role) values ($1, 'super_admin')`,
    [A],
  );
  if (!asciende.ok) bien(`A no puede nombrarse personal: ${asciende.error}`);
  else mal('A SE NOMBRÓ super_admin');

  // -------------------------------------------------------------------
  // Visitante sin sesión
  // -------------------------------------------------------------------
  titulo('Visitante sin sesión (rol anon)');

  await como(null);

  const anonAviso = await intentar('select count(*)::int as n from properties where id = $1', [
    avisoDeB,
  ]);
  if (anonAviso.ok && anonAviso.filas[0].n === 0) bien('Un visitante no ve avisos en borrador');
  else if (anonAviso.ok) mal('Un visitante VE avisos en borrador');
  else bien(`Un visitante no puede consultarlo: ${anonAviso.error}`);

  const anonPerfiles = await intentar('select count(*)::int as n from profiles');
  if (anonPerfiles.ok && anonPerfiles.filas[0].n === 0) bien('Un visitante no lista perfiles');
  else if (anonPerfiles.ok) mal(`Un visitante LISTA ${anonPerfiles.filas[0].n} perfil(es)`);
  else bien(`Un visitante no puede listarlos: ${anonPerfiles.error}`);

  const anonRevisa = await intentar(`select revisar_aviso($1, 'approve', 'sin motivo')`, [avisoDeB]);
  if (!anonRevisa.ok) bien(`Un visitante no puede moderar: ${anonRevisa.error}`);
  else mal('UN VISITANTE APROBÓ UN AVISO');

  const anonPago = await intentar(
    `select registrar_evento_de_pago('culqi', 'falso-1', 'charge.succeeded', '{}'::jsonb)`,
  );
  if (!anonPago.ok) bien(`Un visitante no puede registrar pagos: ${anonPago.error}`);
  else mal('UN VISITANTE REGISTRÓ UN EVENTO DE PAGO');

  const anonHuellas = await intentar('select count(*)::int as n from fotos_sin_huella(10)');
  if (!anonHuellas.ok) bien(`Un visitante no puede recorrer fotos ajenas: ${anonHuellas.error}`);
  else mal(`UN VISITANTE recorrió fotos de todo el mundo (${anonHuellas.filas[0].n})`);

  // Postgres concede EXECUTE a PUBLIC en cada función nueva, y PUBLIC
  // incluye a anon. Estas siete quedaron abiertas hasta la migración
  // 20260906200000. La peor era limpiar_cupos_vencidos: barrer los límites
  // de frecuencia deja sin valor a todos los demás límites.
  const soloDelServidor = [
    ['limpiar_cupos_vencidos()', 'select limpiar_cupos_vencidos()'],
    ['recalcular_mercado()', 'select recalcular_mercado()'],
    ['vencer_videos()', 'select vencer_videos()'],
    ['subidas_abandonadas(1)', 'select count(*) from subidas_abandonadas(1)'],
    ['anotar_huella(…)', `select anotar_huella(gen_random_uuid(), repeat('a', 64))`],
    ['saldo_de_creditos(…)', 'select saldo_de_creditos(gen_random_uuid())'],
  ];

  for (const [nombre, sql] of soloDelServidor) {
    const r = await intentar(sql);
    if (!r.ok && /permission denied|permiso/i.test(r.error)) bien(`Un visitante no puede ${nombre}`);
    else if (!r.ok) bien(`Un visitante no puede ${nombre}: ${r.error}`);
    else mal(`UN VISITANTE EJECUTÓ ${nombre}`);
  }
} catch (error) {
  // Sin esto, el error del `finally` pisa al de verdad y no se sabe qué pasó.
  console.log(`\n  ${rojo('La preparación falló:')} ${error.message.split('\n')[0]}`);
  if (error.detail) console.log(gris(`  detalle: ${error.detail}`));
  fallos++;
} finally {
  try {
    await cliente.query('rollback');
    console.log(gris('\n  (transacción deshecha: no quedó ninguna fila)'));
  } catch {
    console.log(gris('\n  (la transacción ya estaba abortada; nada quedó escrito)'));
  }
}

titulo('Resumen');
console.log(fallos === 0 ? verde('  Sin fallos.') : rojo(`  ${fallos} fallo(s).`));
console.log();

await cliente.end();
process.exitCode = fallos > 0 ? 1 : 0;
