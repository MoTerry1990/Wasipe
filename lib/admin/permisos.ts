/**
 * Quién puede ver qué dentro de Wasipe.
 *
 * El puesto en Wasipe va aparte del rol de la cuenta: una persona puede
 * ser propietaria —y publicar su departamento— y además moderadora.
 * Mezclarlos obligaría a que quien modera deje de poder usar el producto.
 *
 * La separación no es desconfianza: es que el dato personal de alguien no
 * tiene por qué pasar por más manos de las necesarias (Ley 29733). Quien
 * modera avisos no necesita ver una tarjeta de crédito, y quien lleva
 * finanzas no necesita leer una denuncia.
 *
 * Esto es la comodidad de la interfaz. La autorización de verdad está en
 * las políticas y en las funciones de la base: sin ellas, esconder un
 * enlace no protege nada.
 */

export type PuestoDeWasipe = 'moderator' | 'support' | 'finance' | 'super_admin';

export const PUESTOS: Record<PuestoDeWasipe, { etiqueta: string; resumen: string }> = {
  moderator: {
    etiqueta: 'Moderación',
    resumen: 'Avisos, imágenes, denuncias y verificaciones.',
  },
  support: {
    etiqueta: 'Soporte',
    resumen: 'Cuentas y consultas. No toca plata ni modera.',
  },
  finance: {
    etiqueta: 'Finanzas',
    resumen: 'Pagos, créditos y destacados. No ve denuncias.',
  },
  super_admin: {
    etiqueta: 'Administración general',
    resumen: 'Todo, incluido nombrar y quitar personal.',
  },
};

export const PUESTOS_VALIDOS = Object.keys(PUESTOS) as PuestoDeWasipe[];

export function esPuesto(valor: string): valor is PuestoDeWasipe {
  return Object.prototype.hasOwnProperty.call(PUESTOS, valor);
}

// ---------------------------------------------------------------------
// Las secciones del panel
// ---------------------------------------------------------------------

export type SeccionAdmin = {
  clave: string;
  titulo: string;
  descripcion: string;
  href: string;
  /** Qué puestos la ven. `super_admin` las ve todas, sin listarse. */
  puestos: readonly PuestoDeWasipe[];
  /** false mientras la sección todavía no exista como pantalla. */
  construida: boolean;
};

export const SECCIONES: readonly SeccionAdmin[] = [
  {
    clave: 'avisos',
    titulo: 'Avisos por revisar',
    descripcion: 'Aprobar, rechazar, pedir cambios o pausar, siempre con motivo.',
    href: '/panel/admin/avisos',
    puestos: ['moderator'],
    construida: true,
  },
  {
    clave: 'banderas',
    titulo: 'Banderas',
    descripcion: 'Duplicados, precios raros y fotos repetidas. Señales, no sentencias.',
    href: '/panel/admin/banderas',
    puestos: ['moderator'],
    construida: true,
  },
  {
    clave: 'imagenes',
    titulo: 'Revisión de imágenes',
    descripcion: 'Lo que generó Wasi AI, antes y después, para retirar lo que no va.',
    href: '/panel/moderacion/imagenes',
    puestos: ['moderator'],
    construida: true,
  },
  {
    clave: 'usuarios',
    titulo: 'Personas y personal',
    descripcion: 'Cuentas, y quién tiene qué puesto dentro de Wasipe.',
    href: '/panel/admin/usuarios',
    puestos: ['support', 'super_admin'],
    construida: true,
  },
  {
    clave: 'inmobiliarias',
    titulo: 'Inmobiliarias',
    descripcion: 'Verificar o rechazar la verificación de una inmobiliaria.',
    href: '/panel/admin/inmobiliarias',
    puestos: ['moderator'],
    construida: true,
  },
  {
    clave: 'denuncias',
    titulo: 'Denuncias',
    descripcion: 'Lo que reporta la gente sobre un aviso.',
    href: '/panel/admin/denuncias',
    puestos: ['moderator'],
    construida: true,
  },
  {
    clave: 'mercado',
    titulo: 'Índice de mercado',
    descripcion: 'Estado del índice de precio por m² y recálculo.',
    href: '/panel/moderacion/mercado',
    puestos: ['super_admin'],
    construida: true,
  },
  {
    clave: 'ia',
    titulo: 'Trabajos de Wasi AI',
    descripcion: 'Qué pidió cada quien, cuánto costó y qué falló.',
    href: '/panel/admin/ia',
    puestos: ['moderator', 'finance'],
    construida: false,
  },
  {
    clave: 'pagos',
    titulo: 'Pagos y suscripciones',
    descripcion: 'Planes contratados y su estado.',
    href: '/panel/admin/pagos',
    puestos: ['finance'],
    construida: false,
  },
  {
    clave: 'creditos',
    titulo: 'Créditos',
    descripcion: 'El libro mayor: cargas, consumos y devoluciones.',
    href: '/panel/admin/creditos',
    puestos: ['finance'],
    construida: false,
  },
  {
    clave: 'destacados',
    titulo: 'Avisos destacados',
    descripcion: 'Qué está destacado, hasta cuándo y quién lo pagó.',
    href: '/panel/admin/destacados',
    puestos: ['finance'],
    construida: false,
  },
];

/** Las secciones que este puesto ve. */
export function seccionesDe(puestos: readonly PuestoDeWasipe[]): SeccionAdmin[] {
  if (puestos.includes('super_admin')) return [...SECCIONES];
  return SECCIONES.filter((s) => s.puestos.some((p) => puestos.includes(p)));
}

/** ¿Este conjunto de puestos alcanza para esta sección? */
export function accedeASeccion(puestos: readonly PuestoDeWasipe[], clave: string): boolean {
  return seccionesDe(puestos).some((s) => s.clave === clave);
}

// ---------------------------------------------------------------------
// Las decisiones de moderación
// ---------------------------------------------------------------------

export type Decision = 'approve' | 'reject' | 'request_changes' | 'pause';

export const DECISIONES: Record<
  Decision,
  { etiqueta: string; explicacion: string; exigeMotivo: boolean; tono: string }
> = {
  approve: {
    etiqueta: 'Publicar',
    explicacion: 'El aviso queda visible para todo el mundo.',
    exigeMotivo: false,
    tono: 'verde',
  },
  request_changes: {
    etiqueta: 'Pedir cambios',
    explicacion:
      'Vuelve a borrador para que la persona lo corrija y lo reenvíe sin perder nada.',
    exigeMotivo: true,
    tono: 'maiz',
  },
  reject: {
    etiqueta: 'Rechazar',
    explicacion: 'No se publica. La persona ve el motivo en su panel.',
    exigeMotivo: true,
    tono: 'fucsia',
  },
  pause: {
    etiqueta: 'Pausar',
    explicacion: 'Se saca de circulación mientras se revisa algo puntual.',
    exigeMotivo: true,
    tono: 'neutro',
  },
};

export const DECISIONES_VALIDAS = Object.keys(DECISIONES) as Decision[];

export function esDecision(valor: string): valor is Decision {
  return Object.prototype.hasOwnProperty.call(DECISIONES, valor);
}

/** Largo mínimo del motivo. El mismo que exige la base. */
export const MOTIVO_MINIMO = 10;

/**
 * ¿Se puede tomar esta decisión con este motivo?
 *
 * Un «no cumple» de nueve letras deja a la persona sin saber qué
 * corregir, y a Wasipe sin poder defender la decisión si reclama.
 */
export function motivoValido(decision: Decision, motivo: string): boolean {
  if (!DECISIONES[decision].exigeMotivo) return true;
  return motivo.trim().length >= MOTIVO_MINIMO;
}

// ---------------------------------------------------------------------
// Las banderas
// ---------------------------------------------------------------------

export type TipoDeBandera = 'duplicate' | 'suspicious_price' | 'repeated_image' | 'manual';

export const BANDERAS: Record<TipoDeBandera, { etiqueta: string; queMirar: string }> = {
  duplicate: {
    etiqueta: 'Posible duplicado',
    queMirar:
      'Mira si son el mismo inmueble o dos departamentos parecidos del mismo edificio, que es normal.',
  },
  suspicious_price: {
    etiqueta: 'Precio raro',
    queMirar:
      'Casi siempre es un cero de más o de menos, o el precio cargado en la moneda equivocada.',
  },
  repeated_image: {
    etiqueta: 'Foto repetida',
    queMirar:
      'La misma foto en otro aviso. Puede ser la misma inmobiliaria republicando, o una foto tomada de internet.',
  },
  manual: {
    etiqueta: 'Marcado a mano',
    queMirar: 'Alguien del equipo lo marcó. El motivo está en el detalle.',
  },
};

export function esBandera(valor: string): valor is TipoDeBandera {
  return Object.prototype.hasOwnProperty.call(BANDERAS, valor);
}

/**
 * Lo que una bandera NO hace.
 *
 * Va escrito y se muestra en la pantalla de moderación. Automatizar la
 * baja de un aviso por un puntaje sería castigar a quien publicó dos
 * departamentos parecidos en el mismo edificio.
 */
export const LAS_BANDERAS_NO_DECIDEN =
  'Una bandera no despublica nada ni le llega a quien publicó: es una señal para que una persona mire. Muchas son falsas.';
