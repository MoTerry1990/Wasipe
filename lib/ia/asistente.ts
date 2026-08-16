import { OPERACION, TIPO_INMUEBLE, AMOBLADO, nombreDeCaracteristica } from '@/lib/etiquetas';
import { TIPO_DESDE_SLUG } from '@/lib/catalogo';
import type { BorradorDeAviso } from '@/lib/validacion/aviso';
import type { PeticionDeTexto } from '@/lib/ia/proveedor';

/**
 * El asistente de redacción de avisos.
 *
 * Acá vive todo lo que Wasi AI le pide al modelo y todo lo que Wasipe
 * hace con lo que el modelo devuelve. Está aparte del proveedor a
 * propósito: las reglas del producto no cambian si mañana se cambia de
 * empresa de IA.
 *
 * La regla más importante no es de estilo, es de responsabilidad: el
 * asistente redacta con lo que la persona escribió y NADA MÁS. No
 * deduce, no completa, no adorna con datos que nadie le dio.
 */

export const OPERACIONES = {
  titulo: {
    etiqueta: 'Proponer títulos',
    descripcion: 'Tres títulos con lo que ya cargaste.',
    costo: 0,
    maximoTokens: 700,
  },
  descripcion: {
    etiqueta: 'Escribir la descripción',
    descripcion: 'Un borrador de descripción con los datos del aviso.',
    costo: 0,
    maximoTokens: 1600,
  },
  mejorar: {
    etiqueta: 'Mejorar mi descripción',
    descripcion: 'Ordena y corrige lo que ya escribiste, sin agregar nada.',
    costo: 0,
    maximoTokens: 1600,
  },
} as const;

export type OperacionDeAsistente = keyof typeof OPERACIONES;

export function esOperacion(valor: string): valor is OperacionDeAsistente {
  return Object.prototype.hasOwnProperty.call(OPERACIONES, valor);
}

/** Tope de pedidos por hora y por persona. */
export const LIMITE_POR_HORA = 20;

/**
 * Aviso que acompaña a todo texto propuesto por Wasi AI.
 *
 * Va pegado al texto en la pantalla, antes de que la persona decida.
 * No es letra chica: es el punto del producto.
 */
export const AVISO_REVISION =
  'Texto propuesto por Wasi AI a partir de lo que cargaste. Revísalo y corrígelo antes de usarlo: nada se publica sin tu confirmación.';

/** Etiqueta corta para marcar de dónde salió un texto. */
export const ETIQUETA_TEXTO_IA = 'Redactado con Wasi AI';

// ---------------------------------------------------------------------
// Lo que el modelo tiene prohibido inventar
// ---------------------------------------------------------------------

/**
 * Estas seis prohibiciones no son de tono: son de responsabilidad legal
 * y de seguridad. Un texto que afirme que el inmueble «está saneado» o
 * «tiene licencia de construcción» expone a quien publica y engaña a
 * quien compra. Si el dato no vino del formulario, no existe.
 */
const PROHIBIDO = [
  'Titularidad legal: nunca digas que la propiedad está saneada, tiene título inscrito, partida registral en orden, libre de gravámenes ni nada parecido.',
  'Estado estructural: no afirmes que la construcción está en buen estado, sin humedad, sin rajaduras ni que fue reforzada.',
  'Medidas exactas: usa solo las áreas y cantidades que te dieron. No estimes metros, ni de ambientes, ni de terreno, ni conviertas unidades.',
  'Seguridad: no digas que la zona es segura, tranquila ni de baja delincuencia.',
  'Licencias y permisos: no menciones licencia de construcción, conformidad de obra, declaratoria de fábrica ni permisos municipales.',
  'Comodidades no declaradas: no agregues ascensor, piscina, cochera, portería ni ninguna característica que no esté en la lista que te paso.',
];

const SISTEMA = `Eres el asistente de redacción de Wasipe, un portal inmobiliario del Perú.

Escribes en español peruano, para gente que busca casa o departamento en el Perú. Usa el vocabulario de acá: "departamento" y no "apartamento", "cochera" y no "garaje", "distrito" y no "barrio", "corredor inmobiliario" y no "agente".

REGLA PRINCIPAL: trabajas ÚNICAMENTE con los datos que te paso. No deduces, no completas, no adornas. Si un dato no está, no aparece en el texto. No pidas los datos que faltan: escribe con lo que hay.

Nunca afirmes nada de esto:
${PROHIBIDO.map((linea) => `- ${linea}`).join('\n')}

Formato: texto plano, sin markdown, sin viñetas, sin comillas alrededor, sin encabezados y sin emojis. No expliques lo que hiciste ni ofrezcas alternativas: devuelve solo el texto pedido.

Precios en soles se escriben "S/ 450,000" y en dólares "US$ 120,000". Áreas en "m²".`;

// ---------------------------------------------------------------------
// Los datos del aviso, en palabras
// ---------------------------------------------------------------------

/**
 * Resume el borrador para el modelo.
 *
 * Se manda solo lo que sirve para redactar. La dirección exacta, el
 * celular y el correo NO se mandan nunca: no aportan al texto y son
 * datos personales (Ley 29733). El distrito sí, porque es lo que la
 * gente busca.
 */
export function datosParaElModelo(datos: BorradorDeAviso): string {
  const lineas: string[] = [];
  const agregar = (etiqueta: string, valor: string | number | undefined | null) => {
    if (valor === undefined || valor === null || valor === '') return;
    lineas.push(`${etiqueta}: ${valor}`);
  };

  if (datos.operacion) agregar('Operación', OPERACION[datos.operacion]);
  const tipo = datos.tipo ? TIPO_DESDE_SLUG[datos.tipo] : undefined;
  if (tipo) agregar('Tipo de inmueble', TIPO_INMUEBLE[tipo]);

  agregar('Distrito', datos.distrito);
  agregar('Provincia', datos.provincia);
  agregar('Departamento', datos.departamento);
  agregar('Urbanización', datos.urbanizacion);

  if (datos.precio && datos.moneda) {
    const simbolo = datos.moneda === 'USD' ? 'US$' : 'S/';
    agregar('Precio', `${simbolo} ${datos.precio.toLocaleString('es-PE')}`);
  }
  if (datos.mantenimiento) {
    agregar('Mantenimiento mensual', `S/ ${datos.mantenimiento.toLocaleString('es-PE')}`);
  }

  agregar('Área total', datos.areaTotal ? `${datos.areaTotal} m²` : undefined);
  agregar('Área techada', datos.areaTechada ? `${datos.areaTechada} m²` : undefined);
  agregar('Dormitorios', datos.dormitorios);
  agregar('Baños', datos.banos);
  agregar('Cocheras', datos.cocheras);
  agregar('Antigüedad', datos.antiguedad ? `${datos.antiguedad} años` : undefined);
  if (datos.amoblado) agregar('Amoblado', AMOBLADO[datos.amoblado]);

  const caracteristicas = (datos.caracteristicas ?? []).map(nombreDeCaracteristica);
  if (caracteristicas.length > 0) {
    agregar('Características declaradas', caracteristicas.join(', '));
  }

  return lineas.length > 0 ? lineas.join('\n') : 'Todavía no cargó ningún dato.';
}

/** Cuántos datos hay. Debajo de esto el asistente no se ofrece. */
export function datosSuficientes(datos: BorradorDeAviso): boolean {
  return Boolean(datos.operacion && datos.tipo && datos.distrito && datos.areaTotal);
}

// ---------------------------------------------------------------------
// Las peticiones
// ---------------------------------------------------------------------

export function armarPeticion(
  operacion: OperacionDeAsistente,
  datos: BorradorDeAviso,
): PeticionDeTexto {
  const ficha = datosParaElModelo(datos);
  const config = OPERACIONES[operacion];

  const instrucciones: Record<OperacionDeAsistente, string> = {
    titulo: `Propón 3 títulos distintos para este aviso.

Cada título en su propia línea, sin numerar, sin viñetas. Entre 40 y 110 caracteres cada uno. Di qué es, cuánto mide y en qué distrito queda. Nada de "¡Oportunidad única!" ni signos de admiración.

Datos del aviso:
${ficha}`,

    descripcion: `Escribe la descripción de este aviso.

Entre 500 y 1200 caracteres, en 2 o 3 párrafos separados por una línea en blanco. El primero dice qué es y dónde queda; el segundo, cómo está distribuido; el tercero, si hay características declaradas, las menciona. Termina sin llamada a la acción: el aviso ya tiene su botón.

Datos del aviso:
${ficha}`,

    mejorar: `Corrige y ordena esta descripción sin agregar información nueva.

Arregla ortografía, tildes y puntuación. Separa en párrafos. Quita mayúsculas sostenidas, repeticiones y signos de admiración. Si el texto original afirma algo de los seis puntos prohibidos, quítalo. No inventes nada que no esté ya escrito o en los datos del aviso. Conserva el largo aproximado.

Descripción actual:
"""
${datos.descripcion ?? ''}
"""

Datos del aviso, para no contradecirlos:
${ficha}`,
  };

  return {
    sistema: SISTEMA,
    mensajes: [{ rol: 'usuario', texto: instrucciones[operacion] }],
    maximoTokens: config.maximoTokens,
  };
}

// ---------------------------------------------------------------------
// Lo que vuelve
// ---------------------------------------------------------------------

/** Quita lo que el modelo no debía poner: markdown, comillas, viñetas. */
export function limpiar(texto: string): string {
  return texto
    .replace(/^```[a-z]*\n?/gim, '')
    .replace(/```$/gm, '')
    .replace(/^\s*[-*·•]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^["“](.*)["”]$/gm, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export type Sugerencia =
  { tipo: 'titulos'; opciones: string[] } | { tipo: 'texto'; texto: string };

/**
 * Convierte la respuesta cruda en algo que la pantalla pueda mostrar.
 *
 * Los topes de largo son los mismos del formulario (120 y 6000): si el
 * modelo se pasa, se recorta acá y no en un error de validación después
 * de que la persona ya aceptó el texto.
 */
export function interpretar(operacion: OperacionDeAsistente, crudo: string): Sugerencia {
  const limpio = limpiar(crudo);

  if (operacion === 'titulo') {
    const opciones = limpio
      .split('\n')
      .map((linea) => limpiar(linea).slice(0, 120).trim())
      .filter((linea) => linea.length >= 10)
      .slice(0, 3);
    return { tipo: 'titulos', opciones };
  }

  return { tipo: 'texto', texto: limpio.slice(0, 6000) };
}

/** ¿Sirve para mostrarla? Una respuesta vacía es una falla, no un resultado. */
export function sugerenciaUtil(sugerencia: Sugerencia): boolean {
  return sugerencia.tipo === 'titulos'
    ? sugerencia.opciones.length > 0
    : sugerencia.texto.length >= 40;
}

/**
 * Huella del pedido, para no cobrar ni pedir dos veces lo mismo.
 *
 * Con los mismos datos y la misma operación sale la misma clave, así que
 * el segundo clic devuelve el trabajo del primero. Cambiar un dato del
 * aviso cambia la huella: eso sí es un pedido nuevo.
 */
export function huellaDelPedido(
  operacion: OperacionDeAsistente,
  datos: BorradorDeAviso,
): string {
  const material = `${operacion} ${datosParaElModelo(datos)} ${
    operacion === 'mejorar' ? (datos.descripcion ?? '') : ''
  }`;

  // FNV-1a de 32 bits, la misma que usa el desplazamiento del mapa. No
  // es criptográfica y no hace falta que lo sea: no protege nada, solo
  // agrupa pedidos idénticos.
  let hash = 0x811c9dc5;
  for (let i = 0; i < material.length; i++) {
    hash ^= material.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${operacion}-${material.length}-${hash.toString(16)}`;
}
