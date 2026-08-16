import type { ClaveDeFormato, ClaveDePlantilla, Guion } from '@/lib/ia/video';

/**
 * Lo que las acciones de video le devuelven a la pantalla.
 *
 * En su propio archivo porque un módulo `'use server'` solo puede
 * exportar funciones asíncronas.
 */

export type VistaPrevia = {
  guion: Guion;
  formato: ClaveDeFormato;
  plantilla: ClaveDePlantilla;
  /** Lo que va a costar. Se muestra ANTES de apretar el botón. */
  costo: number;
  saldo: number;
  /** Fotos aprobadas que se van a usar. */
  fotos: number;
};

export type RespuestaDeVistaPrevia =
  { ok: true; vista: VistaPrevia } | { ok: false; mensaje: string };

export type EstadoDelVideo = {
  trabajoId: string;
  videoId: string | null;
  /** 'encolado' · 'renderizando' · 'listo' · 'falla' · 'cancelado' */
  estado: 'encolado' | 'renderizando' | 'listo' | 'falla' | 'cancelado';
  progreso: number;
  mensaje?: string;
  /** Enlace firmado y de vida corta. Solo cuando está listo y autorizado. */
  descarga?: string;
  duracionMs?: number;
  venceEl?: string;
  sePuedeReintentar?: boolean;
};

export type RespuestaDeVideo =
  { ok: true; video: EstadoDelVideo } | { ok: false; mensaje: string };
