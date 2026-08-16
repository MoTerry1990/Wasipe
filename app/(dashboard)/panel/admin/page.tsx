import Link from 'next/link';
import { requierePerfil } from '@/lib/auth/sesion';
import { puestosDeLaSesion } from '@/lib/auth/personal';
import { clienteServidor } from '@/lib/supabase/servidor';
import { supabaseConfigurado } from '@/lib/supabase/entorno';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import { EstadoVacio } from '@/components/estados/estado-vacio';
import { PUESTOS, seccionesDe } from '@/lib/admin/permisos';
import { numero } from '@/lib/formato';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Administración', robots: { index: false } };

/**
 * Panel de administración.
 *
 * Lo primero que se ve es qué hay pendiente, no un menú: quien entra acá
 * entra a resolver algo. Las secciones que este puesto no ve, no
 * aparecen; y las que todavía no existen se muestran apagadas en vez de
 * llevar a un 404.
 */
export default async function PanelAdmin() {
  await requierePerfil('/panel/admin');
  const puestos = await puestosDeLaSesion();

  if (puestos.length === 0) redirect('/panel?aviso=sin-permiso');

  const secciones = seccionesDe(puestos);
  const salud = await estadoDelSistema();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl">Administración</h1>
        {puestos.map((puesto) => (
          <Insignia key={puesto} tono="verde">
            {PUESTOS[puesto].etiqueta}
          </Insignia>
        ))}
      </div>
      <p className="text-tinta-60 mt-2">
        Solo ves las secciones de tu puesto. No es desconfianza: el dato personal de alguien no
        tiene por qué pasar por más manos de las necesarias.
      </p>

      {/* ------------------------------------------------ pendientes */}
      <h2 className="mt-8 mb-3 text-xl">Cómo está el sistema</h2>
      {salud ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Contador
            etiqueta="Avisos por revisar"
            valor={salud.enRevision}
            href="/panel/admin/avisos"
            alerta={salud.enRevision > 0}
          />
          <Contador
            etiqueta="Banderas abiertas"
            valor={salud.banderas}
            href="/panel/admin/banderas"
            alerta={salud.banderas > 0}
          />
          <Contador
            etiqueta="Denuncias abiertas"
            valor={salud.denuncias}
            href="/panel/admin/denuncias"
            alerta={salud.denuncias > 0}
          />
          <Contador
            etiqueta="Imágenes por revisar"
            valor={salud.imagenes}
            href="/panel/moderacion/imagenes"
            alerta={salud.imagenes > 0}
          />
          <Contador etiqueta="Avisos publicados" valor={salud.publicados} />
          <Contador etiqueta="Cuentas" valor={salud.cuentas} />
          <Contador
            etiqueta="Trabajos de IA fallidos"
            valor={salud.iaFallida}
            alerta={salud.iaFallida > 0}
          />
          <Contador
            etiqueta="Distritos con índice"
            valor={salud.distritos}
            href="/panel/moderacion/mercado"
          />
        </div>
      ) : (
        <EstadoVacio
          titulo="Sin conexión con la base"
          descripcion="Falta enlazar el proyecto de Supabase."
          accion={{ texto: 'Volver al panel', href: '/panel' }}
        />
      )}

      {/* ------------------------------------------------- secciones */}
      <h2 className="mt-9 mb-3 text-xl">Secciones</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {secciones.map((seccion) => (
          <li key={seccion.clave}>
            {seccion.construida ? (
              <Link href={seccion.href} className="block">
                <Tarjeta interactiva className="h-full p-4">
                  <p className="text-tinta text-[15px] font-bold">{seccion.titulo}</p>
                  <p className="text-tinta-60 mt-1 text-[13.5px]">{seccion.descripcion}</p>
                </Tarjeta>
              </Link>
            ) : (
              <Tarjeta className="h-full p-4 opacity-60">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-tinta text-[15px] font-bold">{seccion.titulo}</p>
                  <Insignia tono="neutro">Sin construir</Insignia>
                </div>
                <p className="text-tinta-60 mt-1 text-[13.5px]">{seccion.descripcion}</p>
              </Tarjeta>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Contador({
  etiqueta,
  valor,
  href,
  alerta,
}: {
  etiqueta: string;
  valor: number;
  href?: string;
  alerta?: boolean;
}) {
  const contenido = (
    <Tarjeta interactiva={Boolean(href)} className="h-full p-4">
      <p
        className={`cifra text-2xl font-extrabold ${alerta ? 'text-fucsia-osc' : 'text-tinta'}`}
      >
        {numero(valor)}
      </p>
      <p className="text-tinta-60 mt-0.5 text-[13px]">{etiqueta}</p>
    </Tarjeta>
  );

  return href ? <Link href={href}>{contenido}</Link> : contenido;
}

/**
 * Los contadores.
 *
 * Cuentas, no filas: `head: true` con `count` trae el número sin traer
 * los datos. Un panel de administración que se baja diez mil avisos para
 * mostrar «10 000» es lento y además expone datos que nadie pidió.
 */
async function estadoDelSistema() {
  if (!supabaseConfigurado()) return null;

  try {
    const supabase = await clienteServidor();
    const solo = { count: 'exact' as const, head: true };

    const [
      enRevision,
      publicados,
      banderas,
      denuncias,
      imagenes,
      cuentas,
      iaFallida,
      distritos,
    ] = await Promise.all([
      supabase.from('properties').select('*', solo).eq('publication_status', 'in_review'),
      supabase.from('properties').select('*', solo).eq('publication_status', 'published'),
      supabase.from('moderation_flags').select('*', solo).eq('status', 'open'),
      supabase.from('reports').select('*', solo).eq('status', 'open'),
      supabase.from('property_media').select('*', solo).eq('review_status', 'pending'),
      supabase.from('profiles').select('*', solo),
      supabase.from('ai_jobs').select('*', solo).eq('status', 'failed'),
      supabase
        .from('market_stats')
        .select('*', solo)
        .eq('sufficient', true)
        .is('property_type', null),
    ]);

    return {
      enRevision: enRevision.count ?? 0,
      publicados: publicados.count ?? 0,
      banderas: banderas.count ?? 0,
      denuncias: denuncias.count ?? 0,
      imagenes: imagenes.count ?? 0,
      cuentas: cuentas.count ?? 0,
      iaFallida: iaFallida.count ?? 0,
      distritos: distritos.count ?? 0,
    };
  } catch {
    return null;
  }
}
