import { createHash } from 'node:crypto';
import { ErrorHTTP } from '../lib/errores.ts';

/**
 * Cloudinary con subida directa firmada.
 *
 * Las imágenes NUNCA pasan por la función: Netlify corta en 6 MB y 10 s,
 * y una foto de celular de 8 MB rompe el request. El navegador sube
 * directo a Cloudinary con una firma que generamos acá, y después nos
 * avisa. Nosotros verificamos contra la Admin API que el asset exista
 * y esté donde debe — sin ese paso, cualquiera manda un public_id
 * inventado o ajeno.
 */

export type Asset = {
  public_id: string;
  secure_url: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
  phash?: string;
};

/** Permite inyectar un proveedor falso en las pruebas. */
export type Proveedor = {
  buscar(publicId: string): Promise<Asset | null>;
  borrar(publicId: string): Promise<void>;
};

let proveedor: Proveedor | null = null;
export const usarProveedor = (p: Proveedor | null) => { proveedor = p; };

const config = () => ({
  cloud: process.env.CLOUDINARY_CLOUD_NAME ?? '',
  key: process.env.CLOUDINARY_API_KEY ?? '',
  secret: process.env.CLOUDINARY_API_SECRET ?? '',
});

export const hayAlmacenamiento = () => Boolean(config().secret) || proveedor !== null;

/* ----------------------------- firma ----------------------------- */

export const carpetaDe = (propiedadId: string) => `wasipe/propiedades/${propiedadId}`;
export const carpetaPerfil = (usuarioId: string) => `wasipe/perfiles/${usuarioId}`;

/**
 * Firma de Cloudinary: los parámetros a firmar, ordenados alfabéticamente,
 * unidos como k=v&k=v, con el api_secret pegado al final, en SHA-1.
 */
export function firmar(params: Record<string, string | number>): string {
  const { secret } = config();
  if (!secret) {
    throw new ErrorHTTP(503, 'La subida de fotos no está configurada todavía.', {
      codigo: 'SIN_ALMACENAMIENTO',
    });
  }
  const cadena = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash('sha1').update(cadena + secret).digest('hex');
}

/** Datos que el navegador necesita para subir directo. */
export function datosDeSubida(carpeta: string) {
  const { cloud, key } = config();
  const timestamp = Math.floor(Date.now() / 1000);

  // Lo que se firma tiene que coincidir EXACTAMENTE con lo que el
  // navegador manda, o Cloudinary rechaza la subida.
  const aFirmar = {
    folder: carpeta,
    timestamp,
    // Quita el EXIF: los celulares guardan el GPS exacto de la casa.
    exif: 'false',
  };

  return {
    // Los parámetros firmados, tal cual: el navegador debe reenviarlos
    // idénticos o Cloudinary rechaza la subida.
    ...aFirmar,
    firma: firmar(aFirmar),
    api_key: key,
    cloud_name: cloud,
    carpeta,
    url: `https://api.cloudinary.com/v1_1/${cloud}/image/upload`,
  };
}

/* --------------------------- verificación ------------------------- */

/** Consulta la Admin API. Este es el paso que la gente suele saltarse. */
export async function verificarAsset(publicId: string, carpetaEsperada: string): Promise<Asset> {
  if (!publicId.startsWith(carpetaEsperada + '/')) {
    throw new ErrorHTTP(403, 'Esa imagen no corresponde a este aviso.', {
      codigo: 'MEDIO_AJENO',
    });
  }

  const asset = proveedor
    ? await proveedor.buscar(publicId)
    : await buscarEnCloudinary(publicId);

  if (!asset) {
    throw new ErrorHTTP(422, 'No encontramos esa imagen. Vuelve a subirla.', {
      codigo: 'MEDIO_NO_ENCONTRADO',
    });
  }
  return asset;
}

async function buscarEnCloudinary(publicId: string): Promise<Asset | null> {
  const { cloud, key, secret } = config();
  if (!secret) return null;

  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const url =
    `https://api.cloudinary.com/v1_1/${cloud}/resources/image/upload/` +
    encodeURIComponent(publicId) +
    '?phash=true';

  const r = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (r.status === 404) return null;
  if (!r.ok) {
    throw new ErrorHTTP(502, 'No pudimos confirmar la imagen. Intenta de nuevo.', {
      codigo: 'ALMACENAMIENTO_CAIDO',
    });
  }

  const d = (await r.json()) as Record<string, unknown>;
  return {
    public_id: String(d.public_id),
    secure_url: String(d.secure_url),
    width: Number(d.width),
    height: Number(d.height),
    bytes: Number(d.bytes),
    format: String(d.format),
    phash: d.phash ? String(d.phash) : undefined,
  };
}

export async function borrarAsset(publicId: string): Promise<void> {
  if (proveedor) return proveedor.borrar(publicId);

  const { cloud, key, secret } = config();
  if (!secret) return;

  const timestamp = Math.floor(Date.now() / 1000);
  const firma = firmar({ public_id: publicId, timestamp });

  const cuerpo = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: key,
    signature: firma,
  });

  await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/destroy`, {
    method: 'POST',
    body: cuerpo,
  }).catch(() => {
    // Un borrado fallido no debe romper la petición del usuario;
    // el cron de limpieza recoge los huérfanos.
  });
}

/* ---------------------------- variantes --------------------------- */

/** URLs derivadas. f_auto sirve AVIF/WebP según el navegador. */
export function variantes(publicId: string) {
  const { cloud } = config();
  const base = `https://res.cloudinary.com/${cloud}/image/upload`;
  return {
    miniatura: `${base}/c_fill,w_400,h_300,f_auto,q_auto:eco/${publicId}`,
    ficha: `${base}/c_limit,w_1200,h_900,f_auto,q_auto:good/${publicId}`,
    og: `${base}/c_fill,w_1200,h_630,f_auto/${publicId}`,
  };
}
