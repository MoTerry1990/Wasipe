import 'server-only';
import {
  FallaDeProveedor,
  ImagenRechazada,
  type PeticionDeImagen,
  type ProveedorDeImagen,
  type RespuestaDeImagen,
} from '@/lib/ia/proveedor';

/**
 * Adaptador de imagen para cualquier proveedor con endpoint HTTP.
 *
 * No hay un SDK que sirva para todos los servicios de edición de
 * imágenes, y atarse a uno sería exactamente lo que este proyecto no
 * quiere. Así que Wasipe publica el contrato mínimo que necesita y
 * quien quiera conectar su proveedor pone un adaptador delante —unas
 * pocas líneas en su propio servidor— o escribe otro archivo en esta
 * carpeta.
 *
 * ENVÍA  POST <IA_IMAGEN_URL>
 *   Authorization: Bearer <IA_IMAGEN_CLAVE>   (si hay clave)
 *   {
 *     "operacion":  "lighting" | "staging" | ...,
 *     "instruccion": "…qué hacer…",
 *     "reglas":      "…lo que no se puede hacer, nunca…",
 *     "modelo":      "…", // solo si IA_IMAGEN_MODELO está puesta
 *     "imagen":     { "datos": "<base64>", "tipo": "image/webp" }
 *   }
 *
 * ESPERA
 *   200 → { "imagen": { "datos": "<base64>", "tipo": "image/webp" },
 *           "modelo": "…", "costo_micros": 1200 }
 *   422 → el proveedor se negó por su propia moderación. No se reintenta.
 *   otro → falla; el trabajo se puede reintentar y no cobra nada.
 *
 * `IA_IMAGEN_OPERACIONES` limita qué sabe hacer este proveedor, separadas
 * por coma. Vacía = todas las del catálogo.
 */

const ESPERA_POR_DEFECTO = 120_000;

export function proveedorImagenHttp(): ProveedorDeImagen {
  const url = process.env.IA_IMAGEN_URL?.trim();
  const clave = process.env.IA_IMAGEN_CLAVE?.trim();
  const modelo = process.env.IA_IMAGEN_MODELO?.trim();
  const permitidas = (process.env.IA_IMAGEN_OPERACIONES ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  return {
    nombre: 'imagen-http',

    disponible: () => Boolean(url),

    soporta: (operacion) => permitidas.length === 0 || permitidas.includes(operacion),

    async editarImagen(peticion: PeticionDeImagen): Promise<RespuestaDeImagen> {
      if (!url) {
        throw new FallaDeProveedor(
          'La mejora de fotos todavía no está configurada.',
          'falta IA_IMAGEN_URL',
          false,
        );
      }

      const corte = AbortSignal.timeout(peticion.milisegundos ?? ESPERA_POR_DEFECTO);

      let respuesta: Response;
      try {
        respuesta = await fetch(url, {
          method: 'POST',
          signal: corte,
          headers: {
            'content-type': 'application/json',
            ...(clave ? { authorization: `Bearer ${clave}` } : {}),
          },
          body: JSON.stringify({
            operacion: peticion.operacion,
            instruccion: peticion.instruccion,
            reglas: peticion.reglas,
            ...(modelo ? { modelo } : {}),
            imagen: peticion.imagen,
          }),
        });
      } catch (error) {
        throw new FallaDeProveedor(
          'No pudimos contactar al servicio de fotos. Vuelve a intentarlo.',
          error instanceof Error ? error.message : 'error de red',
        );
      }

      // 422 es la negativa del proveedor, no una caída. Reintentar sería
      // gastar tiempo y créditos para que diga lo mismo.
      if (respuesta.status === 422) {
        throw new ImagenRechazada(await detalleBreve(respuesta));
      }
      if (respuesta.status === 429) {
        throw new FallaDeProveedor(
          'El servicio de fotos está saturado. Intenta de nuevo en un minuto.',
          'rate_limit',
        );
      }
      if (!respuesta.ok) {
        throw new FallaDeProveedor(
          'La mejora de fotos no está disponible en este momento.',
          `http ${respuesta.status}: ${await detalleBreve(respuesta)}`,
        );
      }

      let cuerpo: unknown;
      try {
        cuerpo = await respuesta.json();
      } catch {
        throw new FallaDeProveedor(
          'La mejora de fotos devolvió algo que no entendimos.',
          'respuesta que no es JSON',
        );
      }

      return leerRespuesta(cuerpo, modelo);
    },
  };
}

/** Convierte el cuerpo del proveedor en algo con lo que Wasipe pueda trabajar. */
export function leerRespuesta(cuerpo: unknown, modeloPedido?: string): RespuestaDeImagen {
  const raiz = cuerpo as {
    imagen?: { datos?: unknown; tipo?: unknown };
    modelo?: unknown;
    costo_micros?: unknown;
  } | null;

  const datos = raiz?.imagen?.datos;
  const tipo = raiz?.imagen?.tipo;

  if (typeof datos !== 'string' || datos.length < 100) {
    throw new FallaDeProveedor(
      'La mejora de fotos devolvió una imagen vacía. Vuelve a intentarlo.',
      'imagen ausente o demasiado corta',
    );
  }
  if (typeof tipo !== 'string' || !tipo.startsWith('image/')) {
    throw new FallaDeProveedor(
      'La mejora de fotos devolvió un archivo que no es una imagen.',
      `tipo inesperado: ${String(tipo)}`,
    );
  }

  const costo = Number(raiz?.costo_micros);

  return {
    imagen: { datos, tipo },
    proveedor: 'imagen-http',
    modelo: typeof raiz?.modelo === 'string' ? raiz.modelo : (modeloPedido ?? 'desconocido'),
    costoMicros: Number.isFinite(costo) && costo >= 0 ? Math.round(costo) : undefined,
  };
}

/** Los primeros caracteres del error, para la bitácora. Nunca a la pantalla. */
async function detalleBreve(respuesta: Response): Promise<string> {
  try {
    return (await respuesta.text()).slice(0, 300);
  } catch {
    return 'sin cuerpo';
  }
}
