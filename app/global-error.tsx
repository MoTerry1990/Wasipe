'use client';

import { useEffect } from 'react';

/**
 * El error que rompe hasta el layout.
 *
 * `error.tsx` cubre los fallos dentro de una página; este cubre los que
 * se caen en el layout raíz, cuando ya no hay encabezado ni pie ni
 * estilos garantizados. Por eso lleva su propio `<html>` y `<body>` y los
 * estilos en línea: si el fallo fue al cargar la hoja de estilos, una
 * clase de Tailwind acá no pintaría nada y la persona vería texto negro
 * sobre blanco sin formato.
 *
 * Es la última red. Casi nunca se ve, y justamente por eso tiene que
 * funcionar sin depender de nada.
 */
export default function ErrorDeRaiz({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[error de raíz]', error);
  }, [error]);

  return (
    <html lang="es-PE">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: '#FFFBF5',
          color: '#12212B',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <main style={{ maxWidth: 520, textAlign: 'center' }}>
          <p style={{ color: '#D6236E', fontWeight: 800, letterSpacing: 1, margin: 0 }}>
            WASIPE
          </p>

          <h1 style={{ fontSize: 28, lineHeight: 1.2, marginTop: 12 }}>
            Algo se rompió de nuestro lado
          </h1>

          <p style={{ color: '#6F7F8C', marginTop: 12, lineHeight: 1.5 }}>
            No es tu conexión ni algo que hayas hecho. Vuelve a intentarlo; si sigue igual,
            escríbenos a hola@wasipe.pe.
          </p>

          {/* El identificador sirve para encontrar el fallo en los
              registros. Se muestra porque es lo único que la persona puede
              darnos si escribe, y no dice nada de nadie. */}
          {error.digest && (
            <p style={{ color: '#8494A1', marginTop: 16, fontSize: 13 }}>
              Código del error: {error.digest}
            </p>
          )}

          <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              type="button"
              onClick={reset}
              style={{
                background: '#D6236E',
                color: 'white',
                border: 0,
                borderRadius: 12,
                padding: '12px 20px',
                fontWeight: 700,
                fontSize: 15,
                cursor: 'pointer',
              }}
            >
              Reintentar
            </button>

            {/* Un `<a>` de verdad y no `<Link />`: acá el árbol de React
                ya se cayó, así que una navegación del cliente puede no
                llegar a ocurrir. Una recarga completa es lo único que se
                puede garantizar en esta pantalla. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                border: '1.5px solid #E3E8EC',
                borderRadius: 12,
                padding: '12px 20px',
                fontWeight: 700,
                fontSize: 15,
                color: '#12212B',
                textDecoration: 'none',
                background: 'white',
              }}
            >
              Ir al inicio
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
