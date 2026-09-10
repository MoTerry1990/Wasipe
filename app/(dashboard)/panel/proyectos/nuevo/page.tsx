import { redirect } from 'next/navigation';
import Link from 'next/link';
import { membresiaActual } from '@/lib/proyectos/permisos';
import { FormularioInformacion } from '@/features/proyectos/formulario-informacion';
import { crearBorrador } from '@/features/proyectos/acciones';

export const metadata = { title: 'Nuevo proyecto' };

/**
 * Crear un proyecto.
 *
 * Nace como borrador y no hay forma de que nazca de otra manera: lo
 * impide un disparador en la base, no esta pantalla. Acá solo se pide lo
 * necesario para que exista; las tipologías y el resto se completan
 * después, guardando cuando se quiera.
 *
 * Quien no administra la inmobiliaria no llega: se lo devuelve a la
 * lista. La acción vuelve a comprobarlo igual, porque se la puede llamar
 * sin pasar por acá.
 */
export default async function NuevoProyecto() {
  const resultado = await membresiaActual('/panel/proyectos/nuevo');
  // Cualquier caso que no sea «una inmobiliaria y la administro» vuelve a
  // la lista, que es donde el motivo se explica.
  if (resultado.tipo !== 'una' || !resultado.membresia.administra) redirect('/panel/proyectos');

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/panel/proyectos" className="text-tinta-60 hover:text-tinta text-[14px] font-semibold">
        ← Volver a proyectos
      </Link>

      <h1 className="mt-3 text-3xl">Nuevo proyecto</h1>
      <p className="text-tinta-60 mt-2">
        Se guarda como borrador. Nadie lo ve hasta que lo completes y pase por revisión.
      </p>

      <div className="mt-7">
        <FormularioInformacion accion={crearBorrador} etiquetaBoton="Crear borrador" />
      </div>
    </div>
  );
}
