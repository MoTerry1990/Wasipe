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
