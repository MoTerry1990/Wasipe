import { PRIVACIDAD_DIRECCION } from '@/lib/etiquetas';
import type { PrivacidadDireccion } from '@/types/base-datos';

/**
 * Dónde queda, aproximadamente.
 *
 * El punto que llega acá ya viene desplazado unos 300 metros de la
 * dirección real, y así se dice. La dirección exacta vive en otra tabla
 * con su propia política y solo sale cuando quien publica lo autorizó.
 *
 * Los avisos publicados como «solo distrito» no muestran ningún punto:
 * poner un alfiler aproximado sería contradecir lo que pidió su dueño.
 *
 * LO QUE FALTA: la cartografía de fondo necesita un proveedor de mapas
 * con su clave. Mientras tanto se dibuja el círculo de la zona sobre un
 * fondo liso, que es honesto y sirve para ubicarse.
 */
export function MapaDelAviso({
  lat,
  lon,
  distrito,
  provincia,
  privacidad,
}: {
  lat: number | null;
  lon: number | null;
  distrito: string;
  provincia: string;
  privacidad: PrivacidadDireccion;
}) {
  const sinPunto = privacidad === 'district_only' || lat === null || lon === null;

  return (
    <section className="border-linea rounded-2xl border bg-white p-5">
      <h2 className="text-lg">Dónde queda</h2>
      <p className="text-tinta-60 mt-1 text-[14.5px]">
        {distrito}
        {provincia !== distrito ? `, ${provincia}` : ''} · {PRIVACIDAD_DIRECCION[privacidad]}
      </p>

      {sinPunto ? (
        <div className="border-linea bg-niebla text-tinta-60 mt-4 grid h-56 place-items-center rounded-xl border px-6 text-center text-[14.5px]">
          Quien publica eligió mostrar solo el distrito. Escríbele para coordinar una visita y
          conocer la dirección.
        </div>
      ) : (
        <>
          <div className="border-linea relative mt-4 h-56 overflow-hidden rounded-xl border bg-[linear-gradient(160deg,#E4F1FC,#F4F6F8)]">
            {/* Círculo de la zona: no un alfiler, que sugeriría precisión. */}
            <div className="absolute top-1/2 left-1/2 size-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-[color:var(--color-turquesa)] bg-[color:var(--color-turquesa)]/12" />
            <div className="bg-turquesa absolute top-1/2 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full" />
            <span className="text-tinta-60 absolute right-3 bottom-3 rounded-lg bg-white/90 px-2.5 py-1.5 text-[12px]">
              Ubicación aproximada
            </span>
          </div>
          <p className="text-tinta-45 mt-2 text-[12.5px]">
            El punto está desplazado unos 300 metros de la dirección real, para cuidar la
            privacidad de quien vive ahí.
          </p>
        </>
      )}
    </section>
  );
}
