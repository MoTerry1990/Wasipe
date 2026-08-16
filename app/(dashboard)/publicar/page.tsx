import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Contenedor } from '@/components/ui/contenedor';
import { EstadoVacio } from '@/components/estados/estado-vacio';
import { Asistente } from '@/features/publicar/asistente';
import { requiereCuentaLista } from '@/lib/auth/sesion';
import { puedePublicar } from '@/lib/auth/roles';
import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import type { BorradorDeAviso } from '@/lib/validacion/aviso';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Publicar una propiedad',
  description: 'Publica tu propiedad en Wasipe. Es gratis y no pedimos tarjeta.',
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ borrador?: string }> };

/**
 * Asistente de publicación.
 *
 * El borrador se carga en el servidor y se le pasa al asistente ya
 * hidratado. Por eso recargar no pierde nada: lo que se ve al volver es
 * exactamente lo último que se guardó, sin depender de nada que viva en
 * el navegador.
 */
export default async function Publicar({ searchParams }: Props) {
  const perfil = await requiereCuentaLista('/publicar');

  // Quien abrió su cuenta como comprador no publica. No es un error:
  // simplemente eligió otro tipo de cuenta al registrarse.
  if (!puedePublicar(perfil.role)) {
    return (
      <Contenedor className="py-10">
        <EstadoVacio
          titulo="Tu cuenta está configurada para buscar, no para publicar"
          descripcion="Cuando te registraste elegiste la cuenta de comprador. Escríbenos y la cambiamos: publicar sigue siendo gratis."
          accion={{ texto: 'Volver al panel', href: '/panel' }}
        />
      </Contenedor>
    );
  }

  if (!supabaseConfigurado()) {
    return (
      <Contenedor className="py-10">
        <EstadoVacio
          titulo="La publicación todavía no está conectada"
          descripcion="Falta enlazar el proyecto de Supabase. En cuanto esté, este asistente queda operativo."
          accion={{ texto: 'Volver al panel', href: '/panel' }}
        />
      </Contenedor>
    );
  }

  const { borrador: pedido } = await searchParams;
  const supabase = await clienteServidor();

  // Con un borrador pedido por la URL se abre ese; si no, el último que
  // quedó a medias. Empezar uno nuevo cada vez llenaría el panel de
  // borradores vacíos.
  const consulta = supabase
    .from('listing_drafts')
    .select('id, datos, paso, property_id')
    .order('updated_at', { ascending: false })
    .limit(1);

  const { data } = pedido
    ? await supabase
        .from('listing_drafts')
        .select('id, datos, paso, property_id')
        .eq('id', pedido)
        .maybeSingle()
        .then((r) => ({ data: r.data ? [r.data] : [] }))
    : await consulta;

  const borrador = data?.[0] ?? null;

  // Un borrador pedido que no existe —o que es de otra persona, y la RLS
  // no lo devuelve— manda al asistente limpio en vez de a un error.
  if (pedido && !borrador) redirect('/publicar');

  let avisoEnEdicion: { code: string; motivoRechazo: string | null } | null = null;

  if (borrador?.property_id) {
    const { data: aviso } = await supabase
      .from('properties')
      .select('code, rejection_reason')
      .eq('id', borrador.property_id)
      .maybeSingle();

    if (aviso) {
      avisoEnEdicion = { code: aviso.code, motivoRechazo: aviso.rejection_reason };
    }
  }

  return (
    <Contenedor className="py-7">
      <Asistente
        borradorInicial={borrador?.id ?? null}
        datosIniciales={(borrador?.datos ?? {}) as BorradorDeAviso}
        pasoInicial={borrador?.paso ?? 0}
        avisoEnEdicion={avisoEnEdicion}
      />
    </Contenedor>
  );
}
