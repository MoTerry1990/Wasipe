/**
 * La decisión del verificador previo a migrar, sin tocar nada.
 *
 * Está separada del script para poder probarla: la versión anterior tenía
 * la decisión mezclada con la petición de red, así que la única forma de
 * comprobar qué haría era apuntarla a una base de verdad y mirar. Eso no
 * es una prueba, es un ensayo.
 *
 * ### Por qué existe esta reescritura (P-39)
 *
 * La versión del sprint 21 respondía una sola pregunta —«¿la base está
 * vacía?»— porque se escribió para la **primera** migración, cuando vacía
 * era lo correcto. Desde entonces la base siempre tiene tablas, así que
 * salía 2 siempre, y `CLAUDE.md` decía «con código 2 no se migra». Leído
 * al pie de la letra, eso prohibía toda migración incremental para
 * siempre.
 *
 * Una comprobación que siempre da la misma respuesta dejó de comprobar.
 * Lo peligroso no es que la base tenga tablas —es lo normal—, sino migrar
 * al proyecto o al entorno equivocado, que es lo que no se deshace.
 */

/**
 * Códigos de salida. Son contrato: hay guiones que los leen.
 *
 *   0  Se puede continuar. La base es nueva, está al día, o tiene
 *      pendientes concretas y conocidas. El texto dice cuál de las tres.
 *   1  Configuración incompleta: faltan variables en `.env.local`.
 *      No se comprobó nada; no dice nada sobre la base.
 *   2  BLOQUEO. El proyecto o el entorno no son los que corresponden.
 *      Nunca se migra con esto, y no hay bandera que lo salte salvo la
 *      que se pide a propósito para producción.
 *   3  Error real: no se pudo conectar o el esquema no se pudo leer.
 *      Distinto de 1 porque acá la configuración estaba bien.
 */
export const CODIGOS = {
  CONTINUAR: 0,
  CONFIGURACION: 1,
  BLOQUEO: 2,
  CONEXION: 3,
};

/**
 * Decide en qué estado está el proyecto.
 *
 * Todo lo que necesita llega como argumento: no lee entorno, no abre
 * conexiones y no imprime. Devuelve el estado, el código y qué decir.
 *
 * El orden de las comprobaciones importa y no es alfabético: primero lo
 * que invalida todo lo demás (configuración, error de lectura), después
 * lo que bloquea (proyecto, entorno) y recién al final lo informativo
 * (vacía, al día, pendientes). Preguntar «¿hay pendientes?» antes de
 * «¿es el proyecto correcto?» daría una respuesta cierta sobre la base
 * equivocada.
 */
export function decidir({
  refDeLaApp,
  refDeLaBase,
  entorno,
  tablas,
  aplicadas,
  enDisco,
  fallo,
  permitirProduccion = false,
}) {
  if (fallo === 'configuracion') {
    return {
      estado: 'configuracion-incompleta',
      codigo: CODIGOS.CONFIGURACION,
      titulo: 'Faltan variables en .env.local',
      detalle: [
        'Hacen falta NEXT_PUBLIC_SUPABASE_URL y SUPABASE_DB_URL para saber',
        'a qué proyecto se estaría migrando. Sin eso no se comprobó nada.',
      ],
      pendientes: [],
    };
  }

  if (fallo) {
    return {
      estado: 'error-de-conexion',
      codigo: CODIGOS.CONEXION,
      titulo: 'No se pudo leer la base',
      detalle: [String(fallo)],
      pendientes: [],
    };
  }

  // Lo que de verdad no se deshace: migrar a otro proyecto. Que la cadena
  // de base y la aplicación apunten a proyectos distintos significa que
  // una de las dos está mal, y no se puede saber cuál desde acá.
  if (!refDeLaApp || !refDeLaBase || refDeLaApp !== refDeLaBase) {
    return {
      estado: 'proyecto-equivocado',
      codigo: CODIGOS.BLOQUEO,
      titulo: 'La cadena de base y la aplicación apuntan a proyectos distintos',
      detalle: [
        `La aplicación usa  : ${refDeLaApp || '(no se pudo leer)'}`,
        `La cadena de base  : ${refDeLaBase || '(no se pudo leer)'}`,
        'Una de las dos está mal. Corrige .env.local antes de seguir.',
      ],
      pendientes: [],
    };
  }

  // Producción se migra a propósito, no de paso. La bandera existe para
  // que quede escrito en el comando que alguien lo decidió.
  if (entorno === 'produccion' && !permitirProduccion) {
    return {
      estado: 'entorno-equivocado',
      codigo: CODIGOS.BLOQUEO,
      titulo: 'Esto es producción',
      detalle: [
        'NEXT_PUBLIC_ENTORNO dice «produccion».',
        'Si de verdad corresponde, vuelve a correrlo con --permitir-produccion',
        'y con una copia de seguridad hecha.',
      ],
      pendientes: [],
    };
  }

  const pendientes = enDisco.filter((v) => !aplicadas.includes(v));

  // Una migración aplicada que no está en el repositorio es la señal de
  // que alguien migró desde otro lado, o de que se borró un archivo. No
  // bloquea —no hay nada que romper— pero hay que decirlo.
  const desconocidas = aplicadas.filter((v) => !enDisco.includes(v));

  if (tablas === 0) {
    return {
      estado: 'base-nueva',
      codigo: CODIGOS.CONTINUAR,
      titulo: 'La base está vacía: es la primera migración',
      detalle: ['Ninguna tabla en el esquema público.'],
      pendientes,
      desconocidas,
    };
  }

  if (pendientes.length === 0) {
    return {
      estado: 'al-dia',
      codigo: CODIGOS.CONTINUAR,
      titulo: `Al día: ${aplicadas.length} migraciones aplicadas, ninguna pendiente`,
      detalle: [
        `${tablas} tablas en el esquema público.`,
        'No hay nada que aplicar. Correr db:push no haría nada.',
      ],
      pendientes: [],
      desconocidas,
    };
  }

  return {
    estado: 'con-pendientes',
    codigo: CODIGOS.CONTINUAR,
    titulo: `${pendientes.length} migración(es) pendiente(s)`,
    detalle: [
      `${aplicadas.length} aplicadas · ${enDisco.length} en el repositorio · ${tablas} tablas.`,
      'Es el proyecto correcto y el entorno correcto. Se puede migrar.',
    ],
    pendientes,
    desconocidas,
  };
}

/** La referencia del proyecto que hay dentro de un anfitrión de Supabase. */
export function referenciaDe(anfitrion) {
  if (!anfitrion) return null;

  // `abcdefgh.supabase.co`            → la aplicación
  // `db.abcdefgh.supabase.co`         → la conexión directa
  const conSupabase = anfitrion.match(/^(?:db\.)?([a-z0-9]+)\.supabase\.(?:co|net)$/i);
  if (conSupabase) return conSupabase[1];

  return null;
}

/**
 * La referencia que lleva el usuario del *pooler*: `postgres.<referencia>`.
 *
 * Hace falta porque en el pooler el anfitrión es regional y compartido
 * —`aws-0-us-east-2.pooler.supabase.com`— y no dice a qué proyecto se
 * conecta uno. Lo único que lo dice es el usuario.
 */
export function referenciaDeUsuario(usuario) {
  if (!usuario) return null;
  const m = usuario.match(/^postgres\.([a-z0-9]+)$/i);
  return m ? m[1] : null;
}
