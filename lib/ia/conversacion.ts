import { UBICACIONES, normalizar } from '@/config/ubicaciones';
import { TIPO_DESDE_SLUG, SLUG_DESDE_TIPO } from '@/lib/catalogo';
import { leerFiltros, type Filtros } from '@/lib/busqueda/filtros';
import { TIPO_INMUEBLE } from '@/lib/etiquetas';
import { dinero, metros } from '@/lib/formato';
import type { Operacion, TipoInmueble } from '@/types/base-datos';
import type { PeticionDeTexto } from '@/lib/ia/proveedor';

/**
 * Búsqueda conversacional.
 *
 * La regla que ordena todo este archivo: **la IA no devuelve avisos**.
 * Traduce una frase en castellano a filtros, y esos filtros los consulta
 * Postgres como cualquier otra búsqueda. Un modelo que redacta
 * resultados inventa direcciones y precios; uno que solo arma un WHERE
 * no puede.
 *
 * Y como la traducción puede salir mal, la persona ve SIEMPRE lo que se
 * entendió, y lo puede corregir antes o después de ver resultados.
 */

// ---------------------------------------------------------------------
// Lo que no se busca
// ---------------------------------------------------------------------

/**
 * Vivienda y discriminación.
 *
 * Un portal inmobiliario que deja filtrar por nacionalidad, religión o
 * si hay niños en la casa no está dando una función: está organizando
 * una exclusión. En el Perú eso choca con el artículo 2.2 de la
 * Constitución, con la Ley 28983 de igualdad de oportunidades y con la
 * Ley 29973 sobre discapacidad.
 *
 * Wasipe no traduce esas frases a filtros ni las menciona en una
 * recomendación. Tampoco se hace el desentendido: se le dice a la
 * persona qué parte de su pedido no se puede usar, y la búsqueda sigue
 * con el resto.
 */
export const CATEGORIAS_PROTEGIDAS = [
  {
    clave: 'origen',
    patron:
      /\b(peruano|peruana|extranjer\w*|venezolan\w*|colombian\w*|chilen\w*|chin\w*|gringo\w*|serran\w*|provincian\w*|nacionalidad|raza|blanc[oa]s?|negr[oa]s?|cholo\w*|indígen\w*)\b/i,
    aviso: 'la nacionalidad, el origen o la raza de quien vive ahí',
  },
  {
    clave: 'religion',
    patron: /\b(católic\w*|cristian\w*|evangélic\w*|judí\w*|musulm\w*|religi\w*)\b/i,
    aviso: 'la religión',
  },
  {
    clave: 'familia',
    patron:
      /\b(sin\s+ni[ñn]os|no\s+ni[ñn]os|sin\s+hijos|sin\s+familia|solo\s+parejas|solo\s+solter\w*|sin\s+beb[eé]s)\b/i,
    aviso: 'si hay niños o cómo está formada la familia',
  },
  {
    clave: 'discapacidad',
    patron: /\b(sin\s+discapacidad|no\s+discapacitad\w*|sin\s+silla\s+de\s+ruedas)\b/i,
    aviso: 'la discapacidad',
  },
  {
    clave: 'sexo',
    patron:
      /\b(solo\s+(a\s+)?(hombres|mujeres|var[oó]n\w*|damas)|no\s+(hombres|mujeres)|heterosexual\w*|homosexual\w*|orientaci[oó]n\s+sexual)\b/i,
    aviso: 'el sexo o la orientación sexual',
  },
  {
    clave: 'edad',
    patron:
      /\b(sin\s+ancian\w*|no\s+adultos\s+mayores|solo\s+j[oó]venes|menores\s+de\s+\d+\s+a[ñn]os)\b/i,
    aviso: 'la edad de quien vive ahí',
  },
] as const;

export type Objecion = { clave: string; aviso: string };

/**
 * Revisa la frase antes de traducirla.
 *
 * Devuelve las objeciones encontradas. Ninguna detiene la búsqueda: se
 * ignora esa parte, se explica por qué y el resto del pedido se traduce
 * igual. Cortar la búsqueda entera castigaría a quien escribió una
 * palabra sin mala intención.
 */
export function revisarConsulta(texto: string): Objecion[] {
  return CATEGORIAS_PROTEGIDAS.filter((c) => c.patron.test(texto)).map((c) => ({
    clave: c.clave,
    aviso: c.aviso,
  }));
}

export function mensajeDeObjeciones(objeciones: readonly Objecion[]): string {
  if (objeciones.length === 0) return '';
  const lista = objeciones.map((o) => o.aviso).join('; ');
  return `Wasipe no filtra avisos por ${lista}. Buscamos con el resto de lo que pediste.`;
}

// ---------------------------------------------------------------------
// El intérprete que no necesita IA
// ---------------------------------------------------------------------

/** Palabras que en el Perú significan «hasta este precio». */
const TOPE = /\b(hasta|m[aá]ximo|menos\s+de|no\s+m[aá]s\s+de|tope|presupuesto\s+de)\b/i;
const PISO = /\b(desde|m[ií]nimo|m[aá]s\s+de|a\s+partir\s+de)\b/i;

const NUMEROS: Record<string, number> = {
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
};

/** «dos» → 2 · «3» → 3 · cualquier otra cosa → undefined */
function aNumero(bruto: string | undefined): number | undefined {
  if (!bruto) return undefined;
  const limpio = normalizar(bruto);
  if (NUMEROS[limpio] !== undefined) return NUMEROS[limpio];
  const n = Number(limpio.replace(/[^\d]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Lee un monto escrito como se escribe en el Perú.
 *
 * «US$ 150,000» · «150 mil dólares» · «S/ 2,500» · «150k». La coma es
 * separador de miles acá, no decimal: 150,000 son ciento cincuenta mil.
 */
export function leerMonto(texto: string): { monto: number; moneda: 'USD' | 'PEN' } | null {
  const t = texto.toLowerCase();

  const patron =
    /(us\$|usd|d[oó]lares?|s\/|soles?)?\s*([\d.,]+)\s*(millones?|mil|k|m)?\s*(us\$|usd|d[oó]lares?|s\/|soles?)?/gi;

  for (const coincidencia of t.matchAll(patron)) {
    const [, monedaAntes, cifra, escala, monedaDespues] = coincidencia;
    if (!cifra) continue;

    // Con escala («1.2 millones») el separador es decimal; sin ella
    // («150,000») es separador de miles, que es como se escribe acá.
    const crudo = escala ? Number(cifra.replace(',', '.')) : Number(cifra.replace(/[.,]/g, ''));
    if (!Number.isFinite(crudo) || crudo <= 0) continue;

    const factor = escala ? (/mill/.test(escala) ? 1_000_000 : 1_000) : 1;

    const monto = crudo * factor;
    // Un «2» suelto no es un precio: es la cantidad de dormitorios.
    if (monto < 1_000) continue;

    const marca = `${monedaAntes ?? ''}${monedaDespues ?? ''}`.toLowerCase();
    const moneda = /s\/|sol/.test(marca) ? 'PEN' : 'USD';
    return { monto, moneda };
  }

  return null;
}

/**
 * Traduce la frase a filtros sin llamar a ningún modelo.
 *
 * Es el camino por defecto, no el plan B: cubre lo que la gente
 * realmente escribe —distrito, precio tope, dormitorios, cochera,
 * mascotas— y funciona sin proveedor, sin latencia y sin costo. La IA se
 * suma encima para lo que este parser no alcanza.
 */
export function interpretarLocal(texto: string, operacion: Operacion): Partial<Filtros> {
  const t = ` ${texto.toLowerCase()} `;
  const filtros: Partial<Filtros> = {};

  // --- Tipo de inmueble ---------------------------------------------
  const tipos: [RegExp, TipoInmueble][] = [
    [/\b(departamento|depa|dpto|flat)\w*\b/, 'apartment'],
    [/\bcasas?\b/, 'house'],
    [/\b(terreno|lote)s?\b/, 'land'],
    [/\boficinas?\b/, 'office'],
    [/\b(local|locales)\s+comercial\w*\b/, 'commercial'],
    [/\b(almac[eé]n|dep[oó]sito)\w*\b/, 'warehouse'],
    [/\b(habitaci[oó]n|cuarto)\w*\b/, 'room'],
    [/\bcasas?\s+de\s+campo\b/, 'country_house'],
    [/\b(cochera|estacionamiento)\s+en\s+venta\b/, 'garage'],
  ];
  for (const [patron, tipo] of tipos) {
    if (patron.test(t)) {
      filtros.tipo = tipo;
      break;
    }
  }

  // --- Distrito ------------------------------------------------------
  // Se busca el nombre completo, no palabra por palabra: «Jesús María»
  // y «San Isidro» se perderían partidos en dos.
  const normalizado = normalizar(texto);
  let mejor: { nombre: string; largo: number } | null = null;
  for (const ubicacion of UBICACIONES) {
    const clave = normalizar(ubicacion.nombre);
    if (clave.length < 4) continue;
    if (!normalizado.includes(clave)) continue;
    // Gana el nombre más largo: «San Isidro» le gana a «Lima» cuando la
    // frase dice las dos cosas, que es lo que la persona quiso decir.
    if (!mejor || clave.length > mejor.largo) {
      mejor = { nombre: ubicacion.nombre, largo: clave.length };
    }
  }
  if (mejor) filtros.distrito = mejor.nombre;

  // --- Precio --------------------------------------------------------
  const monto = leerMonto(texto);
  if (monto) {
    filtros.moneda = monto.moneda;
    // Sin ninguna palabra que indique piso, un monto suelto se lee como
    // tope: «departamento de 150 mil» es lo máximo que se quiere gastar.
    if (PISO.test(t) && !TOPE.test(t)) filtros.precioMin = monto.monto;
    else filtros.precioMax = monto.monto;
  }

  // --- Ambientes -----------------------------------------------------
  const dorm = t.match(
    /\b(\d+|un|una|dos|tres|cuatro|cinco|seis)\s*(dormitorios?|dorm|cuartos?|habitaciones?)\b/,
  );
  if (dorm) filtros.dorm = aNumero(dorm[1]);

  const banos = t.match(/\b(\d+|un|una|dos|tres|cuatro|cinco)\s*(ba[ñn]os?|servicios?\s+higi)/);
  if (banos) filtros.banos = aNumero(banos[1]);

  const cocheras = t.match(
    /\b(\d+|un|una|dos|tres)\s*(cocheras?|estacionamientos?|garajes?)\b/,
  );
  if (cocheras) filtros.cocheras = aNumero(cocheras[1]);
  else if (/\b(con\s+)?(cochera|estacionamiento|garaje)s?\b/.test(t)) filtros.cocheras = 1;

  // --- Área ----------------------------------------------------------
  const area = t.match(/\b(\d{2,5})\s*(m2|m²|metros?\s*(cuadrados?)?)\b/);
  if (area) {
    const metrosCuadrados = Number(area[1]);
    if (Number.isFinite(metrosCuadrados)) {
      if (TOPE.test(t)) filtros.areaMax = metrosCuadrados;
      else filtros.areaMin = metrosCuadrados;
    }
  }

  // --- Condiciones ---------------------------------------------------
  if (
    /\b(acept\w*|admit\w*|permit\w*|con)\s+mascotas?\b/.test(t) ||
    /\bpet\s*friendly\b/.test(t)
  ) {
    filtros.mascotas = true;
  }
  if (/\bamoblad\w*\b/.test(t)) filtros.amoblado = 'full';
  if (/\bverificad\w*\b/.test(t)) filtros.verificados = true;
  if (/\b(estren\w*|nuevo|nueva|reci[eé]n\s+construid\w*)\b/.test(t)) filtros.nuevos = true;
  if (/\b(rebajad\w*|baj[oó]\s+de\s+precio|oferta)\b/.test(t)) filtros.rebajados = true;

  const antiguedad = t.match(/\b(menos|no\s+m[aá]s)\s+de\s+(\d+)\s+a[ñn]os\b/);
  if (antiguedad?.[2]) filtros.antiguedadMax = Number(antiguedad[2]);

  return { ...filtros, operacion };
}

// ---------------------------------------------------------------------
// La misma puerta de validación que la URL
// ---------------------------------------------------------------------

/**
 * Valida lo que sea que haya salido —del parser local o del modelo—
 * pasándolo por el MISMO esquema que valida la URL.
 *
 * Es la pieza que hace segura toda la función: venga de donde venga, un
 * `distrito` de mil caracteres, un `precioMax` negativo o un `tipo`
 * inventado se caen solos y el resto de los filtros sobrevive. La IA no
 * tiene una puerta propia más ancha que la de un enlace pegado a mano.
 */
export function validarFiltros(crudo: Record<string, unknown>, operacion: Operacion): Filtros {
  const params: Record<string, string> = {};

  for (const [clave, valor] of Object.entries(crudo)) {
    if (valor === undefined || valor === null || valor === '') continue;
    if (clave === 'operacion') continue;
    if (clave === 'tipo') {
      const tipo = String(valor);
      // Se acepta tanto el valor de la base ('apartment') como el slug.
      params.tipo = SLUG_DESDE_TIPO[tipo as TipoInmueble] ?? tipo;
      continue;
    }
    params[clave] = valor === true ? '1' : String(valor);
  }

  return leerFiltros(operacion, params);
}

// ---------------------------------------------------------------------
// Lo que se le muestra a la persona
// ---------------------------------------------------------------------

export type Chip = { clave: keyof Filtros; etiqueta: string; valor: string };

/**
 * Los filtros entendidos, en castellano.
 *
 * Se muestran SIEMPRE, junto a los resultados, y cada uno se puede
 * quitar. Que la persona vea «Distrito: Jesús María · Hasta US$ 150,000»
 * es lo que convierte una caja de texto mágica en una herramienta: si
 * entendimos mal, se ve de inmediato y se corrige en un clic.
 */
export function explicarFiltros(filtros: Filtros): Chip[] {
  const chips: Chip[] = [];
  const moneda = filtros.moneda === 'PEN' ? 'PEN' : 'USD';

  const agregar = (clave: keyof Filtros, etiqueta: string, valor: string | undefined) => {
    if (valor) chips.push({ clave, etiqueta, valor });
  };

  agregar('distrito', 'Distrito', filtros.distrito);
  agregar('provincia', 'Provincia', filtros.provincia);
  agregar(
    'tipo',
    'Tipo',
    filtros.tipo ? TIPO_INMUEBLE[filtros.tipo as TipoInmueble] : undefined,
  );
  agregar(
    'precioMax',
    'Hasta',
    filtros.precioMax !== undefined ? dinero(filtros.precioMax, moneda) : undefined,
  );
  agregar(
    'precioMin',
    'Desde',
    filtros.precioMin !== undefined ? dinero(filtros.precioMin, moneda) : undefined,
  );
  agregar(
    'dorm',
    'Dormitorios',
    filtros.dorm !== undefined ? `${filtros.dorm} o más` : undefined,
  );
  agregar('banos', 'Baños', filtros.banos !== undefined ? `${filtros.banos} o más` : undefined);
  agregar(
    'cocheras',
    'Cocheras',
    filtros.cocheras !== undefined ? `${filtros.cocheras} o más` : undefined,
  );
  agregar(
    'areaMin',
    'Área desde',
    filtros.areaMin !== undefined ? metros(filtros.areaMin) : undefined,
  );
  agregar(
    'areaMax',
    'Área hasta',
    filtros.areaMax !== undefined ? metros(filtros.areaMax) : undefined,
  );
  agregar(
    'antiguedadMax',
    'Antigüedad',
    filtros.antiguedadMax !== undefined ? `hasta ${filtros.antiguedadMax} años` : undefined,
  );
  agregar('mascotas', 'Mascotas', filtros.mascotas ? 'Acepta' : undefined);
  agregar('amoblado', 'Amoblado', filtros.amoblado === 'full' ? 'Sí' : undefined);
  agregar('verificados', 'Solo', filtros.verificados ? 'verificados' : undefined);
  agregar('nuevos', 'Solo', filtros.nuevos ? 'de estreno' : undefined);
  agregar('rebajados', 'Solo', filtros.rebajados ? 'rebajados' : undefined);

  return chips;
}

// ---------------------------------------------------------------------
// Cuando sí hay modelo
// ---------------------------------------------------------------------

const CAMPOS_PERMITIDOS = [
  'distrito',
  'provincia',
  'tipo',
  'moneda',
  'precioMin',
  'precioMax',
  'dorm',
  'banos',
  'cocheras',
  'areaMin',
  'areaMax',
  'antiguedadMax',
  'amoblado',
  'mascotas',
  'verificados',
  'nuevos',
  'rebajados',
] as const;

const SISTEMA = `Conviertes pedidos de vivienda escritos en español peruano en filtros de búsqueda de Wasipe, un portal inmobiliario del Perú.

Devuelves ÚNICAMENTE un objeto JSON, sin explicación, sin markdown y sin texto alrededor. Las claves permitidas son exactamente estas y ninguna más:

${CAMPOS_PERMITIDOS.join(', ')}

Reglas:
- Omite cualquier clave para la que el pedido no diga nada. No inventes valores ni pongas rangos "razonables" por tu cuenta.
- "distrito" es un nombre de distrito del Perú, tal cual: "Jesús María", "Magdalena del Mar", "San Isidro".
- "tipo" es uno de: departamento, casa, terreno, oficina, local-comercial, almacen, habitacion, casa-de-campo, cochera, edificio.
- "moneda" es "USD" o "PEN". En el Perú los departamentos se cotizan en dólares salvo que diga soles.
- "precioMax" es el tope. "hasta", "máximo", "menos de" y "presupuesto de" son tope.
- "dorm", "banos" y "cocheras" son cantidades mínimas.
- "mascotas", "verificados", "nuevos" y "rebajados" son true o se omiten.
- Si el pedido menciona VARIOS distritos, elige el primero: la búsqueda por varios distritos se arma después.

NUNCA traduzcas a un filtro nada que tenga que ver con la nacionalidad, el origen, la raza, la religión, el sexo, la orientación sexual, la edad, la discapacidad o si hay niños en la familia. No existen claves para eso y no hay que inventarlas: se ignora esa parte del pedido y se traduce el resto.

Ejemplo:
Pedido: "Busco un departamento en Jesús María o Magdalena, máximo US$150,000, con dos dormitorios, estacionamiento y que acepte mascotas."
Respuesta: {"tipo":"departamento","distrito":"Jesús María","moneda":"USD","precioMax":150000,"dorm":2,"cocheras":1,"mascotas":true}`;

export function armarPeticionDeBusqueda(texto: string): PeticionDeTexto {
  return {
    sistema: SISTEMA,
    mensajes: [{ rol: 'usuario', texto: `Pedido: "${texto}"\nRespuesta:` }],
    maximoTokens: 500,
  };
}

/**
 * Lee el JSON del modelo y se queda solo con las claves conocidas.
 *
 * Todo lo que no esté en la lista blanca se descarta sin preguntar:
 * `{"borrar": true}` o `{"ownerEmail": "..."}` no llegan a ninguna parte.
 */
export function leerRespuestaDelModelo(crudo: string): Record<string, unknown> {
  const inicio = crudo.indexOf('{');
  const fin = crudo.lastIndexOf('}');
  if (inicio < 0 || fin <= inicio) return {};

  let objeto: unknown;
  try {
    objeto = JSON.parse(crudo.slice(inicio, fin + 1));
  } catch {
    return {};
  }
  if (!objeto || typeof objeto !== 'object' || Array.isArray(objeto)) return {};

  const limpio: Record<string, unknown> = {};
  for (const campo of CAMPOS_PERMITIDOS) {
    const valor = (objeto as Record<string, unknown>)[campo];
    if (valor !== undefined && valor !== null) limpio[campo] = valor;
  }
  return limpio;
}

/**
 * Junta lo del parser local con lo del modelo.
 *
 * Manda el parser local: es determinista y no se equivoca en lo que ya
 * sabe leer. El modelo aporta solo lo que quedó vacío, y aun así pasa
 * después por `validarFiltros()`.
 */
export function combinar(
  local: Partial<Filtros>,
  delModelo: Record<string, unknown>,
): Record<string, unknown> {
  const salida: Record<string, unknown> = { ...delModelo };
  for (const [clave, valor] of Object.entries(local)) {
    if (valor !== undefined) salida[clave] = valor;
  }
  return salida;
}

/** Un tipo de la base a su slug, para escribirlo en la URL. */
export function slugDeTipo(tipo: TipoInmueble | undefined): string | undefined {
  return tipo ? SLUG_DESDE_TIPO[tipo] : undefined;
}

export { TIPO_DESDE_SLUG };
