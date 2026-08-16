import type { Filtros } from '@/lib/busqueda/filtros';
import type { Chip, Objecion } from '@/lib/ia/conversacion';

/**
 * Lo que la búsqueda conversacional le devuelve a la pantalla.
 *
 * En su propio archivo porque un módulo `'use server'` solo puede
 * exportar funciones asíncronas.
 */
export type Interpretacion = {
  /** La frase, tal como se escribió. */
  consulta: string;
  filtros: Filtros;
  /** Lo entendido, en castellano y quitable de a uno. */
  chips: Chip[];
  /** La URL de resultados. Los avisos los trae Postgres, no la IA. */
  url: string;
  /** Qué parte del pedido no se puede usar, y por qué. */
  objeciones: Objecion[];
  aviso: string;
  /** true cuando la traducción la afinó un modelo, además del parser. */
  conModelo: boolean;
};

export type RespuestaDeInterpretacion =
  { ok: true; interpretacion: Interpretacion } | { ok: false; mensaje: string };
