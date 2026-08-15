import { z } from 'zod';

/**
 * Variables de entorno de Supabase, validadas una sola vez.
 *
 * Se separan a propósito en dos funciones: las públicas pueden llegar al
 * navegador, la clave de servicio jamás. Tenerlas en archivos distintos
 * no alcanza —un import descuidado las junta—, así que la clave de
 * servicio además comprueba en tiempo de ejecución que nadie la esté
 * pidiendo desde el cliente.
 */

const esquemaPublico = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url('NEXT_PUBLIC_SUPABASE_URL tiene que ser una URL válida'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, 'Falta NEXT_PUBLIC_SUPABASE_ANON_KEY'),
});

/**
 * ¿Ya hay un proyecto de Supabase conectado?
 *
 * Mientras no lo haya, el sitio tiene que seguir funcionando: las
 * páginas públicas no dependen de la base todavía. El middleware usa
 * esto para no tumbar cada petición con un error de configuración.
 */
export function supabaseConfigurado(): boolean {
  return esquemaPublico.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }).success;
}

/**
 * Configuración pública. La clave anónima es pública por diseño: no da
 * acceso a nada, porque quien manda es la RLS de la base.
 */
export function entornoPublico() {
  const resultado = esquemaPublico.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!resultado.success) {
    throw new Error(
      'Configuración de Supabase incompleta. Revisa .env.example y completa tu .env:\n' +
        resultado.error.issues.map((i) => `  · ${i.message}`).join('\n'),
    );
  }

  return {
    url: resultado.data.NEXT_PUBLIC_SUPABASE_URL,
    claveAnonima: resultado.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

/**
 * Clave de servicio: se salta la RLS por completo.
 *
 * Solo puede usarse en el servidor y solo para tareas donde la
 * autorización ya se comprobó antes: webhooks de la pasarela de pagos,
 * tareas programadas y moderación. Si aparece en un componente de
 * cliente, esto revienta antes de que llegue al navegador.
 */
export function claveDeServicio(): string {
  if (typeof window !== 'undefined') {
    throw new Error(
      'La clave de servicio de Supabase no puede usarse en el navegador. ' +
        'Este código tiene que correr solo en el servidor.',
    );
  }

  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!clave || clave.length < 20) {
    throw new Error(
      'Falta SUPABASE_SERVICE_ROLE_KEY. Se configura solo en el servidor ' +
        '(Vercel → Settings → Environment Variables) y nunca con el prefijo NEXT_PUBLIC_.',
    );
  }

  return clave;
}
