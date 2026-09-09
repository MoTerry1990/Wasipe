import { describe, it, expect } from 'vitest';
// @ts-expect-error — el guion es .mjs sin tipos; se prueba su comportamiento.
import { decidir, referenciaDe, referenciaDeUsuario, CODIGOS } from '../../scripts/verificar-proyecto.logica.mjs';

/**
 * El verificador previo a migrar. Es P-39.
 *
 * La versión anterior respondía una sola pregunta —«¿la base está
 * vacía?»— y salía con código 2 si no lo estaba. Como desde el sprint 21
 * la base siempre tiene tablas, ese 2 se volvió permanente, y `CLAUDE.md`
 * decía que con 2 no se migra. Una comprobación que siempre contesta lo
 * mismo dejó de comprobar: es la misma enfermedad que P-26, en la
 * herramienta que decide si se toca la base de producción.
 *
 * Estas pruebas existen porque antes no se podía probar: la decisión
 * estaba mezclada con la petición de red, así que la única forma de saber
 * qué haría era apuntarla a una base de verdad y mirar. Acá no se abre
 * ninguna conexión ni se toca ningún dato: `decidir()` recibe los hechos
 * y devuelve el veredicto.
 */

const BASE = {
  refDeLaApp: 'kcsditeaaszvmwirjazo',
  refDeLaBase: 'kcsditeaaszvmwirjazo',
  entorno: 'desarrollo',
  tablas: 35,
  aplicadas: ['20260816090200', '20260908100000'],
  enDisco: ['20260816090200', '20260908100000'],
};

describe('los cinco estados del verificador', () => {
  it('1 · proyecto equivocado: bloquea', () => {
    const v = decidir({ ...BASE, refDeLaBase: 'otroproyectoquenoes' });
    expect(v.estado).toBe('proyecto-equivocado');
    expect(v.codigo).toBe(CODIGOS.BLOQUEO);
  });

  it('1b · entorno equivocado: producción bloquea salvo que se pida a propósito', () => {
    const bloqueado = decidir({ ...BASE, entorno: 'produccion' });
    expect(bloqueado.estado).toBe('entorno-equivocado');
    expect(bloqueado.codigo).toBe(CODIGOS.BLOQUEO);

    // Con la bandera explícita sí deja, y eso es lo que se quiere: que la
    // decisión quede escrita en el comando y no en la cabeza de alguien.
    const permitido = decidir({ ...BASE, entorno: 'produccion', permitirProduccion: true });
    expect(permitido.codigo).toBe(CODIGOS.CONTINUAR);
  });

  it('2 · base nueva o vacía: se puede migrar', () => {
    const v = decidir({ ...BASE, tablas: 0, aplicadas: [] });
    expect(v.estado).toBe('base-nueva');
    expect(v.codigo).toBe(CODIGOS.CONTINUAR);
    expect(v.pendientes).toEqual(BASE.enDisco);
  });

  it('3 · base existente y al día: continúa, y dice que no hay nada que hacer', () => {
    const v = decidir(BASE);
    expect(v.estado).toBe('al-dia');
    expect(v.codigo).toBe(CODIGOS.CONTINUAR);
    expect(v.pendientes).toEqual([]);
  });

  it('4 · base existente con pendientes: continúa y las nombra', () => {
    const v = decidir({
      ...BASE,
      aplicadas: ['20260816090200'],
      enDisco: ['20260816090200', '20260908100000', '20260910120000'],
    });
    expect(v.estado).toBe('con-pendientes');
    expect(v.codigo).toBe(CODIGOS.CONTINUAR);
    expect(v.pendientes).toEqual(['20260908100000', '20260910120000']);
  });

  it('5 · error real de conexión o esquema: ni continúa ni bloquea, avisa', () => {
    const v = decidir({ ...BASE, fallo: 'ENOTFOUND db.ejemplo.supabase.co' });
    expect(v.estado).toBe('error-de-conexion');
    expect(v.codigo).toBe(CODIGOS.CONEXION);
  });

  it('configuración incompleta se distingue de un error de conexión', () => {
    const v = decidir({ fallo: 'configuracion' });
    expect(v.estado).toBe('configuracion-incompleta');
    expect(v.codigo).toBe(CODIGOS.CONFIGURACION);
    // No dice nada sobre la base porque no llegó a mirarla.
    expect(v.pendientes).toEqual([]);
  });
});

describe('lo que este verificador NO debe volver a hacer', () => {
  it('una base con tablas ya no bloquea por el solo hecho de tenerlas', () => {
    // Esto es exactamente P-39. Antes, cualquiera de estos dos casos
    // salía 2 y, leído al pie de la letra, prohibía migrar para siempre.
    for (const caso of [
      BASE,
      { ...BASE, aplicadas: ['20260816090200'] }, // con una pendiente
    ]) {
      const v = decidir(caso);
      expect(v.codigo, v.estado).toBe(CODIGOS.CONTINUAR);
    }
  });

  it('pero lo que sí no se deshace sigue bloqueando', () => {
    // La protección no se aflojó: se movió a donde importaba.
    expect(decidir({ ...BASE, refDeLaBase: 'distinto' }).codigo).toBe(CODIGOS.BLOQUEO);
    expect(decidir({ ...BASE, entorno: 'produccion' }).codigo).toBe(CODIGOS.BLOQUEO);
    expect(decidir({ ...BASE, refDeLaBase: null }).codigo).toBe(CODIGOS.BLOQUEO);
  });

  it('el proyecto se comprueba antes que cualquier cosa informativa', () => {
    // Con el proyecto equivocado, «hay 3 pendientes» sería una respuesta
    // cierta sobre la base incorrecta. El orden es parte de la garantía.
    const v = decidir({
      ...BASE,
      refDeLaBase: 'otro',
      aplicadas: [],
      enDisco: ['1', '2', '3'],
    });
    expect(v.estado).toBe('proyecto-equivocado');
    expect(v.pendientes).toEqual([]);
  });

  it('avisa de migraciones aplicadas que el repositorio no tiene', () => {
    const v = decidir({ ...BASE, aplicadas: [...BASE.aplicadas, '20991231235959'] });
    expect(v.desconocidas).toEqual(['20991231235959']);
  });
});

describe('de dónde sale la referencia del proyecto', () => {
  it('del anfitrión de la aplicación y del de la conexión directa', () => {
    expect(referenciaDe('kcsditeaaszvmwirjazo.supabase.co')).toBe('kcsditeaaszvmwirjazo');
    expect(referenciaDe('db.kcsditeaaszvmwirjazo.supabase.co')).toBe('kcsditeaaszvmwirjazo');
    expect(referenciaDe('aws-0-us-east-2.pooler.supabase.com')).toBeNull();
  });

  it('y del usuario cuando se entra por el pooler, que es el caso de hoy', () => {
    // El anfitrión del pooler es regional y compartido: no dice a qué
    // proyecto se conecta uno. Lo único que lo dice es el usuario. Sin
    // esto, la protección contra el proyecto equivocado quedaría ciega
    // justo con la conexión que se usa.
    expect(referenciaDeUsuario('postgres.kcsditeaaszvmwirjazo')).toBe('kcsditeaaszvmwirjazo');
    expect(referenciaDeUsuario('postgres')).toBeNull();
  });
});
