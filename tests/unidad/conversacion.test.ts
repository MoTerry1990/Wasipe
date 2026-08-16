import { describe, it, expect } from 'vitest';
import {
  CATEGORIAS_PROTEGIDAS,
  armarPeticionDeBusqueda,
  combinar,
  explicarFiltros,
  interpretarLocal,
  leerMonto,
  leerRespuestaDelModelo,
  mensajeDeObjeciones,
  revisarConsulta,
  validarFiltros,
} from '@/lib/ia/conversacion';
import {
  AVISO_DE_RECOMENDACION,
  CLAVES_DE_PRIORIDAD,
  MAXIMO_A_COMPARAR,
  NUNCA_EN_UNA_RECOMENDACION,
  armarComparacion,
  contraElPromedio,
  esPrioridad,
  recomendar,
  relacionConDistrito,
  type AvisoComparado,
} from '@/lib/ia/comparar';
import { urlDeFiltros } from '@/lib/busqueda/filtros';

/**
 * Búsqueda conversacional y comparación.
 *
 * Dos promesas se comprueban con insistencia: que la frase de ejemplo del
 * sprint produce filtros válidos, y que nada de lo que salga —del parser
 * o del modelo— puede colarse sin pasar por el mismo esquema que valida
 * la URL. La tercera es que ni la búsqueda ni la recomendación tocan una
 * categoría protegida.
 */

const EJEMPLO =
  'Busco un departamento en Jesús María o Magdalena, máximo US$150,000, con dos dormitorios, estacionamiento y que acepte mascotas.';

// ---------------------------------------------------------------------
// La frase del sprint
// ---------------------------------------------------------------------

describe('el pedido de ejemplo', () => {
  const filtros = validarFiltros(interpretarLocal(EJEMPLO, 'sale'), 'sale');

  it('saca el tipo de inmueble', () => {
    expect(filtros.tipo).toBe('apartment');
  });

  it('saca el distrito', () => {
    // Con dos distritos se toma el primero; el segundo se agrega a mano.
    expect(['Jesús María', 'Magdalena del Mar']).toContain(filtros.distrito);
  });

  it('entiende «máximo US$150,000» como tope, en dólares', () => {
    expect(filtros.precioMax).toBe(150_000);
    expect(filtros.precioMin).toBeUndefined();
    expect(filtros.moneda).toBe('USD');
  });

  it('entiende «dos dormitorios» escrito con letras', () => {
    expect(filtros.dorm).toBe(2);
  });

  it('entiende «estacionamiento» sin número como al menos uno', () => {
    expect(filtros.cocheras).toBe(1);
  });

  it('entiende «que acepte mascotas»', () => {
    expect(filtros.mascotas).toBe(true);
  });

  it('y arma una URL de búsqueda de verdad', () => {
    const url = urlDeFiltros(filtros);
    expect(url).toContain('/comprar');
    expect(url).toContain('precioMax=150000');
    expect(url).toContain('dorm=2');
    expect(url).toContain('mascotas=1');
  });

  it('lo entendido se puede mostrar en castellano', () => {
    const chips = explicarFiltros(filtros);
    const texto = chips.map((c) => `${c.etiqueta}: ${c.valor}`).join(' · ');

    expect(texto).toContain('Hasta: US$ 150,000');
    expect(texto).toContain('Dormitorios: 2 o más');
    expect(texto).toContain('Mascotas: Acepta');
    expect(texto).not.toContain('USD 150');
  });
});

// ---------------------------------------------------------------------
// El parser, caso por caso
// ---------------------------------------------------------------------

describe('leer montos como se escriben en el Perú', () => {
  it.each([
    ['US$150,000', 150_000, 'USD'],
    ['US$ 150,000', 150_000, 'USD'],
    ['150 mil dólares', 150_000, 'USD'],
    ['150,000 dólares', 150_000, 'USD'],
    ['S/ 2,500', 2_500, 'PEN'],
    ['2500 soles', 2_500, 'PEN'],
    ['1.2 millones', 1_200_000, 'USD'],
  ])('%s', (texto, monto, moneda) => {
    const leido = leerMonto(texto);
    expect(leido?.monto).toBe(monto);
    expect(leido?.moneda).toBe(moneda);
  });

  it('un número chico no es un precio', () => {
    expect(leerMonto('con 3 dormitorios')).toBeNull();
  });

  it('sin dólares ni soles se asume dólares: así se cotiza en Lima', () => {
    expect(leerMonto('hasta 200,000')?.moneda).toBe('USD');
  });
});

describe('el parser local', () => {
  it('«desde» es piso, no tope', () => {
    const filtros = interpretarLocal('casa en Surco desde US$ 300,000', 'sale');
    expect(filtros.precioMin).toBe(300_000);
    expect(filtros.precioMax).toBeUndefined();
  });

  it('un monto suelto se lee como tope: es lo que la gente quiere decir', () => {
    const filtros = interpretarLocal('departamento en Lince de US$ 120,000', 'sale');
    expect(filtros.precioMax).toBe(120_000);
  });

  it('gana el nombre de distrito más largo', () => {
    const filtros = interpretarLocal('departamento en San Isidro, Lima', 'sale');
    expect(filtros.distrito).toBe('San Isidro');
  });

  it('lee los sellos', () => {
    const filtros = interpretarLocal(
      'departamento verificado, de estreno y rebajado en Barranco',
      'sale',
    );
    expect(filtros.verificados).toBe(true);
    expect(filtros.nuevos).toBe(true);
    expect(filtros.rebajados).toBe(true);
  });

  it('lee el alquiler en soles', () => {
    const filtros = interpretarLocal('alquilo depa en Jesús María hasta S/ 2,500', 'rent');
    expect(filtros.operacion).toBe('rent');
    expect(filtros.precioMax).toBe(2_500);
    expect(filtros.moneda).toBe('PEN');
  });

  it('una frase sin nada aprovechable no inventa filtros', () => {
    const filtros = validarFiltros(interpretarLocal('hola qué tal', 'sale'), 'sale');
    expect(explicarFiltros(filtros)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// La misma puerta que la URL
// ---------------------------------------------------------------------

describe('validar lo que sea que salga', () => {
  it('un precio negativo se recorta, no rompe', () => {
    const filtros = validarFiltros({ precioMax: -50, dorm: 2 }, 'sale');
    expect(filtros.precioMax).toBe(0);
    expect(filtros.dorm).toBe(2);
  });

  it('un valor absurdo se recorta al máximo', () => {
    expect(validarFiltros({ dorm: 9999 }, 'sale').dorm).toBe(30);
  });

  it('un tipo inventado desaparece y el resto sobrevive', () => {
    const filtros = validarFiltros({ tipo: 'castillo', dorm: 3 }, 'sale');
    expect(filtros.tipo).toBeUndefined();
    expect(filtros.dorm).toBe(3);
  });

  it('acepta tanto el valor de la base como el slug', () => {
    expect(validarFiltros({ tipo: 'apartment' }, 'sale').tipo).toBe('apartment');
    expect(validarFiltros({ tipo: 'departamento' }, 'sale').tipo).toBe('apartment');
  });

  it('un rango al revés se da vuelta en vez de no devolver nada', () => {
    const filtros = validarFiltros({ precioMin: 500_000, precioMax: 100_000 }, 'sale');
    expect(filtros.precioMin).toBe(100_000);
    expect(filtros.precioMax).toBe(500_000);
  });

  it('la operación no se puede cambiar desde los filtros', () => {
    expect(validarFiltros({ operacion: 'rent' }, 'sale').operacion).toBe('sale');
  });
});

describe('lo que devuelve el modelo', () => {
  it('se queda solo con las claves conocidas', () => {
    const leido = leerRespuestaDelModelo(
      '{"distrito":"Miraflores","dorm":2,"ownerEmail":"x@y.pe","borrar":true}',
    );
    expect(leido).toEqual({ distrito: 'Miraflores', dorm: 2 });
  });

  it('sobrevive al markdown que a veces envuelve la respuesta', () => {
    const leido = leerRespuestaDelModelo('```json\n{"dorm":3}\n```');
    expect(leido).toEqual({ dorm: 3 });
  });

  it('una respuesta que no es JSON no rompe nada', () => {
    expect(leerRespuestaDelModelo('No entendí tu pedido')).toEqual({});
    expect(leerRespuestaDelModelo('')).toEqual({});
    expect(leerRespuestaDelModelo('[1,2,3]')).toEqual({});
  });

  it('manda el parser local; el modelo solo completa', () => {
    const combinado = combinar({ distrito: 'Lince', dorm: 2 }, { distrito: 'Surco', banos: 2 });
    expect(combinado.distrito).toBe('Lince');
    expect(combinado.banos).toBe(2);
  });

  it('las instrucciones dicen que devuelva solo JSON y no invente', () => {
    const peticion = armarPeticionDeBusqueda(EJEMPLO);
    expect(peticion.sistema).toMatch(/ÚNICAMENTE un objeto JSON/);
    expect(peticion.sistema).toMatch(/No inventes valores/);
    expect(peticion.mensajes[0]?.texto).toContain(EJEMPLO);
  });
});

// ---------------------------------------------------------------------
// Nada de categorías protegidas
// ---------------------------------------------------------------------

describe('vivienda y discriminación', () => {
  it.each([
    ['solo para extranjeros', 'origen'],
    ['departamento en Surco sin niños', 'familia'],
    ['casa para familia católica', 'religion'],
    ['alquilo solo a mujeres', 'sexo'],
    ['inquilinos sin discapacidad', 'discapacidad'],
    ['no adultos mayores', 'edad'],
  ])('detecta «%s»', (frase, clave) => {
    const objeciones = revisarConsulta(frase);
    expect(objeciones.map((o) => o.clave)).toContain(clave);
  });

  it('un pedido normal no dispara ninguna objeción', () => {
    expect(revisarConsulta(EJEMPLO)).toHaveLength(0);
    expect(revisarConsulta('casa de 3 dormitorios en Surco con jardín')).toHaveLength(0);
  });

  it('no corta la búsqueda: ignora esa parte y sigue con el resto', () => {
    const frase = 'departamento en Jesús María sin niños, hasta US$ 100,000';
    const objeciones = revisarConsulta(frase);
    const filtros = validarFiltros(interpretarLocal(frase, 'sale'), 'sale');

    expect(objeciones).toHaveLength(1);
    expect(filtros.distrito).toBe('Jesús María');
    expect(filtros.precioMax).toBe(100_000);
  });

  it('y lo dice sin rodeos', () => {
    const mensaje = mensajeDeObjeciones(revisarConsulta('sin niños'));
    expect(mensaje).toMatch(/Wasipe no filtra avisos por/);
    expect(mensaje).toMatch(/Buscamos con el resto/);
  });

  it('sin objeciones no hay mensaje que mostrar', () => {
    expect(mensajeDeObjeciones([])).toBe('');
  });

  it('no existe ningún filtro para una categoría protegida', () => {
    const filtros = validarFiltros(
      { nacionalidad: 'peruana', sinNinos: true, religion: 'catolica' },
      'sale',
    );
    expect(explicarFiltros(filtros)).toHaveLength(0);
    expect(urlDeFiltros(filtros)).not.toMatch(/nacionalidad|religion|Ninos/i);
  });

  it('las instrucciones del modelo también lo prohíben', () => {
    const sistema = armarPeticionDeBusqueda(EJEMPLO).sistema;
    expect(sistema).toMatch(/NUNCA traduzcas a un filtro/);
    expect(sistema).toMatch(/nacionalidad, el origen, la raza, la religión/);
    expect(sistema).toMatch(/discapacidad o si hay niños/);
  });

  it('están cubiertas las seis categorías', () => {
    expect(CATEGORIAS_PROTEGIDAS.map((c) => c.clave)).toEqual([
      'origen',
      'religion',
      'familia',
      'discapacidad',
      'sexo',
      'edad',
    ]);
  });
});

// ---------------------------------------------------------------------
// Comparación
// ---------------------------------------------------------------------

function aviso(parcial: Partial<AvisoComparado> & { code: string }): AvisoComparado {
  return {
    id: parcial.code,
    title: `Aviso ${parcial.code}`,
    district: 'Miraflores',
    province: 'Lima',
    operation: 'sale',
    property_type: 'apartment',
    currency: 'USD',
    price: 200_000,
    price_usd: 200_000,
    maintenance: null,
    total_area: 100,
    built_area: null,
    price_per_m2: 2_000,
    price_usd_per_m2: 2_000,
    bedrooms: 3,
    bathrooms: 2,
    parking: 1,
    age_years: 5,
    verification_status: 'unverified',
    cover_url: null,
    features: [],
    district_avg_usd_per_m2: 2_500,
    district_listings: 40,
    ...parcial,
  };
}

const BARATO = aviso({
  code: 'WSP-000001',
  price: 150_000,
  price_usd: 150_000,
  total_area: 80,
  price_per_m2: 1_875,
  price_usd_per_m2: 1_875,
  bedrooms: 2,
  age_years: 12,
});

const GRANDE = aviso({
  code: 'WSP-000002',
  price: 260_000,
  price_usd: 260_000,
  total_area: 130,
  price_per_m2: 2_000,
  price_usd_per_m2: 2_000,
  bedrooms: 4,
  parking: 2,
  age_years: 0,
  verification_status: 'verified',
  maintenance: 350,
  features: ['ascensor', 'piscina'],
});

describe('la tabla comparativa', () => {
  const filas = armarComparacion([BARATO, GRANDE]);
  const buscar = (clave: string) => filas.find((f) => f.clave === clave)!;

  it('trae las filas que el sprint pide', () => {
    for (const clave of [
      'precio',
      'area',
      'm2',
      'mantenimiento',
      'dormitorios',
      'banos',
      'cocheras',
      'antiguedad',
      'distrito',
      'verificacion',
    ]) {
      expect(buscar(clave), clave).toBeDefined();
    }
  });

  it('los valores son los de la base, con formato peruano', () => {
    expect(buscar('precio').valores).toEqual(['US$ 150,000', 'US$ 260,000']);
    expect(buscar('area').valores).toEqual(['80 m²', '130 m²']);
    expect(buscar('m2').valores).toEqual(['US$ 1,875 por m²', 'US$ 2,000 por m²']);
    expect(buscar('dormitorios').valores).toEqual(['2', '4']);
  });

  it('marca el mejor de cada fila', () => {
    expect(buscar('precio').mejores).toEqual([0]);
    expect(buscar('area').mejores).toEqual([1]);
    expect(buscar('m2').mejores).toEqual([0]);
    expect(buscar('verificacion').mejores).toEqual([1]);
  });

  it('«de estreno» gana la antigüedad: el cero no queda fuera', () => {
    expect(buscar('antiguedad').valores).toEqual(['12 años', 'De estreno']);
    expect(buscar('antiguedad').mejores).toEqual([1]);
  });

  it('no marca ganador en el promedio del distrito: más caro no es peor', () => {
    expect(buscar('distrito').mejores).toEqual([]);
  });

  it('el promedio del distrito dice de cuántos avisos sale', () => {
    expect(buscar('distrito').nota).toMatch(/No es una tasación/);
  });

  it('un dato que falta se muestra como falta, no como cero', () => {
    expect(buscar('mantenimiento').valores[0]).toBe('—');
  });

  it('solo aparecen las características que alguno tiene', () => {
    expect(filas.find((f) => f.clave === 'car-piscina')).toBeDefined();
    expect(filas.find((f) => f.clave === 'car-gimnasio')).toBeUndefined();
  });

  it('compara contra el promedio del distrito', () => {
    expect(contraElPromedio(BARATO)).toBe('25% debajo del promedio');
    expect(relacionConDistrito(BARATO)).toBeCloseTo(0.75, 2);
  });

  it('sin referencia del distrito no se inventa una', () => {
    expect(contraElPromedio(aviso({ code: 'X', district_avg_usd_per_m2: null }))).toBe('—');
  });

  it('con un solo aviso no hay nada que marcar', () => {
    for (const fila of armarComparacion([BARATO])) {
      expect(fila.mejores).toEqual([]);
    }
  });
});

describe('la recomendación', () => {
  it('sin prioridades elegidas no recomienda nada', () => {
    expect(recomendar([BARATO, GRANDE], []).ganador).toBeNull();
  });

  it('con un solo aviso tampoco', () => {
    expect(recomendar([BARATO], ['precio']).ganador).toBeNull();
  });

  it('quien prioriza el precio se lleva el más barato', () => {
    const { ganador, hechos } = recomendar([BARATO, GRANDE], ['precio']);
    expect(ganador).toBe(0);
    expect(hechos.join(' ')).toContain('WSP-000001 es el más barato');
  });

  it('quien prioriza el espacio se lleva el más grande', () => {
    expect(recomendar([BARATO, GRANDE], ['espacio']).ganador).toBe(1);
  });

  it('los hechos se pueden contrastar con la tabla', () => {
    const { hechos } = recomendar([BARATO, GRANDE], ['precio', 'espacio', 'verificado']);
    expect(hechos).toContain('WSP-000001 es el más barato de los que comparas.');
    expect(hechos).toContain('WSP-000002 es el más grande.');
    expect(hechos).toContain('WSP-000002 está verificado por Wasipe.');
  });

  it('los puntajes van de 0 a 1', () => {
    const { puntajes } = recomendar([BARATO, GRANDE], ['precio', 'espacio']);
    for (const puntaje of puntajes) {
      expect(puntaje).toBeGreaterThanOrEqual(0);
      expect(puntaje).toBeLessThanOrEqual(1);
    }
  });

  it('un empate no se desempata a dedo', () => {
    const gemelo = { ...BARATO, code: 'WSP-000009' };
    expect(recomendar([BARATO, gemelo], ['precio']).ganador).toBeNull();
  });

  it('las advertencias van siempre, con o sin ganador', () => {
    for (const prioridades of [[], ['precio'] as const]) {
      const { advertencias } = recomendar([BARATO, GRANDE], prioridades as never);
      expect(advertencias.join(' ')).toMatch(/No reemplaza una visita ni una tasación/);
      expect(advertencias.join(' ')).toMatch(/seguridad de la zona/);
    }
  });

  it('el aviso separa el hecho de la lectura', () => {
    expect(AVISO_DE_RECOMENDACION).toMatch(/no una opinión sobre el inmueble/);
    expect(AVISO_DE_RECOMENDACION).toMatch(/se pueden contrastar/);
  });

  it('lo que nunca entra en una recomendación está escrito', () => {
    const texto = NUNCA_EN_UNA_RECOMENDACION.join(' ').toLowerCase();
    expect(texto).toMatch(/nacionalidad|raza|religión/);
    expect(texto).toMatch(/segura|tranquila|familiar/);
    expect(texto).toMatch(/para una familia|para solteros|adultos mayores/);
  });

  it('ninguna prioridad es una categoría protegida', () => {
    const texto = CLAVES_DE_PRIORIDAD.map((c) => c).join(' ');
    expect(texto).not.toMatch(/familia|edad|religion|origen|sexo|ninos/i);
    expect(esPrioridad('precio')).toBe(true);
    expect(esPrioridad('vecinos')).toBe(false);
  });

  it('se comparan hasta cuatro', () => {
    expect(MAXIMO_A_COMPARAR).toBe(4);
  });
});
