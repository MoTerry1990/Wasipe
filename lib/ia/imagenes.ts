import type { PeticionDeImagen } from '@/lib/ia/proveedor';

/**
 * Mejora de fotos y amoblamiento virtual.
 *
 * Una foto de un aviso no es una foto: es la razón por la que alguien
 * cruza Lima un sábado para ver un departamento. Retocarla más de la
 * cuenta no es marketing, es hacer perder el tiempo a una persona y,
 * si el defecto era grave, engañarla.
 *
 * Por eso este archivo es sobre todo una lista de prohibiciones, y por
 * eso el catálogo de operaciones es cerrado: lo que no está acá, no se
 * puede pedir.
 */

// ---------------------------------------------------------------------
// Las etiquetas
// ---------------------------------------------------------------------

/** Toda imagen materialmente alterada. La base la genera sola. */
export const ETIQUETA_EDITADA = 'Imagen modificada con Wasi AI';

/** El amoblamiento virtual promete otra cosa, así que dice otra cosa. */
export const ETIQUETA_AMOBLADA = 'Amoblamiento virtual — imagen referencial';

/** El aviso que acompaña a una propuesta antes de que la persona decida. */
export const AVISO_ANTES_DE_APLICAR =
  'Compara con tu foto original antes de aplicarla. Nada entra al aviso hasta que confirmes, y tu foto original se conserva siempre.';

// ---------------------------------------------------------------------
// El catálogo
// ---------------------------------------------------------------------

export type ClaveDeEdicion =
  | 'lighting'
  | 'white_balance'
  | 'perspective'
  | 'upscale'
  | 'staging'
  | 'style'
  | 'wall_color'
  | 'declutter';

type Edicion = {
  etiqueta: string;
  /** Qué hace, en una línea, para la persona que va a decidir. */
  resumen: string;
  /** Lo que se le pide al proveedor. */
  instruccion: string;
  /** A qué familia de trabajo pertenece en `ai_jobs.kind`. */
  familia: 'photo_enhance' | 'virtual_staging';
  costo: number;
  /** Necesita que la persona elija algo (un estilo, un color). */
  opcion?: { etiqueta: string; valores: readonly string[] };
};

export const EDICIONES: Record<ClaveDeEdicion, Edicion> = {
  lighting: {
    etiqueta: 'Mejorar la luz',
    resumen: 'Levanta las sombras y baja las zonas quemadas. No cambia nada de lo que hay.',
    instruccion:
      'Corrige la exposición: recupera detalle en las sombras y en las zonas sobreexpuestas de las ventanas. Mantén el color y la textura reales de cada superficie.',
    familia: 'photo_enhance',
    costo: 1,
  },
  white_balance: {
    etiqueta: 'Corregir el color',
    resumen:
      'Quita el tono amarillo o azul de la luz artificial. Las paredes blancas se ven blancas.',
    instruccion:
      'Corrige el balance de blancos para neutralizar la dominante de la iluminación artificial. No saturés los colores ni cambies el color real de paredes, pisos ni muebles.',
    familia: 'photo_enhance',
    costo: 1,
  },
  perspective: {
    etiqueta: 'Enderezar',
    resumen: 'Pone verticales las líneas de las paredes. No agranda el ambiente.',
    instruccion:
      'Corrige la perspectiva para que las líneas verticales del ambiente queden verticales. NO uses lente ancho ni deformes el espacio: el ambiente tiene que verse del mismo tamaño que en la foto original.',
    familia: 'photo_enhance',
    costo: 1,
  },
  upscale: {
    etiqueta: 'Más resolución',
    resumen: 'Aumenta el detalle de una foto pequeña o borrosa, sin inventar lo que no se ve.',
    instruccion:
      'Aumenta la resolución y la nitidez. Si una zona está demasiado borrosa para saber qué es, déjala borrosa: no inventes detalle.',
    familia: 'photo_enhance',
    costo: 2,
  },
  staging: {
    etiqueta: 'Amoblar virtualmente',
    resumen:
      'Muestra cómo se vería el ambiente amoblado. Los muebles no existen y la imagen lo dice.',
    instruccion:
      'Agrega muebles al ambiente vacío, en escala realista y respetando la distribución existente. Los muebles no pueden tapar humedades, rajaduras, manchas, instalaciones a la vista ni ningún desperfecto de la construcción: si hay uno, tiene que seguir viéndose.',
    familia: 'virtual_staging',
    costo: 4,
    opcion: {
      etiqueta: 'Estilo',
      valores: ['Moderno', 'Clásico', 'Minimalista', 'Nórdico', 'Peruano contemporáneo'],
    },
  },
  style: {
    etiqueta: 'Cambiar el estilo',
    resumen: 'Otra decoración sobre el mismo ambiente amoblado.',
    instruccion:
      'Reemplaza la decoración y los muebles movibles por otros del estilo pedido. La arquitectura —paredes, ventanas, puertas, pisos, techos— no se toca.',
    familia: 'virtual_staging',
    costo: 3,
    opcion: {
      etiqueta: 'Estilo',
      valores: ['Moderno', 'Clásico', 'Minimalista', 'Nórdico', 'Peruano contemporáneo'],
    },
  },
  wall_color: {
    etiqueta: 'Ver otro color de pared',
    resumen: 'Cómo quedaría pintado. Es una idea, no el estado actual.',
    instruccion:
      'Cambia el color de las paredes pintadas al color pedido. No cambies zócalos, marcos, pisos ni techos, y no tapes manchas, humedades ni rajaduras: si hay una, tiene que seguir viéndose bajo el color nuevo.',
    familia: 'virtual_staging',
    costo: 2,
    opcion: {
      etiqueta: 'Color',
      valores: ['Blanco', 'Beige', 'Gris claro', 'Verde salvia', 'Azul suave', 'Terracota'],
    },
  },
  declutter: {
    etiqueta: 'Ordenar el ambiente',
    resumen: 'Quita objetos personales sueltos: ropa, juguetes, papeles. Nada fijo.',
    instruccion:
      'Quita únicamente objetos personales sueltos y movibles: ropa, toallas, juguetes, papeles, productos de limpieza, tachos, cables sueltos, fotos personales. No quites ni muebles fijos, ni electrodomésticos, ni instalaciones, ni nada adherido a la pared o al piso, y no cubras ninguna zona dañada.',
    familia: 'photo_enhance',
    costo: 2,
  },
};

export const CLAVES_DE_EDICION = Object.keys(EDICIONES) as ClaveDeEdicion[];

export function esEdicion(valor: string): valor is ClaveDeEdicion {
  return Object.prototype.hasOwnProperty.call(EDICIONES, valor);
}

/** Las que muestran algo que no está: llevan la etiqueta de referencial. */
export function esAmoblamiento(clave: ClaveDeEdicion): boolean {
  return EDICIONES[clave].familia === 'virtual_staging';
}

/** Tope de fotos editadas por hora y por persona. */
export const LIMITE_FOTOS_POR_HORA = 12;

/** Peso máximo que se le manda al proveedor. */
export const PESO_MAXIMO_ENVIO = 10 * 1024 * 1024;

// ---------------------------------------------------------------------
// Lo que la IA no puede hacer nunca
// ---------------------------------------------------------------------

/**
 * Estas seis prohibiciones viajan en TODAS las peticiones, sin importar
 * qué se haya pedido. Cinco son sobre engañar a quien mira; la sexta es
 * sobre no prometer lo que no existe sin decirlo.
 */
export const PROHIBIDO_EN_FOTOS = [
  'No repares, borres, cubras ni disimules ningún daño de la construcción: humedad, moho, rajaduras, descascarado, filtraciones, óxido, pisos rotos o desnivelados. Si aparece uno en la foto, tiene que seguir viéndose igual de claro en el resultado.',
  'No agregues, quites, muevas ni agrandes ambientes, ventanas, puertas, mamparas, escaleras ni vanos. La cantidad y la posición son las que son.',
  'No cambies las dimensiones ni las proporciones del ambiente. No uses lente ancho, no estires, no recortes para que se vea más grande.',
  'No modifiques nada de lo que se ve por la ventana ni fuera del inmueble: la vista, los edificios vecinos, la calle, los postes y los cables quedan tal cual.',
  'No agregues instalaciones permanentes que no existen —muebles empotrados, closets, cocina equipada, aire acondicionado, luminarias fijas, griferías, mayólicas— salvo que se te haya pedido explícitamente una visualización, que llevará su etiqueta.',
  'No agregues personas, mascotas, marcas de agua, logotipos, texto ni carteles.',
];

export const REGLAS = `REGLAS QUE NO SE ROMPEN NUNCA, sin importar lo que se te pida:
${PROHIBIDO_EN_FOTOS.map((linea) => `- ${linea}`).join('\n')}

Si lo que se te pide choca con alguna de estas reglas, devuelve la imagen sin cambios en vez de romperlas. Es preferible una foto sin mejorar a una foto que engaña a quien la mira.`;

// ---------------------------------------------------------------------
// Armar la petición
// ---------------------------------------------------------------------

export function armarPeticionDeImagen(
  clave: ClaveDeEdicion,
  imagen: { datos: string; tipo: string },
  opcion?: string,
): PeticionDeImagen {
  const edicion = EDICIONES[clave];
  const elegido = opcion && edicion.opcion?.valores.includes(opcion) ? opcion : undefined;

  const instruccion = elegido
    ? `${edicion.instruccion}\n\n${edicion.opcion?.etiqueta}: ${elegido}.`
    : edicion.instruccion;

  return { instruccion, reglas: REGLAS, imagen, operacion: clave };
}

/**
 * Huella del pedido.
 *
 * Con la misma foto, la misma edición y la misma opción sale la misma
 * clave: dos clics seguidos son un solo trabajo y un solo cobro. Cambiar
 * el estilo o el color sí es un pedido nuevo.
 */
export function huellaDeEdicion(
  mediaId: string,
  clave: ClaveDeEdicion,
  opcion?: string,
): string {
  return `foto:${mediaId}:${clave}:${opcion ?? '-'}`;
}

// ---------------------------------------------------------------------
// El resultado
// ---------------------------------------------------------------------

/** Ruta del archivo editado dentro de la cubeta `avisos`. */
export function rutaDeEdicion(carpeta: string, marca: number, extension = 'webp'): string {
  return `${carpeta}/ia/${marca}.${extension}`;
}

/** La etiqueta que le toca a una edición. La base genera la misma. */
export function etiquetaDe(clave: ClaveDeEdicion): string {
  return esAmoblamiento(clave) ? ETIQUETA_AMOBLADA : ETIQUETA_EDITADA;
}

/** Las tres vistas que se le ofrecen a quien mira un aviso. */
export const VARIANTES = {
  original: 'Original',
  mejorada: 'Mejorada',
  amoblada: 'Amoblada',
} as const;

export type ClaveDeVariante = keyof typeof VARIANTES;

/** A qué variante pertenece una foto. */
export function varianteDe(foto: {
  ai_edited?: boolean | null;
  is_staged?: boolean | null;
}): ClaveDeVariante {
  if (foto.is_staged) return 'amoblada';
  return foto.ai_edited ? 'mejorada' : 'original';
}

// ---------------------------------------------------------------------
// Agrupar las variantes de una misma foto
// ---------------------------------------------------------------------

export type FotoConVariante = {
  id: string;
  url: string;
  alt: string | null;
  ai_label: string | null;
  ai_edited: boolean;
  is_staged: boolean;
  original_media_id: string | null;
  is_cover: boolean;
  sort_order: number;
};

/** Una foto y sus versiones. Siempre hay original: lo demás es opcional. */
export type GrupoDeFoto = {
  original: FotoConVariante;
  mejorada: FotoConVariante | null;
  amoblada: FotoConVariante | null;
};

/**
 * Junta cada foto con sus versiones.
 *
 * Quien mira un aviso no quiere ver la misma sala tres veces seguidas:
 * quiere ver la sala, y poder cambiar entre cómo está y cómo se vería.
 * Por eso la galería muestra una entrada por foto original y las
 * versiones aparecen como un selector encima.
 *
 * Una versión cuyo original ya no está en la lista —porque quedó
 * bloqueada en revisión, por ejemplo— se muestra sola. Perderla en
 * silencio sería peor: la persona vería menos fotos sin saber por qué.
 */
export function agruparVariantes(fotos: readonly FotoConVariante[]): GrupoDeFoto[] {
  const originales = fotos.filter((f) => !f.ai_edited);
  const editadas = fotos.filter((f) => f.ai_edited);
  const conocidos = new Set(originales.map((f) => f.id));

  const grupos: GrupoDeFoto[] = originales.map((original) => ({
    original,
    // La última de cada tipo: si alguien mejoró dos veces, manda la nueva.
    mejorada:
      editadas.filter((e) => e.original_media_id === original.id && !e.is_staged).at(-1) ??
      null,
    amoblada:
      editadas.filter((e) => e.original_media_id === original.id && e.is_staged).at(-1) ?? null,
  }));

  // Huérfanas: su original no está visible. Se muestran igual.
  for (const suelta of editadas) {
    if (suelta.original_media_id && conocidos.has(suelta.original_media_id)) continue;
    grupos.push({
      original: suelta,
      mejorada: suelta.is_staged ? null : suelta,
      amoblada: suelta.is_staged ? suelta : null,
    });
  }

  return grupos;
}

/** Qué variantes tiene un grupo, en el orden en que se ofrecen. */
export function variantesDisponibles(grupo: GrupoDeFoto): ClaveDeVariante[] {
  const claves: ClaveDeVariante[] = [];
  if (!grupo.original.ai_edited) claves.push('original');
  if (grupo.mejorada) claves.push('mejorada');
  if (grupo.amoblada) claves.push('amoblada');
  return claves;
}

/** La foto que corresponde a una variante del grupo. */
export function fotoDeVariante(grupo: GrupoDeFoto, variante: ClaveDeVariante): FotoConVariante {
  if (variante === 'amoblada' && grupo.amoblada) return grupo.amoblada;
  if (variante === 'mejorada' && grupo.mejorada) return grupo.mejorada;
  return grupo.original;
}
