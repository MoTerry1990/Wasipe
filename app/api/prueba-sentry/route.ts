import { NextResponse } from 'next/server';

/**
 * Error controlado, para comprobar que la observabilidad funciona.
 *
 * Existe porque «Sentry está configurado» y «Sentry reporta» son dos cosas
 * distintas, y durante cinco sprints fueron distintas acá: el DSN estaba
 * puesto y el navegador no mandaba nada. La única forma de saberlo es
 * romper algo a propósito y mirar si llega.
 *
 * **Fuera de producción y nada más.** En producción responde 404, igual
 * que si la ruta no existiera: no se anuncia a sí misma.
 *
 * El error lleva datos que NO deben aparecer en Sentry —un correo, un
 * teléfono peruano y unas coordenadas de Lima— para poder comprobar en el
 * evento recibido que el filtrado de `lib/observabilidad/sentry.ts` los
 * quitó. Son inventados: no pertenecen a nadie.
 */
export const dynamic = 'force-dynamic';

const ENTORNO = process.env.NEXT_PUBLIC_ENTORNO ?? process.env.VERCEL_ENV ?? 'desarrollo';

export async function GET(peticion: Request) {
  if (ENTORNO === 'produccion' || ENTORNO === 'production') {
    return new NextResponse(null, { status: 404 });
  }

  const { searchParams } = new URL(peticion.url);

  if (searchParams.get('romper') !== 'si') {
    return NextResponse.json({
      entorno: ENTORNO,
      sentry: process.env.NEXT_PUBLIC_SENTRY_DSN ? 'configurado' : 'sin DSN',
      como: 'Agrega ?romper=si para lanzar el error de prueba.',
    });
  }

  throw new Error(
    'Prueba de Sentry del sprint 22 · ' +
      'correo=prueba@ejemplo.invalid · ' +
      'telefono=+51 987 654 321 · ' +
      'lat=-12.121100 lon=-77.030000 · ' +
      'password=deberia-desaparecer',
  );
}
