/**
 * Catálogo de ubicaciones para el autocompletado.
 *
 * Es la base, no el final: son los distritos de Lima y las ciudades donde
 * hoy se publica de verdad. Cuando la base tenga volumen, esta lista se
 * reemplaza por una consulta con conteo de avisos por distrito, y el
 * componente de búsqueda no se entera del cambio.
 *
 * Los nombres van tal como se escriben en el Perú y no se traducen nunca.
 */

export type Ubicacion = {
  nombre: string;
  slug: string;
  provincia: string;
  departamento: string;
};

/** Arma una entrada de Lima Metropolitana sin repetir provincia y departamento. */
const lima = (nombre: string, slug: string): Ubicacion => ({
  nombre,
  slug,
  provincia: 'Lima',
  departamento: 'Lima',
});

export const UBICACIONES: readonly Ubicacion[] = [
  // Lima Metropolitana
  lima('Miraflores', 'miraflores'),
  lima('San Isidro', 'san-isidro'),
  lima('Barranco', 'barranco'),
  lima('Santiago de Surco', 'santiago-de-surco'),
  lima('San Borja', 'san-borja'),
  lima('La Molina', 'la-molina'),
  lima('Jesús María', 'jesus-maria'),
  lima('Magdalena del Mar', 'magdalena-del-mar'),
  lima('Pueblo Libre', 'pueblo-libre'),
  lima('San Miguel', 'san-miguel'),
  lima('Lince', 'lince'),
  lima('Surquillo', 'surquillo'),
  lima('Chorrillos', 'chorrillos'),
  lima('La Victoria', 'la-victoria'),
  lima('Breña', 'brena'),
  lima('Cercado de Lima', 'cercado-de-lima'),
  lima('Rímac', 'rimac'),
  lima('San Juan de Lurigancho', 'san-juan-de-lurigancho'),
  lima('San Juan de Miraflores', 'san-juan-de-miraflores'),
  lima('Los Olivos', 'los-olivos'),
  lima('San Martín de Porres', 'san-martin-de-porres'),
  lima('Comas', 'comas'),
  lima('Independencia', 'independencia'),
  lima('Ate', 'ate'),
  lima('Santa Anita', 'santa-anita'),
  lima('El Agustino', 'el-agustino'),
  lima('Villa El Salvador', 'villa-el-salvador'),
  lima('Villa María del Triunfo', 'villa-maria-del-triunfo'),
  lima('Cieneguilla', 'cieneguilla'),
  lima('Pachacámac', 'pachacamac'),
  lima('Lurín', 'lurin'),
  lima('Punta Hermosa', 'punta-hermosa'),
  lima('Asia', 'asia'),

  // Callao
  {
    nombre: 'Callao',
    slug: 'callao',
    provincia: 'Callao',
    departamento: 'Callao',
  },
  {
    nombre: 'La Punta',
    slug: 'la-punta',
    provincia: 'Callao',
    departamento: 'Callao',
  },
  {
    nombre: 'Ventanilla',
    slug: 'ventanilla',
    provincia: 'Callao',
    departamento: 'Callao',
  },

  // Provincias
  {
    nombre: 'Yanahuara',
    slug: 'yanahuara',
    provincia: 'Arequipa',
    departamento: 'Arequipa',
  },
  {
    nombre: 'Cayma',
    slug: 'cayma',
    provincia: 'Arequipa',
    departamento: 'Arequipa',
  },
  {
    nombre: 'Cercado de Arequipa',
    slug: 'cercado-de-arequipa',
    provincia: 'Arequipa',
    departamento: 'Arequipa',
  },
  {
    nombre: 'Trujillo',
    slug: 'trujillo',
    provincia: 'Trujillo',
    departamento: 'La Libertad',
  },
  {
    nombre: 'Víctor Larco Herrera',
    slug: 'victor-larco-herrera',
    provincia: 'Trujillo',
    departamento: 'La Libertad',
  },
  {
    nombre: 'Chiclayo',
    slug: 'chiclayo',
    provincia: 'Chiclayo',
    departamento: 'Lambayeque',
  },
  {
    nombre: 'Piura',
    slug: 'piura',
    provincia: 'Piura',
    departamento: 'Piura',
  },
  {
    nombre: 'Cusco',
    slug: 'cusco',
    provincia: 'Cusco',
    departamento: 'Cusco',
  },
  {
    nombre: 'San Sebastián',
    slug: 'san-sebastian',
    provincia: 'Cusco',
    departamento: 'Cusco',
  },
  {
    nombre: 'Huancayo',
    slug: 'huancayo',
    provincia: 'Huancayo',
    departamento: 'Junín',
  },
  {
    nombre: 'Tarapoto',
    slug: 'tarapoto',
    provincia: 'San Martín',
    departamento: 'San Martín',
  },
  {
    nombre: 'Iquitos',
    slug: 'iquitos',
    provincia: 'Maynas',
    departamento: 'Loreto',
  },
];

/**
 * Quita tildes y pasa a minúsculas.
 *
 * Es lo que permite que "brena", "Breña" y "BREÑA" encuentren lo mismo.
 * En el buscador nadie escribe las tildes.
 */
export function normalizar(texto: string): string {
  return (
    texto
      // NFD separa la letra de su tilde, y \p{Diacritic} borra la tilde.
      // Se usa la propiedad Unicode y no un rango de caracteres: el rango
      // se escribe con marcas combinantes que cualquier editor puede
      // pegar al carácter anterior y romper sin que se note.
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim()
  );
}

/**
 * Busca ubicaciones que empiecen o contengan lo escrito.
 *
 * Las que empiezan con el texto van primero: quien escribe "san" espera
 * "San Isidro" antes que "Cercado de Lima", aunque las dos contengan
 * esas letras.
 */
export function buscarUbicaciones(consulta: string, limite = 7): Ubicacion[] {
  const texto = normalizar(consulta);
  if (texto.length < 2) return [];

  const empiezan: Ubicacion[] = [];
  const contienen: Ubicacion[] = [];

  for (const ubicacion of UBICACIONES) {
    const nombre = normalizar(ubicacion.nombre);
    if (nombre.startsWith(texto)) empiezan.push(ubicacion);
    else if (nombre.includes(texto)) contienen.push(ubicacion);
  }

  return [...empiezan, ...contienen].slice(0, limite);
}

/** Encuentra una ubicación por su slug o por su nombre escrito a mano. */
export function ubicacionPorTexto(valor: string): Ubicacion | undefined {
  const texto = normalizar(valor);
  return UBICACIONES.find((u) => u.slug === texto || normalizar(u.nombre) === texto);
}
