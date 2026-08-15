import type {
  Operacion,
  TipoInmueble,
  EstadoInmueble,
  EstadoPublicacion,
  EstadoVerificacion,
  RolUsuario,
  Amoblado,
  PoliticaMascotas,
  PrivacidadDireccion,
  EstadoConsulta,
  MotivoDenuncia,
  TipoTrabajoIA,
} from '@/types/base-datos';

/**
 * Traducción de los valores de la base al español peruano.
 *
 * En la base los enumerados van en inglés, como el resto del código. Este
 * archivo es el único puente hacia la interfaz: ningún valor crudo debe
 * llegar a la pantalla. La prueba de idioma vigila que así sea.
 *
 * Vocabulario del Perú: "departamento" y no "apartamento", "cochera" y no
 * "garaje", "corredor inmobiliario" y no "agente".
 */

export const OPERACION: Record<Operacion, string> = {
  sale: 'Venta',
  rent: 'Alquiler',
  project: 'Proyecto',
};

export const TIPO_INMUEBLE: Record<TipoInmueble, string> = {
  apartment: 'Departamento',
  house: 'Casa',
  land: 'Terreno',
  office: 'Oficina',
  commercial: 'Local comercial',
  warehouse: 'Almacén',
  room: 'Habitación',
  country_house: 'Casa de campo',
  garage: 'Cochera',
  building: 'Edificio',
};

export const ESTADO_INMUEBLE: Record<EstadoInmueble, string> = {
  available: 'Disponible',
  reserved: 'Reservado',
  sold: 'Vendido',
  rented: 'Alquilado',
  withdrawn: 'Retirado',
};

export const ESTADO_PUBLICACION: Record<EstadoPublicacion, string> = {
  draft: 'Borrador',
  in_review: 'En revisión',
  published: 'Publicado',
  rejected: 'Rechazado',
  paused: 'Pausado',
  expired: 'Vencido',
};

export const ESTADO_VERIFICACION: Record<EstadoVerificacion, string> = {
  unverified: 'Sin verificar',
  in_progress: 'En verificación',
  verified: 'Verificado',
  rejected: 'Verificación rechazada',
};

export const ROL: Record<RolUsuario, string> = {
  buyer: 'Comprador',
  owner: 'Propietario directo',
  agent: 'Corredor inmobiliario',
  agency_admin: 'Administrador de inmobiliaria',
  moderator: 'Moderador',
  admin: 'Administrador',
};

export const AMOBLADO: Record<Amoblado, string> = {
  none: 'Sin amoblar',
  partial: 'Parcialmente amoblado',
  full: 'Amoblado',
};

export const MASCOTAS: Record<PoliticaMascotas, string> = {
  allowed: 'Acepta mascotas',
  not_allowed: 'No acepta mascotas',
  negotiable: 'Mascotas a conversar',
};

export const PRIVACIDAD_DIRECCION: Record<PrivacidadDireccion, string> = {
  exact: 'Dirección exacta visible',
  approximate: 'Ubicación aproximada',
  district_only: 'Solo el distrito',
};

export const ESTADO_CONSULTA: Record<EstadoConsulta, string> = {
  new: 'Nueva',
  read: 'Leída',
  answered: 'Respondida',
  archived: 'Archivada',
  spam: 'Spam',
};

export const MOTIVO_DENUNCIA: Record<MotivoDenuncia, string> = {
  duplicate: 'Aviso duplicado',
  wrong_price: 'El precio no es real',
  already_taken: 'Ya se vendió o alquiló',
  fake_photos: 'Las fotos no corresponden',
  scam: 'Parece una estafa',
  wrong_location: 'La ubicación está mal',
  other: 'Otro motivo',
};

export const TRABAJO_IA: Record<TipoTrabajoIA, string> = {
  listing_draft: 'Redacción del aviso',
  photo_enhance: 'Mejora de fotos',
  virtual_staging: 'Amoblado virtual',
  video_tour: 'Video del inmueble',
  price_estimate: 'Estimación de precio',
  search_parse: 'Búsqueda en lenguaje natural',
};

/**
 * Aviso legal de las estimaciones de precio.
 *
 * Va donde se muestre cualquier valor calculado por Wasi AI. Es una
 * referencia de mercado, no una tasación: una tasación la firma un
 * perito registrado.
 */
export const AVISO_ESTIMACION =
  'Estimación referencial calculada con avisos similares. No es una tasación oficial.';

/** Etiqueta obligatoria de las imágenes modificadas con IA. */
export const ETIQUETA_IA = 'Imagen modificada con Wasi AI';
