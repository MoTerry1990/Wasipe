import { ImageResponse } from 'next/og';

/**
 * La imagen que se ve cuando alguien comparte un enlace de Wasipe.
 *
 * En el Perú los avisos se pasan por WhatsApp, no por Twitter. Ahí lo que
 * se ve es esta imagen y una línea de texto, así que la imagen tiene que
 * decir lo que la persona necesita para decidir si abre: qué es, dónde y
 * cuánto. Un logo bonito no sirve para nada en ese momento.
 *
 * Se genera en el servidor y se cachea. No usa `next/font` ni fuentes
 * externas: `ImageResponse` corre en el runtime de borde y traer un
 * archivo de fuente por cada imagen es lo que más pesa. Con las fuentes
 * del sistema el texto sale bien y la imagen sale rápido.
 */

export const TAMANO_OG = { width: 1200, height: 630 };

const FUCSIA = '#D6236E';
const TINTA = '#12212B';
const CREMA = '#FFFBF5';

export type DatosDeVistaPrevia = {
  /** La línea grande. El título del aviso o de la landing. */
  titulo: string;
  /** Arriba a la izquierda: distrito, tipo, operación. */
  encima?: string;
  /** El número, si hay uno: el precio o el precio por m². */
  cifra?: string;
  /** Debajo de la cifra: «S/ 2,400 por m²», «34 avisos». */
  bajoLaCifra?: string;
};

export function vistaPreviaSocial(datos: DatosDeVistaPrevia) {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: CREMA,
        padding: 64,
        fontFamily: 'sans-serif',
      }}
    >
      {/* Una franja fucsia arriba: es lo que hace reconocible una tarjeta
            de Wasipe en una conversación llena de enlaces. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 12,
          background: FUCSIA,
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {datos.encima && (
          <div
            style={{
              fontSize: 28,
              color: FUCSIA,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            {datos.encima}
          </div>
        )}

        <div
          style={{
            fontSize: datos.titulo.length > 60 ? 56 : 68,
            lineHeight: 1.1,
            color: TINTA,
            fontWeight: 800,
            // Tres líneas como máximo: más que eso y el texto choca con
            // el precio de abajo en una pantalla de celular.
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {datos.titulo}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 32,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {datos.cifra && (
            <div style={{ fontSize: 64, color: TINTA, fontWeight: 800 }}>{datos.cifra}</div>
          )}
          {datos.bajoLaCifra && (
            <div style={{ fontSize: 28, color: '#6F7F8C', marginTop: 6 }}>
              {datos.bajoLaCifra}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <div style={{ fontSize: 44, color: FUCSIA, fontWeight: 800 }}>Wasipe</div>
          <div style={{ fontSize: 24, color: '#6F7F8C', marginTop: 2 }}>
            Ve el precio antes de preguntar
          </div>
        </div>
      </div>
    </div>,
    TAMANO_OG,
  );
}
