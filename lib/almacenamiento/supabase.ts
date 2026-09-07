import 'server-only';

import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import {
  BUCKET_DE,
  DEPOSITOS,
  type Deposito,
  type ProveedorDeAlmacenamiento,
  type ResultadoDeSubida,
} from '@/lib/almacenamiento/proveedor';

/**
 * Supabase Storage como almacenamiento de Wasipe.
 *
 * Es el adaptador, no el contrato: todo lo que sabe de Supabase vive acá
 * y el resto de la aplicación no lo importa nunca. Cuando entre
 * Cloudinary, se escribe un archivo hermano y se cambia una línea en
 * `almacenamiento()`.
 */

class AlmacenamientoSupabase implements ProveedorDeAlmacenamiento {
  readonly nombre = 'supabase';

  async guardar(
    deposito: Deposito,
    ruta: string,
    contenido: ArrayBuffer | Uint8Array | Blob,
    opciones: { tipo?: string; sobreescribir?: boolean } = {},
  ): Promise<ResultadoDeSubida> {
    if (!supabaseConfigurado()) {
      return { ok: false, motivo: 'Sin conexión con el almacenamiento.' };
    }

    // Sobre los originales no se sobreescribe nunca, y no depende de que
    // quien llame se acuerde de pasar la opción. Es la garantía entera
    // de ese depósito: el archivo que subió la persona sigue estando.
    const sobreescribir = deposito === 'originales' ? false : (opciones.sobreescribir ?? false);

    try {
      const supabase = await clienteServidor();
      const { error } = await supabase.storage
        .from(BUCKET_DE[deposito])
        .upload(ruta, contenido, { contentType: opciones.tipo, upsert: sobreescribir });

      if (error) {
        // El mensaje crudo de Supabase habla de buckets y de políticas.
        // Quien está subiendo una foto no tiene por qué leer eso.
        const yaExiste = /already exists|duplicate/i.test(error.message);
        return {
          ok: false,
          motivo: yaExiste
            ? 'Ese archivo ya estaba guardado.'
            : 'No pudimos guardar el archivo. Vuelve a intentarlo.',
        };
      }

      const bytes =
        contenido instanceof Blob
          ? contenido.size
          : contenido instanceof Uint8Array
            ? contenido.byteLength
            : contenido.byteLength;

      return {
        ok: true,
        archivo: {
          ruta,
          url: this.urlPublica(deposito, ruta),
          bytes,
          tipo: opciones.tipo ?? 'application/octet-stream',
        },
      };
    } catch {
      return { ok: false, motivo: 'No pudimos guardar el archivo.' };
    }
  }

  urlPublica(deposito: Deposito, ruta: string): string | null {
    if (!DEPOSITOS[deposito].publico) return null;

    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!base) return null;

    return `${base}/storage/v1/object/public/${BUCKET_DE[deposito]}/${ruta}`;
  }

  async urlFirmada(deposito: Deposito, ruta: string, segundos: number): Promise<string | null> {
    if (!supabaseConfigurado()) return null;

    try {
      const supabase = await clienteServidor();
      const { data, error } = await supabase.storage
        .from(BUCKET_DE[deposito])
        .createSignedUrl(ruta, Math.max(30, Math.min(segundos, 3600)));

      return error ? null : (data?.signedUrl ?? null);
    } catch {
      return null;
    }
  }

  async leer(deposito: Deposito, ruta: string): Promise<ArrayBuffer | null> {
    if (!supabaseConfigurado()) return null;

    try {
      const supabase = await clienteServidor();
      const { data, error } = await supabase.storage.from(BUCKET_DE[deposito]).download(ruta);
      if (error || !data) return null;
      return await data.arrayBuffer();
    } catch {
      return null;
    }
  }

  async borrar(deposito: Deposito, rutas: readonly string[]): Promise<{ borrados: number }> {
    if (!supabaseConfigurado() || rutas.length === 0) return { borrados: 0 };

    try {
      const supabase = await clienteServidor();
      const { data, error } = await supabase.storage.from(BUCKET_DE[deposito]).remove([...rutas]);
      return { borrados: error ? 0 : (data?.length ?? 0) };
    } catch {
      return { borrados: 0 };
    }
  }
}

let instancia: ProveedorDeAlmacenamiento | null = null;

/**
 * El almacenamiento que usa la aplicación.
 *
 * Hoy siempre Supabase. La función existe igual para que el día que haya
 * dos proveedores el cambio sea acá adentro y no en veinte archivos.
 */
export function almacenamiento(): ProveedorDeAlmacenamiento {
  instancia ??= new AlmacenamientoSupabase();
  return instancia;
}
