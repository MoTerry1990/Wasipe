import type { Metadata } from 'next';
import {
  ContenidoNoEncontrado,
  METADATA_NO_ENCONTRADA,
} from '@/components/estados/pagina-no-encontrada';

export const metadata: Metadata = METADATA_NO_ENCONTRADA;

/**
 * El 404 de esta sección.
 *
 * Sin encabezado, sin `<main>` y sin pie **a propósito**: la plantilla del
 * grupo ya los dibuja alrededor. Sin este archivo, Next caía en el 404 de
 * raíz —que sí trae cromo propio— y salían dos encabezados, dos pies y
 * dos `<main id="contenido">` en la misma página. Ver P-34.
 */
export default function NoEncontrado() {
  return <ContenidoNoEncontrado />;
}
