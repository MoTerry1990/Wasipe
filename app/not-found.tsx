import type { Metadata } from 'next';
import { Encabezado } from '@/components/navegacion/encabezado';
import { Pie } from '@/components/navegacion/pie';
import {
  ContenidoNoEncontrado,
  METADATA_NO_ENCONTRADA,
} from '@/components/estados/pagina-no-encontrada';

export const metadata: Metadata = METADATA_NO_ENCONTRADA;

/**
 * El 404 de raíz: una dirección que no cae en ninguna sección.
 *
 * Next devuelve el estado 404 de verdad, que es la mitad del trabajo: una
 * página de «no existe» que responde 200 le enseña a Google que el sitio
 * tiene miles de páginas idénticas, y es de los errores más caros que
 * puede tener un portal.
 *
 * La otra mitad es no dejar a nadie parado. En un portal inmobiliario el
 * 404 más común es un aviso que se vendió, y quien llega ahí sigue
 * buscando departamento: por eso abajo van búsquedas de verdad y no un
 * botón de «volver al inicio» a secas.
 *
 * Este pone su propio encabezado y su propio pie porque cuelga de
 * `app/layout.tsx`, que no trae ninguno. Los 404 de cada grupo de rutas
 * NO deben ponerlos: la plantilla del grupo ya los puso.
 */
export default function NoEncontrado() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Encabezado />
      <main id="contenido" className="flex-1">
        <ContenidoNoEncontrado />
      </main>
      <Pie />
    </div>
  );
}
