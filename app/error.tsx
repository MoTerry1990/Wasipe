'use client';

import { useEffect } from 'react';
import { Contenedor } from '@/components/ui/contenedor';
import { EstadoError } from '@/components/estados/estado-error';

export default function ErrorGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sin Sentry todavía: al menos queda en la consola del servidor.
    console.error('[error]', error);
  }, [error]);

  return (
    <Contenedor className="py-16">
      <EstadoError
        titulo="Algo falló de nuestro lado"
        mensaje="Ya lo estamos viendo. Puedes reintentar en un momento."
        reintentar={reset}
      />
    </Contenedor>
  );
}
