/**
 * Ciclo completo de una alerta, contra la base de verdad.
 *
 * Crea una alerta, publica un aviso que coincide, corre la tarea dos
 * veces y comprueba que la segunda no vuelva a avisar. Limpia lo que
 * crea.
 *
 * Habla por la API REST con la clave de servicio y **no por la cadena de
 * conexión directa**: el anfitrión `db.<ref>.supabase.co` dejó de
 * resolver en esta máquina a mitad del sprint 23D, y la aplicación
 * tampoco lo usa —habla por HTTP—, así que la prueba se parece más a lo
 * que hace el producto.
 *
 * Uso:
 *   node scripts/probar-alertas.mjs <url> <secreto>
 */

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

const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const S = process.env.SUPABASE_SERVICE_ROLE_KEY;
const [, , sitio, secreto] = process.argv;

if (!U || !S || !sitio || !secreto) {
  console.error('Uso: node scripts/probar-alertas.mjs <url> <secreto>');
  process.exit(1);
}

let fallos = 0;
const bien = (t) => console.log(`  ${verde('✓')} ${t}`);
const mal = (t) => {
  console.log(`  ${rojo('✗')} ${t}`);
  fallos++;
};

const api = async (ruta, opciones = {}) => {
  const r = await fetch(`${U}/rest/v1/${ruta}`, {
    ...opciones,
    headers: {
      apikey: S,
      Authorization: `Bearer ${S}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opciones.headers ?? {}),
    },
  });
  const texto = await r.text();
  return { estado: r.status, datos: texto ? JSON.parse(texto) : null };
};

const correrTarea = async () => {
  const r = await fetch(`${sitio}/api/tareas/alertas`, {
    headers: { authorization: `Bearer ${secreto}` },
  });
  return { estado: r.status, cuerpo: await r.json().catch(() => null) };
};

const LUCIA = '33333333-3333-4333-8333-333333333333';
const busquedaId = randomUUID();
const avisoId = randomUUID();

try {
  console.log('\n1 · Preparación');

  const alerta = await api('saved_searches', {
    method: 'POST',
    body: JSON.stringify({
      id: busquedaId,
      user_id: LUCIA,
      name: 'Departamentos en Barranco',
      operation: 'sale',
      filters: { distrito: 'Barranco' },
      alert_frequency: 'daily',
      is_active: true,
    }),
  });
  if (alerta.estado < 300) bien('Alerta creada: departamentos en venta en Barranco');
  else mal(`No se pudo crear la alerta: ${alerta.estado} ${JSON.stringify(alerta.datos)}`);

  const aviso = await api('properties', {
    method: 'POST',
    body: JSON.stringify({
      id: avisoId,
      code: 'ALERTA-1',
      owner_id: LUCIA,
      title: 'Departamento de prueba en Barranco',
      description:
        'Aviso creado por la prueba del sprint 23D para comprobar que las alertas avisan.',
      operation: 'sale',
      property_type: 'apartment',
      currency: 'USD',
      price: 180000,
      total_area: 80,
      furnished: 'none',
      address_privacy: 'district_only',
      department: 'Lima',
      province: 'Lima',
      district: 'Barranco',
      status: 'available',
      publication_status: 'published',
      verification_status: 'unverified',
      published_at: new Date().toISOString(),
    }),
  });
  if (aviso.estado < 300) bien('Aviso publicado en Barranco, que coincide con la alerta');
  else mal(`No se pudo publicar el aviso: ${aviso.estado} ${JSON.stringify(aviso.datos)}`);

  console.log('\n2 · Primera corrida');
  const uno = await correrTarea();
  console.log(gris(`  HTTP ${uno.estado} · ${JSON.stringify(uno.cuerpo)}`));

  if (uno.estado !== 200) mal('La tarea no respondió 200');
  else if ((uno.cuerpo?.correos ?? 0) < 1) mal('No se compuso ningún correo');
  else bien(`Se compuso ${uno.cuerpo.correos} correo(s)`);

  const { datos: notas } = await api(
    `notificaciones_de_alerta?busqueda_id=eq.${busquedaId}&select=estado,proveedor,asunto,cuerpo`,
  );

  if (Array.isArray(notas) && notas.length === 1) bien('Quedó una notificación registrada');
  else mal(`Se esperaba 1 notificación y hay ${Array.isArray(notas) ? notas.length : 0}`);

  const nota = Array.isArray(notas) ? notas[0] : null;
  if (nota) {
    console.log(gris('\n  --- el correo, tal como se compuso ---'));
    console.log(gris(`  Asunto: ${nota.asunto}`));
    for (const linea of String(nota.cuerpo).split('\n')) console.log(gris(`  ${linea}`));
    console.log(gris('  --- fin ---\n'));

    if (/Barranco/.test(nota.cuerpo)) bien('El correo nombra el aviso encontrado');
    else mal('El correo no menciona el aviso');

    if (/desactívala|dejar de recibir/i.test(nota.cuerpo)) {
      bien('Explica cómo dejar de recibirlo');
    } else {
      mal('No dice cómo darse de baja');
    }

    if (nota.estado === 'registrado') bien(`Estado «${nota.estado}»: no se entregó, y lo dice`);
    else mal(`Estado inesperado: ${nota.estado}`);
  }

  console.log('3 · Segunda corrida, sin tocar nada');
  // Se fuerza el vencimiento para que la tarea la vuelva a mirar: lo que
  // se prueba acá es la idempotencia, no el intervalo.
  await api(`saved_searches?id=eq.${busquedaId}`, {
    method: 'PATCH',
    body: JSON.stringify({ last_run_at: new Date(Date.now() - 48 * 3600_000).toISOString() }),
  });

  const dos = await correrTarea();
  console.log(gris(`  HTTP ${dos.estado} · ${JSON.stringify(dos.cuerpo)}`));

  const { datos: despues } = await api(
    `notificaciones_de_alerta?busqueda_id=eq.${busquedaId}&select=id`,
  );
  const cuantas = Array.isArray(despues) ? despues.length : -1;

  if (cuantas === 1) bien('Sigue habiendo una sola: no se avisó dos veces');
  else mal(`Se duplicó: ahora hay ${cuantas}`);

  if ((dos.cuerpo?.correos ?? 0) === 0) bien('La segunda corrida no compuso ningún correo');
  else mal('La segunda corrida volvió a componer un correo');

  console.log('\n4 · Sin el secreto');
  const sinSecreto = await fetch(`${sitio}/api/tareas/alertas`);
  if (sinSecreto.status === 401) bien('Sin autorización responde 401');
  else mal(`Sin autorización responde ${sinSecreto.status}`);
} finally {
  console.log('\n5 · Limpieza');
  await api(`notificaciones_de_alerta?busqueda_id=eq.${busquedaId}`, { method: 'DELETE' });
  await api(`saved_searches?id=eq.${busquedaId}`, { method: 'DELETE' });
  await api(`properties?id=eq.${avisoId}`, { method: 'DELETE' });
  console.log(gris('  alerta, aviso y notificaciones eliminados'));
}

console.log(fallos === 0 ? verde('\nSin fallos.\n') : rojo(`\n${fallos} fallo(s).\n`));
process.exitCode = fallos > 0 ? 1 : 0;
