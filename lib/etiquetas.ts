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

/**
 * En plural, para los títulos de búsqueda.
 *
 * "Departamentos en alquiler en Miraflores" es literalmente lo que se
 * escribe en Google en el Perú; el singular suena a ficha de aviso.
 */
export const TIPO_INMUEBLE_PLURAL: Record<TipoInmueble, string> = {
  apartment: 'Departamentos',
  house: 'Casas',
  land: 'Terrenos',
  office: 'Oficinas',
  commercial: 'Locales comerciales',
  warehouse: 'Almacenes',
  room: 'Habitaciones',
  country_house: 'Casas de campo',
  garage: 'Cocheras',
  building: 'Edificios',
};

export const ESTADO_INMUEBLE: Record<EstadoInmueble, string> = {
  available: 'Disponible',
  reserved: 'Reservado',
  sold: 'Vendido',
  rented: 'Alquilado',
  withdrawn: 'Retirado',
};

/**
 * Los tres finales de un aviso, en primera persona.
 *
 * `ESTADO_INMUEBLE` dice cómo está el aviso —«Vendido»— y esto dice qué
 * hace quien cierra —«Lo vendí»—. Son dos textos distintos a propósito:
 * uno es una etiqueta que se lee y el otro un botón que se pulsa.
 *
 * `reserved` no está: reservar no es cerrar, y ofrecerlo en el mismo menú
 * mezclaría «esto ya no está» con «esto está pero en trámite».
 */
export const MOTIVOS_DE_CIERRE = {
  sold: 'Lo vendí',
  rented: 'Lo alquilé',
  withdrawn: 'Ya no lo ofrezco',
} as const;

export type MotivoDeCierre = keyof typeof MOTIVOS_DE_CIERRE;

export function esMotivoDeCierre(valor: string): valor is MotivoDeCierre {
  return valor in MOTIVOS_DE_CIERRE;
}

export const ESTADO_PUBLICACION: Record<EstadoPublicacion, string> = {
  draft: 'Borrador',
  in_review: 'En revisión',
  published: 'Publicado',
  rejected: 'Rechazado',
  paused: 'Pausado',
  expired: 'Vencido',
  archived: 'Archivado',
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

/**
 * Características del inmueble, en castellano.
 *
 * La clave la escribe quien publica desde un catálogo de la aplicación;
 * si aparece una que no está acá, se muestra la clave con guiones
 * cambiados por espacios en vez de esconderla.
 */
export const CARACTERISTICA: Record<string, string> = {
  ascensor: 'Ascensor',
  porteria_24h: 'Portería 24 horas',
  deposito: 'Depósito',
  area_parrillas: 'Área de parrillas',
  gimnasio: 'Gimnasio',
  piscina: 'Piscina',
  terraza_comun: 'Terraza común',
  sala_reuniones: 'Sala de reuniones',
  sala_juegos: 'Sala de juegos',
  amoblado: 'Amoblado',
  lavanderia: 'Lavandería',
  jardin: 'Jardín',
  parrilla: 'Parrilla',
  techos_altos: 'Techos altos',
  vista_mar: 'Vista al mar',
  vista_montana: 'Vista a la montaña',
  vista_parque: 'Vista al parque',
  agua_luz: 'Agua y luz instaladas',
  cercado: 'Terreno cercado',
  cisterna: 'Cisterna',
  pozo_luz: 'Pozo de luz',
  aire_acondicionado: 'Aire acondicionado',
  calefaccion: 'Calefacción',
  cocina_equipada: 'Cocina equipada',
  closet_empotrado: 'Clósets empotrados',
  piso: 'Piso',
  estudio: 'Estudio',
  cuarto_servicio: 'Cuarto de servicio',
};

/** El nombre de una característica, aunque no esté en el catálogo. */
export function nombreDeCaracteristica(clave: string): string {
  const conocida = CARACTERISTICA[clave];
  if (conocida) return conocida;
  const suelta = clave.replace(/_/g, ' ');
  return suelta.charAt(0).toUpperCase() + suelta.slice(1);
}
