import Link from 'next/link';
import { requiereSeccion } from '@/lib/auth/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import { Tarjeta } from '@/components/ui/tarjeta';
import { EstadoVacio } from '@/components/estados/estado-vacio';
import { dinero, porMetro } from '@/lib/formato';
import { OPERACION, TIPO_INMUEBLE } from '@/lib/etiquetas';
import { enlaceDeAviso } from '@/lib/avisos/enlace';
import { NotaDelFavorito } from '@/features/preferencias/nota-favorito';
import type { Moneda, Operacion, TipoInmueble } from '@/types/base-datos';

export const metadata = { title: 'Favoritos' };

type AvisoFavorito = {
  id: string;
  code: string;
  title: string;
  district: string;
  operation: Operacion;
  property_type: TipoInmueble;
  currency: Moneda;
  price: number;
  price_per_m2: number | null;
  built_area: number | null;
  total_area: number;
};

export default async function Favoritos() {
  await requiereSeccion('/panel/favoritos');
  const supabase = await clienteServidor();

  // La política de favorites solo devuelve los de quien consulta, así que
  // no hace falta filtrar por usuario: la base ya lo hizo.
  const { data: guardados } = await supabase
    .from('favorites')
    .select(
      'property_id, note, created_at, properties (id, code, title, district, operation, property_type, currency, price, price_per_m2, built_area, total_area)',
    )
    .order('created_at', { ascending: false });

  const filas = (guardados ?? []).flatMap((fila) => {
    const aviso = fila.properties as unknown as AvisoFavorito | null;
    return aviso ? [{ ...fila, aviso }] : [];
  });

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-3xl">Favoritos</h1>
      <p className="text-tinta-60 mt-2">Lo que guardaste para volver a mirarlo con calma.</p>

      {filas.length === 0 ? (
        <div className="mt-7">
          <EstadoVacio
            titulo="Todavía no guardaste nada"
            descripcion="Cuando encuentres algo que te interese, toca el corazón y lo vas a encontrar acá."
            accion={{ texto: 'Ver departamentos y casas', href: '/comprar' }}
          />
        </div>
      ) : (
        <ul className="mt-7 grid gap-3 sm:grid-cols-2">
          {filas.map(({ property_id, note, aviso }) => (
            <li key={property_id}>
              <Tarjeta className="h-full p-5">
                <Link
                  href={enlaceDeAviso(aviso)}
                  className="text-tinta hover:text-fucsia text-[17px] font-bold"
                >
                  {aviso.title}
                </Link>
                <p className="text-tinta-60 mt-1 text-[14px]">
                  {TIPO_INMUEBLE[aviso.property_type]} en {aviso.district} ·{' '}
                  {OPERACION[aviso.operation]}
                </p>
                <p className="cifra text-tinta mt-3 text-xl font-bold">
                  {dinero(aviso.price, aviso.currency)}
                </p>
                {aviso.price_per_m2 !== null && (
                  <p className="cifra text-tinta-60 text-[13.5px]">
                    {porMetro(aviso.price_per_m2, aviso.currency)}
                  </p>
                )}
                <NotaDelFavorito avisoId={property_id} nota={note} />
              </Tarjeta>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
