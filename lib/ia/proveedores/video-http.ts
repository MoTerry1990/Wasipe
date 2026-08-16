import 'server-only';
import {
  FallaDeProveedor,
  type EstadoDeRender,
  type PeticionDeVideo,
  type ProveedorDeVideo,
} from '@/lib/ia/proveedor';

/**
 * Adaptador de video para cualquier servicio con endpoint HTTP.
 *
 * El mismo contrato sirve para tres cosas distintas, que es justamente
 * lo que se buscaba: una API externa de render, un servidor propio
 * corriendo Remotion, o una máquina nuestra con ffmpeg detrás de un
 * proceso web. Wasipe manda el guion y pregunta cómo va; qué lo pinta es
 * asunto del otro lado.
 *
 * ENCOLAR   POST <IA_VIDEO_URL>/render
 *   { "formato": "vertical", "plantilla": "modern",
 *     "ancho": 1080, "alto": 1920,
 *     "idempotencia": "video:…",   // mismo valor = mismo render
 *     "guion": { …escenas, narración, subtítulos, música… } }
 *   → 200 { "referencia": "abc123" }
 *
 * CONSULTAR GET <IA_VIDEO_URL>/render/<referencia>
 *   → { "estado": "trabajando", "progreso": 42 }
 *   → { "estado": "listo",
 *       "video":   { "url": "…", "tipo": "video/mp4", "bytes": 8400000 },
 *       "portada": { "url": "…", "tipo": "image/webp" },
 *       "duracion_ms": 27000, "costo_micros": 34000 }
 *   → { "estado": "falla", "detalle": "…", "reintentable": true }
 *
 * CANCELAR  DELETE <IA_VIDEO_URL>/render/<referencia>
 *
 * `IA_VIDEO_FORMATOS` e `IA_VIDEO_PLANTILLAS` limitan lo que este
 * proveedor sabe hacer, separados por coma. Vacíos = todo.
 */

const ESPERA = 30_000;

export function proveedorVideoHttp(): ProveedorDeVideo {
  const base = process.env.IA_VIDEO_URL?.trim().replace(/\/$/, '');
  const clave = process.env.IA_VIDEO_CLAVE?.trim();
  const formatos = lista(process.env.IA_VIDEO_FORMATOS);
  const plantillas = lista(process.env.IA_VIDEO_PLANTILLAS);

  async function pedir(ruta: string, init: RequestInit): Promise<Response> {
    if (!base) {
      throw new FallaDeProveedor(
        'El video automático todavía no está configurado.',
        'falta IA_VIDEO_URL',
        false,
      );
    }
    try {
      return await fetch(`${base}${ruta}`, {
        ...init,
        signal: AbortSignal.timeout(ESPERA),
        headers: {
          'content-type': 'application/json',
          ...(clave ? { authorization: `Bearer ${clave}` } : {}),
        },
      });
    } catch (error) {
      throw new FallaDeProveedor(
        'No pudimos contactar al servicio de video. Vuelve a intentarlo.',
        error instanceof Error ? error.message : 'error de red',
      );
    }
  }

  return {
    nombre: 'video-http',

    disponible: () => Boolean(base),

    soporta: (formato, plantilla) =>
      (formatos.length === 0 || formatos.includes(formato)) &&
      (plantillas.length === 0 || plantillas.includes(plantilla)),

    async encolar(peticion: PeticionDeVideo) {
      const respuesta = await pedir('/render', {
        method: 'POST',
        body: JSON.stringify({
          formato: peticion.formato,
          plantilla: peticion.plantilla,
          ancho: peticion.ancho,
          alto: peticion.alto,
          idempotencia: peticion.idempotencia,
          guion: peticion.guion,
        }),
      });

      if (!respuesta.ok) {
        throw new FallaDeProveedor(
          'No pudimos empezar el video. Vuelve a intentarlo.',
          `http ${respuesta.status} al encolar`,
          respuesta.status >= 500,
        );
      }

      const cuerpo = (await leerJson(respuesta)) as { referencia?: unknown };
      if (typeof cuerpo.referencia !== 'string' || !cuerpo.referencia) {
        throw new FallaDeProveedor(
          'No pudimos empezar el video. Vuelve a intentarlo.',
          'el proveedor no devolvió referencia',
        );
      }
      return { referencia: cuerpo.referencia };
    },

    async consultar(referencia: string) {
      const respuesta = await pedir(`/render/${encodeURIComponent(referencia)}`, {
        method: 'GET',
      });

      if (!respuesta.ok) {
        throw new FallaDeProveedor(
          'Perdimos el rastro de tu video. Vuelve a intentarlo.',
          `http ${respuesta.status} al consultar`,
          respuesta.status >= 500,
        );
      }

      return leerEstado(await leerJson(respuesta));
    },

    async cancelar(referencia: string) {
      // Si el proveedor no sabe cancelar, no hay de qué enterar a nadie:
      // del lado de Wasipe el trabajo ya quedó cancelado y los créditos
      // ya se devolvieron.
      try {
        await pedir(`/render/${encodeURIComponent(referencia)}`, { method: 'DELETE' });
      } catch {
        /* nada */
      }
    },
  };
}

/** Interpreta lo que devuelve el proveedor al consultarle el estado. */
export function leerEstado(cuerpo: unknown): EstadoDeRender {
  const raiz = cuerpo as {
    estado?: unknown;
    progreso?: unknown;
    detalle?: unknown;
    reintentable?: unknown;
    video?: { url?: unknown; tipo?: unknown; bytes?: unknown };
    portada?: { url?: unknown; tipo?: unknown };
    duracion_ms?: unknown;
    costo_micros?: unknown;
  } | null;

  if (raiz?.estado === 'falla') {
    return {
      estado: 'falla',
      detalle: typeof raiz.detalle === 'string' ? raiz.detalle : 'falla sin detalle',
      // Ante la duda se reintenta: un render perdido por un reinicio del
      // proveedor es lo más común, y el reintento no cobra.
      reintentable: raiz.reintentable !== false,
    };
  }

  if (raiz?.estado === 'listo') {
    const url = raiz.video?.url;
    if (typeof url !== 'string' || !url.startsWith('http')) {
      throw new FallaDeProveedor(
        'El video quedó, pero no pudimos bajarlo. Vuelve a intentarlo.',
        'listo sin url de video',
      );
    }
    return {
      estado: 'listo',
      video: {
        url,
        tipo: typeof raiz.video?.tipo === 'string' ? raiz.video.tipo : 'video/mp4',
        bytes: numeroOpcional(raiz.video?.bytes),
      },
      portada:
        typeof raiz.portada?.url === 'string'
          ? {
              url: raiz.portada.url,
              tipo: typeof raiz.portada.tipo === 'string' ? raiz.portada.tipo : 'image/webp',
            }
          : undefined,
      duracionMs: numeroOpcional(raiz.duracion_ms),
      costoMicros: numeroOpcional(raiz.costo_micros),
    };
  }

  const progreso = Number(raiz?.progreso);
  return {
    estado: 'trabajando',
    // Nunca 100 mientras no esté listo: una barra llena que sigue
    // girando es peor que una barra en 99.
    progreso: Number.isFinite(progreso) ? Math.min(Math.max(Math.round(progreso), 0), 99) : 0,
  };
}

function numeroOpcional(valor: unknown): number | undefined {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
}

function lista(valor: string | undefined): string[] {
  return (valor ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

async function leerJson(respuesta: Response): Promise<unknown> {
  try {
    return await respuesta.json();
  } catch {
    throw new FallaDeProveedor(
      'El servicio de video devolvió algo que no entendimos.',
      'respuesta que no es JSON',
    );
  }
}
