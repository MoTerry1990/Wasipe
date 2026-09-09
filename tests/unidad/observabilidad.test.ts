import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import type { ErrorEvent } from '@sentry/nextjs';
import {
  antesDeEnviar,
  limpiarEvento,
  CONFIGURACION,
  HABILITADO,
} from '@/lib/observabilidad/sentry';

/**
 * Qué sale de Wasipe hacia Sentry.
 *
 * Un registro de errores es un lugar donde los datos personales se quedan
 * **para siempre**: lo ve todo el equipo, se exporta, se indexa, y
 * borrarlo una vez que entró es casi imposible.
 *
 * Por eso estas pruebas no comprueban que Sentry funcione —eso hay que
 * verlo en Sentry— sino que lo que se manda no lleve nada que no debería
 * salir. Esa parte sí se puede probar sin conectar nada, y es la que de
 * verdad importa.
 */

const evento = (partes: Partial<ErrorEvent>): ErrorEvent =>
  ({ event_id: 'x', ...partes }) as ErrorEvent;

describe('sin DSN no se manda nada', () => {
  it('el interruptor está apagado si no hay dirección', () => {
    // En las pruebas no hay DSN, así que esto tiene que estar apagado.
    expect(HABILITADO).toBe(false);
  });

  it('y todo evento se descarta', () => {
    expect(antesDeEnviar(evento({ message: 'algo falló' }))).toBeNull();
  });
});

describe('la configuración', () => {
  it('no manda datos personales por defecto', () => {
    // Sentry trae `sendDefaultPii` en true en varias plantillas: manda la
    // IP y el correo sin que nadie lo pida.
    expect(CONFIGURACION.sendDefaultPii).toBe(false);
  });

  it('los errores van enteros, las trazas de rendimiento no', () => {
    // Si algo falló hay que verlo. Las trazas son continuas y ahí se va
    // la cuota.
    expect(CONFIGURACION.sampleRate).toBe(1);
    expect(CONFIGURACION.tracesSampleRate).toBeLessThanOrEqual(1);
    expect(CONFIGURACION.tracesSampleRate).toBeGreaterThan(0);
  });

  it('cada evento dice en qué entorno y con qué versión ocurrió', () => {
    // Sin esto, una traza apunta a una línea que puede no existir más.
    expect(CONFIGURACION.environment).toBeTruthy();
    expect(CONFIGURACION.release).toBeTruthy();
  });
});

describe('lo que nunca sale', () => {
  it('la contraseña de un formulario', () => {
    const salida = limpiarEvento(
      evento({
        request: {
          url: 'https://wasipe.pe/ingresar',
          data: { correo: 'prueba@ejemplo.pe', password: 'unaClaveDeVerdad123' },
        },
      }),
    );

    const texto = JSON.stringify(salida);
    expect(texto).not.toContain('unaClaveDeVerdad123');
    expect(texto).not.toContain('prueba@ejemplo.pe');
  });

  it('las cookies y las cabeceras enteras', () => {
    const salida = limpiarEvento(
      evento({
        request: {
          url: 'https://wasipe.pe/panel',
          cookies: { 'sb-access-token': 'ey.muy.secreto' },
          headers: { authorization: 'Bearer ey.muy.secreto' },
        },
      }),
    );

    const texto = JSON.stringify(salida);
    expect(texto).not.toContain('ey.muy.secreto');
    expect(salida?.request?.cookies).toBeUndefined();
    expect(salida?.request?.headers).toBeUndefined();
  });

  it('un correo metido en la dirección', () => {
    // Una URL con datos personales termina en el título del error, en la
    // lista, en el correo de alerta y en la búsqueda.
    const salida = limpiarEvento(
      evento({
        request: { url: 'https://wasipe.pe/recuperar?correo=alguien@ejemplo.pe&token=abc123' },
      }),
    );

    expect(salida?.request?.url).not.toContain('alguien@ejemplo.pe');
    expect(salida?.request?.url).not.toContain('abc123');
    // Pero la ruta sigue estando: sin ella el error no se puede ubicar.
    expect(salida?.request?.url).toContain('/recuperar');
  });

  it('el teléfono y la dirección exacta de una propiedad', () => {
    const salida = limpiarEvento(
      evento({
        extra: {
          aviso: {
            code: 'WSP-000123',
            telefono: '+51 999 888 777',
            exact_lat: -12.1211,
            exact_lon: -77.0301,
          },
        },
      }),
    );

    const texto = JSON.stringify(salida);
    expect(texto).not.toContain('999 888 777');
    expect(texto).not.toContain('-12.1211');
    // El código del aviso sí: es lo que permite reproducir el fallo.
    expect(texto).toContain('WSP-000123');
  });

  it('la clave de servicio, si alguien la mete en un contexto', () => {
    const salida = limpiarEvento(evento({ extra: { service_role_key: 'ey.la.llave.entera' } }));
    expect(JSON.stringify(salida)).not.toContain('ey.la.llave.entera');
  });

  it('lo que quedó en las migas de pan', () => {
    // Guardan cada clic y cada petición. Ahí es donde se cuela un
    // formulario entero sin que nadie lo haya pedido.
    const salida = limpiarEvento(
      evento({
        breadcrumbs: [
          { category: 'ui.click', data: { password: 'secreta', boton: 'Ingresar' } },
        ],
      }),
    );

    const texto = JSON.stringify(salida);
    expect(texto).not.toContain('secreta');
    expect(texto).toContain('Ingresar');
  });

  it('del usuario solo queda el identificador', () => {
    const salida = limpiarEvento(
      evento({
        user: {
          id: 'abc-123',
          email: 'alguien@ejemplo.pe',
          ip_address: '190.12.34.56',
          username: 'rosa',
        },
      }),
    );

    expect(salida?.user).toEqual({ id: 'abc-123' });
  });
});

describe('lo que sí sale', () => {
  it('el mensaje y la traza, que es para lo que sirve', () => {
    const salida = limpiarEvento(
      evento({
        exception: {
          values: [{ type: 'TypeError', value: 'no se pudo leer la propiedad precio' }],
        },
      }),
    );

    expect(JSON.stringify(salida)).toContain('no se pudo leer la propiedad precio');
  });

  it('pero no el ruido de las extensiones del navegador', () => {
    // Una extensión que revienta no es un fallo de Wasipe, y llena el
    // registro hasta que los errores de verdad no se ven.
    const ruido = evento({
      exception: {
        values: [{ type: 'Error', value: 'chrome-extension://abc falló al cargar' }],
      },
    });
    expect(limpiarEvento(ruido)).toBeNull();
  });
});

/**
 * El texto del error.
 *
 * Estas pruebas existen porque las anteriores no bastaban, y se supo de la
 * peor manera: en el sprint 22 se disparó un error real contra el Preview
 * con un correo, un teléfono, unas coordenadas y una contraseña metidos
 * **dentro del mensaje**. Las cookies se filtraron bien. Los otros cuatro
 * llegaron intactos a Sentry.
 *
 * El filtro de objetos mira las llaves, y un mensaje no tiene llaves donde
 * mirar. Todas las pruebas de arriba pasaban, y el agujero seguía abierto.
 */
describe('lo que va dentro del texto del error', () => {
  const textoDe = (valor: string) => {
    const salida = limpiarEvento(
      evento({ exception: { values: [{ type: 'Error', value: valor }] } }),
    );
    return salida?.exception?.values?.[0]?.value ?? '';
  };

  it('un correo en el mensaje', () => {
    // Supabase responde así cuando alguien se registra dos veces.
    const t = textoDe('User already registered: lucia.ferrer@ejemplo.pe');
    expect(t).not.toContain('lucia.ferrer@ejemplo.pe');
    expect(t).toContain('[correo]');
  });

  it('un celular peruano, con y sin prefijo', () => {
    for (const escrito of ['987654321', '+51 987 654 321', '51-987-654-321', '987 654 321']) {
      const t = textoDe(`El teléfono ${escrito} ya está en uso`);
      expect(t).not.toMatch(/987/);
      expect(t).toContain('[teléfono]');
    }
  });

  it('las coordenadas de una propiedad', () => {
    const t = textoDe('No se pudo geocodificar lat=-12.121100 lon=-77.030000');
    expect(t).not.toContain('-12.121100');
    expect(t).not.toContain('-77.030000');
    expect(t).toContain('[coordenada]');
  });

  it('una contraseña volcada como clave=valor', () => {
    const t = textoDe('Fallo de conexión: password=secreta-de-verdad user=postgres');
    expect(t).not.toContain('secreta-de-verdad');
    expect(t).toContain('[oculto]');
    // El resto del mensaje tiene que seguir sirviendo para depurar.
    expect(t).toContain('user=postgres');
  });

  it('un DNI o un RUC', () => {
    expect(textoDe('DNI 12345678 no válido')).not.toContain('12345678');
    expect(textoDe('RUC: 20512345678 duplicado')).not.toContain('20512345678');
  });

  it('lo mismo en evento.message, no solo en la excepción', () => {
    const salida = limpiarEvento(evento({ message: 'Aviso rechazado: rosa@ejemplo.pe' }));
    expect(salida?.message).not.toContain('rosa@ejemplo.pe');
    expect(salida?.message).toContain('[correo]');
  });

  it('y en el texto de una miga de pan', () => {
    const salida = limpiarEvento(
      evento({
        breadcrumbs: [{ message: 'Buscó por correo=alguien@ejemplo.pe', timestamp: 0 }],
      }),
    );
    expect(JSON.stringify(salida)).not.toContain('alguien@ejemplo.pe');
  });

  it('sin comerse lo que sí hace falta para depurar', () => {
    // El precio, el área y el código del aviso no son datos personales, y
    // un mensaje sin ellos no sirve para nada.
    const t = textoDe('El aviso WSP-001001 de 120 m² a US$ 420,000 falló al guardar');
    expect(t).toContain('WSP-001001');
    expect(t).toContain('120 m²');
    expect(t).toContain('420,000');
  });
});


/**
 * El enganche de navegación del App Router. Es P-27.
 *
 * Next busca un export llamado `onRouterTransitionStart` en
 * `instrumentation-client.ts` y lo llama al empezar cada navegación del
 * lado del cliente. Sin él, Sentry avisa en consola y las navegaciones
 * quedan sin medir: se ven los errores, pero no en qué navegación
 * ocurrieron ni cuánto tardó.
 *
 * Se comprueba sobre la fuente y no importando el módulo porque importarlo
 * arrastra el arranque del cliente de Sentry —y con él `next/font`—, que
 * necesita el build de Next. Lo que puede romperse acá es que alguien
 * borre el export o le cambie el nombre, y eso el texto lo ve igual.
 */
describe('el enganche de navegación del App Router', () => {
  const fuente = readFileSync(join(__dirname, '..', '..', 'instrumentation-client.ts'), 'utf8');

  it('instrumentation-client exporta onRouterTransitionStart', () => {
    expect(fuente).toMatch(/export\s*\{[^}]*as\s+onRouterTransitionStart/);
  });

  it('lo reexporta del paquete, sin envolverlo en una copia propia', () => {
    // Un envoltorio propio se queda atrás cuando cambie el de Sentry, y
    // el fallo sería silencioso: seguiría existiendo el export.
    expect(fuente).toMatch(/captureRouterTransitionStart[\s\S]*from '@sentry\/nextjs'/);
  });
});
