import { NextResponse } from 'next/server';
import { ejecutarAlertas } from '@/lib/alertas/ejecutar';

/**
 * La tarea de alertas, disparada por el cron de Vercel.
 *
 * Está detrás de un secreto compartido y no de una sesión, porque quien
 * la llama es una máquina. Sin ese secreto, cualquiera podría dispararla
 * en bucle y quemar la cuota de correo del día.
 *
 * `CRON_SECRET` la inyecta Vercel en la cabecera `authorization` de sus
 * propias llamadas programadas. Si la variable no está configurada, la
 * ruta responde 503 en vez de correr sin protección: una tarea abierta al
 * mundo es peor que una tarea que no corre.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(peticion: Request) {
  const secreto = process.env.CRON_SECRET;

  if (!secreto) {
    return NextResponse.json(
      { ok: false, motivo: 'La tarea no está configurada.' },
      { status: 503 },
    );
  }

  if (peticion.headers.get('authorization') !== `Bearer ${secreto}`) {
    // Sin detalle: a quien no debería estar acá no se le explica qué le
    // faltó.
    return new NextResponse(null, { status: 401 });
  }

  const resumen = await ejecutarAlertas();

  return NextResponse.json({ ok: true, ...resumen });
}
