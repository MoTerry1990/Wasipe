/**
 * Ubicaciones del Perú para sembrar la tabla `ubicaciones`.
 *
 * Formato: [departamento, provincia, distrito, slug, alias[], lat, lng, destacado]
 *
 * Sobre los datos:
 *  · `alias` es lo importante. Sin él, "Surco" no encuentra "Santiago de
 *    Surco" y la búsqueda se fragmenta. Incluye abreviaturas de uso real
 *    (SJL, SMP, VES) porque la gente las escribe así.
 *  · lat/lng son CENTROIDES APROXIMADOS, para centrar el mapa. No son
 *    datos catastrales.
 *  · `ubigeo` va vacío a propósito: los códigos oficiales del INEI hay que
 *    importarlos de la fuente, no escribirlos de memoria. Ver nota al pie.
 */

// --- Lima Metropolitana: los 43 distritos ---
const LIMA = [
  ['Ancón', 'ancon', [], -11.775, -77.176, false],
  ['Ate', 'ate', ['Ate Vitarte', 'Vitarte'], -12.026, -76.918, false],
  ['Barranco', 'barranco', [], -12.146, -77.021, true],
  ['Breña', 'brena', ['Brena'], -12.058, -77.050, false],
  ['Carabayllo', 'carabayllo', [], -11.897, -77.036, false],
  ['Chaclacayo', 'chaclacayo', [], -11.985, -76.767, false],
  ['Chorrillos', 'chorrillos', [], -12.176, -77.016, true],
  ['Cieneguilla', 'cieneguilla', [], -12.093, -76.809, false],
  ['Comas', 'comas', [], -11.945, -77.048, false],
  ['El Agustino', 'el-agustino', [], -12.041, -76.996, false],
  ['Independencia', 'independencia', [], -11.990, -77.055, false],
  ['Jesús María', 'jesus-maria', ['Jesus Maria'], -12.075, -77.049, true],
  ['La Molina', 'la-molina', [], -12.079, -76.943, true],
  ['La Victoria', 'la-victoria', [], -12.068, -77.017, false],
  ['Lima', 'lima-cercado', ['Cercado de Lima', 'Centro de Lima', 'Cercado'], -12.046, -77.031, false],
  ['Lince', 'lince', [], -12.084, -77.036, true],
  ['Los Olivos', 'los-olivos', [], -11.958, -77.070, true],
  ['Lurigancho', 'lurigancho', ['Chosica', 'Lurigancho-Chosica'], -11.939, -76.702, false],
  ['Lurín', 'lurin', ['Lurin'], -12.274, -76.874, false],
  ['Magdalena del Mar', 'magdalena-del-mar', ['Magdalena'], -12.092, -77.070, true],
  ['Miraflores', 'miraflores', [], -12.121, -77.030, true],
  ['Pachacámac', 'pachacamac', ['Pachacamac'], -12.229, -76.860, false],
  ['Pucusana', 'pucusana', [], -12.481, -76.795, false],
  ['Pueblo Libre', 'pueblo-libre', ['Magdalena Vieja'], -12.074, -77.063, true],
  ['Puente Piedra', 'puente-piedra', [], -11.865, -77.076, false],
  ['Punta Hermosa', 'punta-hermosa', [], -12.336, -76.825, false],
  ['Punta Negra', 'punta-negra', [], -12.365, -76.797, false],
  ['Rímac', 'rimac', ['Rimac'], -12.028, -77.029, false],
  ['San Bartolo', 'san-bartolo', [], -12.389, -76.779, false],
  ['San Borja', 'san-borja', [], -12.108, -76.999, true],
  ['San Isidro', 'san-isidro', [], -12.097, -77.036, true],
  ['San Juan de Lurigancho', 'san-juan-de-lurigancho', ['SJL'], -11.977, -77.008, false],
  ['San Juan de Miraflores', 'san-juan-de-miraflores', ['SJM'], -12.159, -76.971, false],
  ['San Luis', 'san-luis', [], -12.075, -76.996, false],
  ['San Martín de Porres', 'san-martin-de-porres', ['SMP', 'San Martin de Porres'], -12.021, -77.086, false],
  ['San Miguel', 'san-miguel', [], -12.077, -77.093, true],
  ['Santa Anita', 'santa-anita', [], -12.045, -76.966, false],
  ['Santa María del Mar', 'santa-maria-del-mar', ['Santa Maria'], -12.409, -76.771, false],
  ['Santa Rosa', 'santa-rosa', [], -11.798, -77.169, false],
  ['Santiago de Surco', 'santiago-de-surco', ['Surco'], -12.145, -76.997, true],
  ['Surquillo', 'surquillo', [], -12.112, -77.014, true],
  ['Villa El Salvador', 'villa-el-salvador', ['VES'], -12.213, -76.937, false],
  ['Villa María del Triunfo', 'villa-maria-del-triunfo', ['VMT', 'Villa Maria del Triunfo'], -12.163, -76.939, false],
];

// --- Callao ---
const CALLAO = [
  ['Callao', 'callao', ['Callao Cercado'], -12.056, -77.118, true],
  ['Bellavista', 'bellavista', [], -12.061, -77.104, false],
  ['Carmen de la Legua Reynoso', 'carmen-de-la-legua', ['Carmen de la Legua'], -12.043, -77.093, false],
  ['La Perla', 'la-perla', [], -12.070, -77.115, false],
  ['La Punta', 'la-punta', [], -12.070, -77.164, false],
  ['Mi Perú', 'mi-peru', ['Mi Peru'], -11.859, -77.128, false],
  ['Ventanilla', 'ventanilla', [], -11.874, -77.126, false],
];

// --- Principales ciudades de provincia ---
const PROVINCIAS = [
  ['Arequipa', 'Arequipa', 'Arequipa', 'arequipa', ['Arequipa Cercado'], -16.409, -71.537, true],
  ['Arequipa', 'Arequipa', 'Cayma', 'cayma', [], -16.376, -71.552, false],
  ['Arequipa', 'Arequipa', 'Yanahuara', 'yanahuara', [], -16.391, -71.548, false],
  ['Arequipa', 'Arequipa', 'José Luis Bustamante y Rivero', 'jose-luis-bustamante-y-rivero', ['JLByR'], -16.427, -71.523, false],
  ['Arequipa', 'Arequipa', 'Cerro Colorado', 'cerro-colorado', [], -16.373, -71.583, false],
  ['La Libertad', 'Trujillo', 'Trujillo', 'trujillo', [], -8.112, -79.029, true],
  ['La Libertad', 'Trujillo', 'Víctor Larco Herrera', 'victor-larco-herrera', ['Victor Larco'], -8.138, -79.043, false],
  ['Lambayeque', 'Chiclayo', 'Chiclayo', 'chiclayo', [], -6.772, -79.841, true],
  ['Piura', 'Piura', 'Piura', 'piura', [], -5.194, -80.632, true],
  ['Piura', 'Piura', 'Castilla', 'castilla', [], -5.199, -80.617, false],
  ['Cusco', 'Cusco', 'Cusco', 'cusco', ['Cuzco'], -13.532, -71.967, true],
  ['Cusco', 'Cusco', 'Wanchaq', 'wanchaq', [], -13.527, -71.955, false],
  ['Cusco', 'Cusco', 'San Sebastián', 'san-sebastian', ['San Sebastian'], -13.539, -71.918, false],
  ['Junín', 'Huancayo', 'Huancayo', 'huancayo', [], -12.068, -75.210, true],
  ['Junín', 'Huancayo', 'El Tambo', 'el-tambo', [], -12.049, -75.216, false],
  ['Áncash', 'Huaraz', 'Huaraz', 'huaraz', ['Ancash'], -9.529, -77.529, false],
  ['Áncash', 'Santa', 'Chimbote', 'chimbote', [], -9.075, -78.594, false],
  ['Ica', 'Ica', 'Ica', 'ica', [], -14.068, -75.729, false],
  ['Tacna', 'Tacna', 'Tacna', 'tacna', [], -18.014, -70.253, false],
  ['Loreto', 'Maynas', 'Iquitos', 'iquitos', [], -3.749, -73.253, false],
  ['San Martín', 'San Martín', 'Tarapoto', 'tarapoto', ['San Martin'], -6.488, -76.365, false],
  ['Cajamarca', 'Cajamarca', 'Cajamarca', 'cajamarca', [], -7.163, -78.500, false],
  ['Puno', 'Puno', 'Puno', 'puno', [], -15.840, -70.022, false],
  ['Puno', 'San Román', 'Juliaca', 'juliaca', ['San Roman'], -15.500, -70.133, false],
];

export const UBICACIONES = [
  ...LIMA.map(([d, s, a, lat, lng, dest]) => ['Lima', 'Lima', d, s, a, lat, lng, dest]),
  ...CALLAO.map(([d, s, a, lat, lng, dest]) => [
    'Callao', 'Callao', d, s, a, lat, lng, dest,
  ]),
  ...PROVINCIAS,
];

/**
 * PENDIENTE — códigos ubigeo del INEI.
 * Se dejan en NULL a propósito: son códigos oficiales y escribirlos de
 * memoria es pedir un error silencioso. Importar el padrón del INEI
 * (https://www.inei.gob.pe) y hacer un UPDATE por slug antes de usarlos
 * para cualquier cosa formal.
 */
