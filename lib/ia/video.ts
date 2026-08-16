import { dinero, metros, numero } from '@/lib/formato';
import { OPERACION, TIPO_INMUEBLE } from '@/lib/etiquetas';
import type { Moneda, Operacion, TipoInmueble } from '@/types/base-datos';

/**
 * Video automático del aviso.
 *
 * Un video se comparte por WhatsApp y se reenvía: sale del control de
 * Wasipe en el primer envío. De ahí las dos decisiones que mandan en
 * este archivo:
 *
 *   1. TODO lo que el video dice sale de los campos del aviso, armado
 *      por código. No hay un modelo escribiendo la narración: hay una
 *      plantilla rellenada con el precio, el distrito y los metros que
 *      la persona cargó. Una narración que no puede inventar no miente.
 *
 *   2. La cámara no se mueve por el inmueble. Un recorrido continuo
 *      entre fotos sueltas insinúa una distribución que nadie verificó
 *      —que la cocina da a la sala, que hay un pasillo ahí— y eso es
 *      exactamente el engaño que este proyecto no hace.
 */

// ---------------------------------------------------------------------
// Formatos
// ---------------------------------------------------------------------

export type ClaveDeFormato = 'vertical' | 'square' | 'horizontal';

export type Formato = {
  etiqueta: string;
  /** Dónde se usa. Ayuda a elegir sin saber de relaciones de aspecto. */
  para: string;
  ancho: number;
  alto: number;
  /**
   * Zona segura, en píxeles desde cada borde.
   *
   * En vertical, TikTok e Instagram pintan encima: el nombre de la
   * cuenta abajo, los botones a la derecha, la barra de estado arriba.
   * Un precio que cae ahí queda tapado justo en el video que más se
   * comparte. Los márgenes de abajo son los grandes por eso.
   */
  seguro: { arriba: number; abajo: number; lados: number };
};

export const FORMATOS: Record<ClaveDeFormato, Formato> = {
  vertical: {
    etiqueta: 'Vertical 9:16',
    para: 'Historias, Reels y TikTok',
    ancho: 1080,
    alto: 1920,
    seguro: { arriba: 220, abajo: 420, lados: 96 },
  },
  square: {
    etiqueta: 'Cuadrado 1:1',
    para: 'Publicación de feed',
    ancho: 1080,
    alto: 1080,
    seguro: { arriba: 90, abajo: 110, lados: 80 },
  },
  horizontal: {
    etiqueta: 'Horizontal 16:9',
    para: 'YouTube, web y presentaciones',
    ancho: 1920,
    alto: 1080,
    seguro: { arriba: 70, abajo: 90, lados: 120 },
  },
};

export const CLAVES_DE_FORMATO = Object.keys(FORMATOS) as ClaveDeFormato[];

export function esFormato(valor: string): valor is ClaveDeFormato {
  return Object.prototype.hasOwnProperty.call(FORMATOS, valor);
}

/** El rectángulo utilizable de un formato, en píxeles. */
export function areaSegura(clave: ClaveDeFormato) {
  const f = FORMATOS[clave];
  return {
    x: f.seguro.lados,
    y: f.seguro.arriba,
    ancho: f.ancho - f.seguro.lados * 2,
    alto: f.alto - f.seguro.arriba - f.seguro.abajo,
  };
}

// ---------------------------------------------------------------------
// Movimiento: lo que la cámara NO hace
// ---------------------------------------------------------------------

/**
 * Acercamiento máximo dentro de UNA foto: 6%.
 *
 * Alcanza para que la imagen no se sienta congelada y no alcanza para
 * insinuar que alguien está caminando. Más que esto empieza a parecer
 * una toma en movimiento, y una toma en movimiento entre fotos sueltas
 * es una mentira sobre la distribución.
 */
export const ACERCAMIENTO_MAXIMO = 1.06;

/** Movimientos permitidos. La lista es cerrada. */
export const MOVIMIENTOS = ['fijo', 'acercar', 'alejar'] as const;
export type Movimiento = (typeof MOVIMIENTOS)[number];

/**
 * Y los prohibidos, con el motivo. Van escritos acá y no en un comentario
 * porque la pantalla se los muestra a la persona: quien publica tiene que
 * saber por qué su video no parece un recorrido de agencia gringa.
 */
export const MOVIMIENTOS_PROHIBIDOS = [
  'Recorridos continuos entre fotos: dan a entender que un ambiente conecta con otro, y eso no lo verificó nadie.',
  'Paneos y barridos laterales que sugieren que el ambiente sigue más allá del borde de la foto.',
  'Efectos de profundidad o parallax en 3D, que inventan geometría donde solo hay una imagen plana.',
  'Transiciones de «atravesar una puerta» o «entrar a la casa» entre dos fotos distintas.',
];

export function movimientoValido(m: string, escala: number): boolean {
  if (!(MOVIMIENTOS as readonly string[]).includes(m)) return false;
  return escala >= 1 && escala <= ACERCAMIENTO_MAXIMO;
}

// ---------------------------------------------------------------------
// Plantillas
// ---------------------------------------------------------------------

export type ClaveDePlantilla = 'modern' | 'premium' | 'minimal' | 'reel';

type Plantilla = {
  etiqueta: string;
  resumen: string;
  /** Segundos que dura cada foto en pantalla. */
  segundosPorFoto: number;
  /** Cuántas fotos entran, como máximo. */
  fotosMaximas: number;
  narracionPorDefecto: boolean;
  /** El ánimo de la música. El proveedor elige una pista con licencia. */
  musica: string;
  movimiento: Movimiento;
  costo: number;
};

export const PLANTILLAS: Record<ClaveDePlantilla, Plantilla> = {
  modern: {
    etiqueta: 'Moderna',
    resumen: 'Tipografía grande, cortes limpios y los datos siempre a la vista.',
    segundosPorFoto: 3,
    fotosMaximas: 10,
    narracionPorDefecto: true,
    musica: 'moderna-instrumental',
    movimiento: 'acercar',
    costo: 8,
  },
  premium: {
    etiqueta: 'Premium',
    resumen: 'Más pausada, con fundidos largos. Para propiedades de mayor valor.',
    segundosPorFoto: 4,
    fotosMaximas: 12,
    narracionPorDefecto: true,
    musica: 'piano-sobrio',
    movimiento: 'acercar',
    costo: 12,
  },
  minimal: {
    etiqueta: 'Mínima',
    resumen: 'Solo las fotos y los datos. Sin música ni narración.',
    segundosPorFoto: 3,
    fotosMaximas: 8,
    narracionPorDefecto: false,
    musica: '',
    movimiento: 'fijo',
    costo: 5,
  },
  reel: {
    etiqueta: 'Reel rápido',
    resumen: 'Corto y con ritmo, para redes. Menos de 20 segundos.',
    segundosPorFoto: 1.6,
    fotosMaximas: 8,
    narracionPorDefecto: false,
    musica: 'ritmo-rapido',
    movimiento: 'acercar',
    costo: 6,
  },
};

export const CLAVES_DE_PLANTILLA = Object.keys(PLANTILLAS) as ClaveDePlantilla[];

export function esPlantilla(valor: string): valor is ClaveDePlantilla {
  return Object.prototype.hasOwnProperty.call(PLANTILLAS, valor);
}

/** Tope de videos por persona y por hora. Renderizar cuesta de verdad. */
export const LIMITE_VIDEOS_POR_HORA = 4;

/** Cuánto vive un video antes de vencer. */
export const DIAS_DE_VIGENCIA = 90;

/** Mínimo de fotos para que un video tenga sentido. */
export const FOTOS_MINIMAS_VIDEO = 3;

// ---------------------------------------------------------------------
// Los datos del aviso
// ---------------------------------------------------------------------

export type DatosDelVideo = {
  titulo: string;
  distrito: string;
  provincia?: string | null;
  operacion: Operacion;
  tipo: TipoInmueble;
  moneda: Moneda;
  precio: number;
  areaTotal: number;
  dormitorios?: number | null;
  banos?: number | null;
  cocheras?: number | null;
  /** Solo fotos aprobadas: originales o ediciones que pasaron revisión. */
  fotos: readonly { url: string; etiqueta: string | null }[];
  contacto: { nombre: string; whatsapp?: string | null };
  /** Marca de la inmobiliaria, cuando el plan la habilita. */
  inmobiliaria?: { nombre: string; logo: string | null } | null;
};

/** Planes que pueden poner su propia marca en el video. */
export const PLANES_CON_MARCA = ['agencia', 'agencia_plus', 'corporativo'] as const;

export function puedeMarcarInmobiliaria(planCode: string | null | undefined): boolean {
  return Boolean(planCode && (PLANES_CON_MARCA as readonly string[]).includes(planCode));
}

// ---------------------------------------------------------------------
// El guion
// ---------------------------------------------------------------------

export type Escena =
  | {
      tipo: 'foto';
      url: string;
      segundos: number;
      movimiento: Movimiento;
      escala: number;
      /** Hasta dos líneas. La segunda es el dato de apoyo. */
      texto: string[];
      /** Etiqueta obligatoria si la foto fue modificada con IA. */
      etiquetaIA: string | null;
    }
  | { tipo: 'cierre'; segundos: number; texto: string[]; marca: string; llamada: string };

export type Guion = {
  formato: ClaveDeFormato;
  plantilla: ClaveDePlantilla;
  escenas: Escena[];
  /** Lo que se lee en voz alta. Sale de los mismos datos, nunca de un modelo. */
  narracion: string;
  /** Subtítulos, uno por escena, en el mismo orden. */
  subtitulos: string[];
  musica: string;
  segundosTotales: number;
};

/** La ficha en una línea: «3 dorm. · 2 baños · 92 m²». */
export function fichaCorta(datos: DatosDelVideo): string {
  const partes: string[] = [];
  if (datos.dormitorios) partes.push(`${datos.dormitorios} dorm.`);
  if (datos.banos) partes.push(`${datos.banos} ${datos.banos === 1 ? 'baño' : 'baños'}`);
  if (datos.cocheras)
    partes.push(`${datos.cocheras} cochera${datos.cocheras === 1 ? '' : 's'}`);
  partes.push(metros(datos.areaTotal));
  return partes.join(' · ');
}

/**
 * La narración, armada con los campos del aviso.
 *
 * Cada frase se puede rastrear a un campo: no hay adjetivos de venta, no
 * hay «excelente ubicación» ni «zona tranquila». Si un dato falta, la
 * frase no aparece; nunca se rellena con una suposición.
 */
export function armarNarracion(datos: DatosDelVideo): string {
  const frases: string[] = [];

  const tipo = TIPO_INMUEBLE[datos.tipo];
  const operacion = datos.operacion === 'rent' ? 'en alquiler' : 'en venta';
  frases.push(`${tipo} ${operacion} en ${datos.distrito}.`);

  frases.push(`${metros(datos.areaTotal)} de área total.`);

  const ambientes: string[] = [];
  if (datos.dormitorios) {
    ambientes.push(
      `${numero(datos.dormitorios)} ${datos.dormitorios === 1 ? 'dormitorio' : 'dormitorios'}`,
    );
  }
  if (datos.banos) {
    ambientes.push(`${numero(datos.banos)} ${datos.banos === 1 ? 'baño' : 'baños'}`);
  }
  if (datos.cocheras) {
    ambientes.push(
      `${numero(datos.cocheras)} ${datos.cocheras === 1 ? 'cochera' : 'cocheras'}`,
    );
  }
  if (ambientes.length > 0) frases.push(`${ambientes.join(', ')}.`);

  const precio = dinero(datos.precio, datos.moneda);
  frases.push(
    datos.operacion === 'rent' ? `Alquiler: ${precio} mensuales.` : `Precio: ${precio}.`,
  );

  frases.push('Escríbenos por Wasipe para coordinar una visita.');

  return frases.join(' ');
}

/**
 * Arma el guion completo.
 *
 * Es determinista: los mismos datos dan el mismo guion, y por eso la
 * vista previa que ve la persona ANTES de gastar un crédito es
 * exactamente lo que se va a renderizar.
 */
export function armarGuion(
  datos: DatosDelVideo,
  opciones: {
    formato: ClaveDeFormato;
    plantilla: ClaveDePlantilla;
    narracion?: boolean;
    subtitulos?: boolean;
  },
): Guion {
  const plantilla = PLANTILLAS[opciones.plantilla];
  const fotos = datos.fotos.slice(0, plantilla.fotosMaximas);

  const precio = dinero(datos.precio, datos.moneda);
  const ficha = fichaCorta(datos);

  const escenas: Escena[] = fotos.map((foto, i) => ({
    tipo: 'foto',
    url: foto.url,
    segundos: plantilla.segundosPorFoto,
    movimiento: plantilla.movimiento,
    // Alterna acercar y alejar para que no se sienta repetido, siempre
    // dentro del mismo tope.
    escala: plantilla.movimiento === 'fijo' ? 1 : ACERCAMIENTO_MAXIMO,
    texto:
      i === 0
        ? [datos.titulo, `${OPERACION[datos.operacion]} en ${datos.distrito}`]
        : i === 1
          ? [precio, ficha]
          : [],
    etiquetaIA: foto.etiqueta,
  }));

  const llamada = datos.contacto.whatsapp ? 'Escríbenos por WhatsApp' : 'Contáctanos en Wasipe';

  escenas.push({
    tipo: 'cierre',
    segundos: 3,
    texto: [precio, `${datos.distrito} · ${ficha}`],
    marca: datos.inmobiliaria?.nombre ?? 'Wasipe',
    llamada,
  });

  const subtitulos = escenas.map((escena) =>
    escena.tipo === 'cierre' ? escena.llamada : escena.texto.join(' — '),
  );

  return {
    formato: opciones.formato,
    plantilla: opciones.plantilla,
    escenas,
    narracion:
      (opciones.narracion ?? plantilla.narracionPorDefecto) ? armarNarracion(datos) : '',
    subtitulos: (opciones.subtitulos ?? true) ? subtitulos : [],
    musica: plantilla.musica,
    segundosTotales: escenas.reduce((suma, e) => suma + e.segundos, 0),
  };
}

// ---------------------------------------------------------------------
// Que el texto entre
// ---------------------------------------------------------------------

/** Tamaños de letra por formato, en píxeles. */
export const TIPOGRAFIA: Record<ClaveDeFormato, { titulo: number; apoyo: number }> = {
  vertical: { titulo: 72, apoyo: 44 },
  square: { titulo: 60, apoyo: 38 },
  horizontal: { titulo: 64, apoyo: 40 },
};

/**
 * Ancho aproximado de un texto.
 *
 * 0,52 del tamaño de letra por carácter es la media de una tipografía
 * sans en castellano. No es exacta, y no hace falta que lo sea: se usa
 * para decidir si un texto hay que partirlo o achicarlo, con margen.
 */
export function anchoAproximado(texto: string, tamano: number): number {
  return texto.length * tamano * 0.52;
}

/** Cuántas líneas ocupa un texto dentro del ancho seguro. */
export function lineasNecesarias(texto: string, tamano: number, clave: ClaveDeFormato): number {
  const disponible = areaSegura(clave).ancho;
  return Math.max(1, Math.ceil(anchoAproximado(texto, tamano) / disponible));
}

/**
 * ¿Entra todo el texto de una escena en la zona segura?
 *
 * Es lo que se comprueba en las pruebas para los tres formatos: un video
 * con el precio cortado por el borde no sirve, y en vertical el borde
 * efectivo no es el del video sino el de la interfaz de la red social.
 */
export function textoEntraEnZonaSegura(escena: Escena, clave: ClaveDeFormato): boolean {
  const zona = areaSegura(clave);
  const tipos = TIPOGRAFIA[clave];
  const lineas = escena.texto.length > 0 ? escena.texto : [];

  let alto = 0;
  for (const [i, linea] of lineas.entries()) {
    const tamano = i === 0 ? tipos.titulo : tipos.apoyo;
    // Hasta tres líneas por bloque; más que eso ya no se lee en 3 segundos.
    const usadas = lineasNecesarias(linea, tamano, clave);
    if (usadas > 3) return false;
    alto += usadas * tamano * 1.25;
  }

  if (escena.tipo === 'cierre') {
    alto += tipos.apoyo * 1.25 * 2; // marca y llamada a la acción
  }

  return alto <= zona.alto;
}

/** Recorta un texto para que quepa en dos líneas del formato. */
export function recortarParaFormato(
  texto: string,
  tamano: number,
  clave: ClaveDeFormato,
  lineas = 2,
): string {
  const cabe = Math.floor((areaSegura(clave).ancho * lineas) / (tamano * 0.52));
  return texto.length <= cabe ? texto : `${texto.slice(0, Math.max(cabe - 1, 1)).trimEnd()}…`;
}

// ---------------------------------------------------------------------
// Huella y rutas
// ---------------------------------------------------------------------

export function huellaDeVideo(
  propiedadId: string,
  formato: ClaveDeFormato,
  plantilla: ClaveDePlantilla,
  narracion: boolean,
): string {
  return `video:${propiedadId}:${formato}:${plantilla}:${narracion ? 'voz' : 'mudo'}`;
}

/** Ruta dentro de la cubeta privada `videos`. */
export function rutaDeVideo(carpeta: string, marca: number, extension = 'mp4'): string {
  return `${carpeta}/${marca}.${extension}`;
}

/** Aviso que acompaña a toda vista previa. */
export const AVISO_DE_VIDEO =
  'El video usa solo los datos y las fotos de tu aviso. La cámara no recorre el inmueble: cada foto se muestra por separado, porque un recorrido continuo daría a entender una distribución que nadie verificó.';

/** Etiqueta de transparencia del video. */
export const ETIQUETA_VIDEO = 'Video generado con Wasi AI';
