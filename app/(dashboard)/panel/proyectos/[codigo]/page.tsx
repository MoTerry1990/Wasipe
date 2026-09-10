import Link from 'next/link';
import { notFound } from 'next/navigation';
import { clienteServidor } from '@/lib/supabase/servidor';
import { membresiaActual } from '@/lib/proyectos/permisos';
import { Tarjeta } from '@/components/ui/tarjeta';
import { EstadoDeProyecto } from '@/features/proyectos/estado';
import { FormularioInformacion } from '@/features/proyectos/formulario-informacion';
import { Tipologias } from '@/features/proyectos/tipologias';
import { guardarInformacion } from '@/features/proyectos/acciones';
import { ETIQUETA_ETAPA } from '@/lib/validacion/proyecto';
import type { Proyecto, TipologiaDeProyecto } from '@/types/base-datos';

export const metadata = { title: 'Proyecto' };

/**
 * El editor de un proyecto.
 *
 * Se llega por el código —`PRY-000001`— y no por el id: es lo que la
 * persona ve en la lista y lo que puede escribir para volver.
 *
 * Un `agent` abre esta pantalla en modo lectura. No se le muestran los
 * formularios, y si llamara a una acción directamente la acción lo
 * rechaza: ocultar no es autorizar.
 *
 * Lo que **no** hay acá todavía, a propósito: enviar a revisión (25D),
 * fotos (25C) y consultas (25F). Un botón que no funciona es peor que
 * uno que no está.
 */
export default async function EditorDeProyecto({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const resultado = await membresiaActual('/panel/proyectos');
  if (resultado.tipo !== 'una') notFound();
  const membresia = resultado.membresia;

  const supabase = await clienteServidor();

  // La RLS decide si esta fila se ve. Si es de otra inmobiliaria, no
  // aparece, y acá se convierte en un 404 —no en un «no tienes permiso»,
  // que le confirmaría a un extraño que el proyecto existe.
  const { data } = await supabase.from('projects').select('*').eq('code', codigo).maybeSingle();
  if (!data) notFound();
  const proyecto = data as Proyecto;

  const { data: filas } = await supabase
    .from('project_typologies')
    .select('*')
    .eq('project_id', proyecto.id)
    .order('sort_order')
    .order('created_at');

  const tipologias = (filas ?? []) as TipologiaDeProyecto[];
  // Este sprint edita borradores y nada más. Cuando el proyecto salga de
  // borrador, la pantalla pasa a lectura aunque quien mire lo administre;
  // qué se puede tocar después de publicar lo define 25D.
  const esBorrador = proyecto.publication_status === 'draft';
  const puedeEditar = membresia.administra && esBorrador;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/panel/proyectos" className="text-tinta-60 hover:text-tinta text-[14px] font-semibold">
        ← Volver a proyectos
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl">{proyecto.name}</h1>
          <p className="text-tinta-60 mt-1 text-[14.5px]">
            <span className="cifra">{proyecto.code}</span> · {proyecto.district} ·{' '}
            {ETIQUETA_ETAPA[proyecto.stage]}
          </p>
        </div>
        <EstadoDeProyecto estado={proyecto.publication_status} />
      </div>

      {!puedeEditar && (
        <Tarjeta className="mt-5 p-5">
          <p className="text-tinta-60 text-[14.5px]">
            {!membresia.administra
              ? 'Estás viendo este proyecto como corredor. Puedes consultarlo entero, pero editarlo es cosa de quien administra la inmobiliaria.'
              : 'Este proyecto ya salió de borrador. Por ahora solo se pueden editar los borradores.'}
          </p>
        </Tarjeta>
      )}

      <div className="mt-7 flex flex-col gap-8">
        {puedeEditar ? (
          <FormularioInformacion accion={guardarInformacion} proyecto={proyecto} />
        ) : (
          <ResumenDeLectura proyecto={proyecto} />
        )}

        <Tipologias codigo={proyecto.code} tipologias={tipologias} puedeEditar={puedeEditar} />
      </div>
    </div>
  );
}

/** La misma información, sin formularios, para quien solo mira. */
function ResumenDeLectura({ proyecto }: { proyecto: Proyecto }) {
  const filas: [string, string][] = [
    ['Etapa', ETIQUETA_ETAPA[proyecto.stage]],
    [
      'Entrega estimada',
      proyecto.delivery_estimate ? proyecto.delivery_estimate.slice(0, 7) : 'Sin definir',
    ],
    ['Dónde', `${proyecto.district}, ${proyecto.province}, ${proyecto.department}`],
    ['Dirección', proyecto.address ?? 'Sin definir'],
    ['Ubigeo', proyecto.ubigeo ?? 'Sin definir'],
  ];

  return (
    <Tarjeta className="flex flex-col gap-4 p-5 sm:p-6">
      <h2 className="text-lg">Sobre el proyecto</h2>
      {proyecto.description && (
        <p className="text-tinta-60 text-[15px] whitespace-pre-line">{proyecto.description}</p>
      )}
      <dl className="grid gap-3 sm:grid-cols-2">
        {filas.map(([clave, valor]) => (
          <div key={clave} className="min-w-0">
            <dt className="text-tinta-45 text-[13px] font-semibold">{clave}</dt>
            <dd className="text-tinta text-[15px]">{valor}</dd>
          </div>
        ))}
      </dl>
    </Tarjeta>
  );
}
