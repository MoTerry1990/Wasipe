import { z } from 'zod';

/**
 * Los mensajes de Zod, en español.
 *
 * Cada campo del asistente de publicación trae su propio mensaje escrito
 * a mano, y esos están bien. El problema es el mensaje **por defecto**:
 * el que sale cuando falla algo que nadie previó llega en inglés y con
 * vocabulario de programador.
 *
 * Pasó de verdad. El paso 1 de `/publicar` mostraba en pantalla:
 *
 *     Invalid input: expected string, received undefined
 *
 * El campo `tipo` se declara `z.string().refine(…, 'Elige qué tipo de
 * propiedad es')`, y **ese mensaje solo aplica si el valor ya es una
 * cadena**. Mientras no se elige nada el valor es `undefined`, falla el
 * `z.string()` de antes, y ahí habla Zod. El mismo patrón está en varios
 * campos más: cualquier `z.string()` sin mensaje propio que pueda llegar
 * vacío.
 *
 * Arreglarlos uno por uno dejaría el próximo sin cubrir. Esto cubre
 * todos, incluidos los que todavía no existen.
 *
 * Se importa desde `lib/validacion/aviso.ts` para que quede puesto antes
 * de que se construya cualquier esquema.
 */
z.config({
  customError: (asunto) => {
    switch (asunto.code) {
      case 'invalid_type':
        // Lo más común con diferencia: el campo está vacío.
        return asunto.input === undefined || asunto.input === null
          ? 'Falta completar este campo'
          : 'El valor no tiene el formato esperado';

      case 'too_small':
        return asunto.origin === 'string'
          ? `Escribe al menos ${asunto.minimum} caracteres`
          : `Tiene que ser ${asunto.minimum} o más`;

      case 'too_big':
        return asunto.origin === 'string'
          ? `No puede pasar de ${asunto.maximum} caracteres`
          : `Tiene que ser ${asunto.maximum} o menos`;

      case 'invalid_format':
        return 'El formato no es válido';

      case 'invalid_value':
        return 'Elige una de las opciones';

      case 'not_multiple_of':
        return 'El valor no es válido';

      case 'unrecognized_keys':
        return 'Hay campos que no corresponden';

      default:
        return 'Revisa este dato';
    }
  },
});
