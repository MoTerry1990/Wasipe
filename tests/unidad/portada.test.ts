import { describe, it, expect } from 'vitest';
import { urlDeBusqueda, tipoDesdeSlug, SLUG_DESDE_TIPO, TIPO_DESDE_SLUG } from '@/lib/catalogo';
import { convertir, precioMostrado, porMetroMostrado, leerMoneda } from '@/lib/moneda';
import {
  normalizar,
  buscarUbicaciones,
  ubicacionPorTexto,
  UBICACIONES,
} from '@/config/ubicaciones';
import { BUSQUEDAS_POPULARES, PIE, LEGALES } from '@/config/sitio';

describe('URL de búsqueda', () => {
  it('cada operación va a su propia ruta', () => {
    expect(urlDeBusqueda('sale')).toBe('/comprar');
    expect(urlDeBusqueda('rent')).toBe('/alquilar');
    expect(urlDeBusqueda('project')).toBe('/proyectos');
  });

  it('arma los parámetros que se le pasan', () => {
    expect(urlDeBusqueda('rent', { tipo: 'departamento', donde: 'miraflores' })).toBe(
      '/alquilar?tipo=departamento&donde=miraflores',
    );
  });

  it('no escribe parámetros vacíos', () => {
    // "?tipo=&donde=" se ve roto y además duplica páginas para Google.
    expect(urlDeBusqueda('sale', { donde: '   ' })).toBe('/comprar');
    expect(urlDeBusqueda('sale', { tipo: 'casa', donde: '' })).toBe('/comprar?tipo=casa');
  });

  it('escapa lo que escribe la persona', () => {
    const url = urlDeBusqueda('sale', { donde: 'Jesús María' });
    expect(url).toBe('/comprar?donde=Jes%C3%BAs+Mar%C3%ADa');
    // Al leerlo de vuelta tiene que dar exactamente lo mismo.
    const params = new URL(url, 'https://wasipe.pe').searchParams;
    expect(params.get('donde')).toBe('Jesús María');
  });
});

describe('catálogo de tipos', () => {
  it('traduce el slug de la URL al enumerado de la base', () => {
    expect(tipoDesdeSlug('departamento')).toBe('apartment');
    expect(tipoDesdeSlug('cochera')).toBe('garage');
    expect(tipoDesdeSlug('inventado')).toBeUndefined();
    expect(tipoDesdeSlug(null)).toBeUndefined();
  });

  it('la ida y la vuelta coinciden para todos los tipos', () => {
    for (const [enumerado, slug] of Object.entries(SLUG_DESDE_TIPO)) {
      expect(TIPO_DESDE_SLUG[slug], `${slug} no vuelve a ${enumerado}`).toBe(enumerado);
    }
  });

  it('usa palabras peruanas en las URL', () => {
    // "departamento", no "apartamento"; "cochera", no "garaje".
    expect(SLUG_DESDE_TIPO.apartment).toBe('departamento');
    expect(SLUG_DESDE_TIPO.garage).toBe('cochera');
  });
});

describe('moneda', () => {
  it('no toca el monto si ya está en la moneda pedida', () => {
    expect(convertir(195000, 'USD', 'USD', 3.745)).toBe(195000);
  });

  it('convierte en los dos sentidos', () => {
    expect(convertir(1000, 'USD', 'PEN', 3.75)).toBe(3750);
    expect(convertir(3750, 'PEN', 'USD', 3.75)).toBe(1000);
  });

  it('muestra el precio tal cual cuando coincide con la preferencia', () => {
    const precio = precioMostrado({ price: 195000, currency: 'USD' }, 'USD', 3.745);
    expect(precio.texto).toBe('US$ 195,000');
    expect(precio.convertido).toBe(false);
    expect(precio.original).toBeNull();
  });

  it('convierte y deja a la vista el precio original', () => {
    const precio = precioMostrado({ price: 195000, currency: 'USD' }, 'PEN', 3.745);
    expect(precio.texto).toBe('S/ 730,275');
    expect(precio.convertido).toBe(true);
    // Ocultar el original sería engañoso: quien vende pide dólares.
    expect(precio.original).toBe('Publicado en US$ 195,000');
  });

  it('usa la referencia en dólares que ya calculó la base', () => {
    // El aviso está en soles; price_usd es lo que usa el buscador para
    // filtrar. Si la tarjeta calculara por su cuenta, se contradirían.
    const precio = precioMostrado(
      { price: 2500, currency: 'PEN', price_usd: 667.56 },
      'USD',
      3.745,
    );
    expect(precio.texto).toBe('US$ 668');
    expect(precio.original).toBe('Publicado en S/ 2,500');
  });

  it('escribe el precio por m² en la moneda elegida', () => {
    expect(porMetroMostrado(2119.57, 'USD', 'USD', 3.745)).toBe('US$ 2,120 por m²');
    expect(porMetroMostrado(2119.57, 'USD', 'PEN', 3.745)).toBe('S/ 7,938 por m²');
  });

  it('nunca escribe "USD"', () => {
    const precio = precioMostrado({ price: 120000, currency: 'USD' }, 'USD');
    expect(precio.texto).toContain('US$');
    expect(precio.texto).not.toContain('USD');
  });

  it('cae en dólares ante un valor desconocido', () => {
    expect(leerMoneda('EUR')).toBe('USD');
    expect(leerMoneda(undefined)).toBe('USD');
    expect(leerMoneda('PEN')).toBe('PEN');
  });
});

describe('autocompletado de ubicación', () => {
  it('encuentra sin importar las tildes ni las mayúsculas', () => {
    expect(normalizar('BREÑA')).toBe('brena');
    expect(normalizar('Jesús María')).toBe('jesus maria');
    expect(buscarUbicaciones('brena').map((u) => u.nombre)).toContain('Breña');
    expect(buscarUbicaciones('JESUS').map((u) => u.nombre)).toContain('Jesús María');
  });

  it('pone primero las que empiezan con lo escrito', () => {
    const resultados = buscarUbicaciones('san');
    // "San Isidro" antes que "Cercado de Lima", aunque las dos tengan "san".
    expect(resultados[0]?.nombre.startsWith('San')).toBe(true);
  });

  it('no sugiere nada con una sola letra', () => {
    // Con una letra la lista sería casi entera y no ayuda a nadie.
    expect(buscarUbicaciones('m')).toEqual([]);
    expect(buscarUbicaciones('mi').length).toBeGreaterThan(0);
  });

  it('limita cuántas sugerencias devuelve', () => {
    expect(buscarUbicaciones('a', 5).length).toBeLessThanOrEqual(5);
    expect(buscarUbicaciones('an', 3).length).toBeLessThanOrEqual(3);
  });

  it('reconoce una ubicación por su slug o por su nombre', () => {
    expect(ubicacionPorTexto('santiago-de-surco')?.nombre).toBe('Santiago de Surco');
    expect(ubicacionPorTexto('MIRAFLORES')?.slug).toBe('miraflores');
    expect(ubicacionPorTexto('Cusco')?.departamento).toBe('Cusco');
    expect(ubicacionPorTexto('Springfield')).toBeUndefined();
  });

  it('cubre Lima y también provincias', () => {
    const departamentos = new Set(UBICACIONES.map((u) => u.departamento));
    expect(departamentos.has('Lima')).toBe(true);
    expect(departamentos.has('Arequipa')).toBe(true);
    expect(departamentos.size).toBeGreaterThanOrEqual(6);
  });

  it('no repite slugs', () => {
    const slugs = UBICACIONES.map((u) => u.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('pie de página', () => {
  it('las búsquedas populares apuntan a rutas de verdad', () => {
    for (const busqueda of BUSQUEDAS_POPULARES) {
      expect(busqueda.href, busqueda.texto).toMatch(/^\/(comprar|alquilar|proyectos)(\?|$)/);
    }
  });

  it('los enlaces del pie son internos o correo', () => {
    for (const grupo of PIE) {
      for (const enlace of grupo.enlaces) {
        expect(enlace.href, enlace.texto).toMatch(/^(\/|mailto:)/);
      }
    }
  });

  it('incluye el Libro de Reclamaciones, que en el Perú es obligatorio', () => {
    expect(LEGALES.map((l) => l.texto)).toContain('Libro de Reclamaciones');
  });

  it('tiene los tres grupos que pide el sprint', () => {
    expect(PIE.map((g) => g.titulo)).toEqual(['Buscar', 'Publicar', 'Ayuda']);
  });
});
