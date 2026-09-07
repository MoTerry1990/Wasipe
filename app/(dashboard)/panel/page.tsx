import Link from 'next/link';
import { requiereCuentaLista } from '@/lib/auth/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import { puedePublicar, esInmobiliaria } from '@/lib/auth/roles';
import { ROL } from '@/lib/etiquetas';
import { Tarjeta } from '@/components/ui/tarjeta';
import { Boton } from '@/components/ui/boton';
import { Aviso } from '@/components/estados/estado-error';

export const metadata = { title: 'Resumen' };

/**
 * Resumen del panel.
 *
 * Las cifras salen de la base con la sesión de la persona, así que la
 * RLS ya filtró: aunque esta consulta no llevara ningún `where`, no
 * podría contar avisos ajenos.
 */
export default async function Panel({
  searchParams,
}: {
  searchParams: Promise<{ bienvenida?: string; clave?: string }>;
}) {
  const perfil = await requiereCuentaLista();
  const parametros = await searchParams;
  const supabase = await clienteServidor();

  const [avisos, favoritos, consultas] = await Promise.all([
    // Los dos filtros son necesarios y ninguno sobra.
    //
    // Sin `owner_id`, esta consulta cuenta todo lo que RLS le deja ver a
    // quien pregunta: los avisos publicados de todo el mundo más los
    // suyos. Y nunca falla, así que no se nota — a Rosa, con tres avisos,
    // el panel le decía ocho. RLS acota lo que se puede leer; no dice de
    // quién es. Esa parte la pone la consulta, siempre.
    //
    // Sin `publication_status`, el número deja de ser el que dice la
    // etiqueta: entrarían borradores y avisos en revisión.
    supabase
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', perfil.id)
      .eq('publication_status', 'published'),
    supabase.from('favorites').select('property_id', { count: 'exact', head: true }),
    supabase.from('inquiries').select('id', { count: 'exact', head: true }).eq('status', 'new'),
  ]);

  const primerNombre = perfil.full_name.split(' ')[0] ?? perfil.full_name;

  const cifras = [
    ...(puedePublicar(perfil.role)
      ? [
          {
            valor: avisos.count ?? 0,
            texto: 'avisos publicados',
            href: '/panel/mis-propiedades',
          },
          {
            valor: consultas.count ?? 0,
            texto: 'consultas sin leer',
            href: '/panel/contactos',
          },
        ]
      : []),
    { valor: favoritos.count ?? 0, texto: 'favoritos guardados', href: '/panel/favoritos' },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      {parametros.bienvenida === 'lista' && (
        <div className="mb-6">
          <Aviso tono="bien">
            Listo, {primerNombre}. Tu cuenta quedó configurada como{' '}
            {ROL[perfil.role].toLowerCase()}.
          </Aviso>
        </div>
      )}

      {parametros.clave === 'lista' && (
        <div className="mb-6">
          <Aviso tono="bien">Cambiamos tu contraseña. Ya puedes seguir usando tu cuenta.</Aviso>
        </div>
      )}

      <h1 className="text-3xl">Hola, {primerNombre}</h1>
      <p className="text-tinta-60 mt-2">
        {puedePublicar(perfil.role)
          ? 'Acá manejas tus avisos, tus contactos y tus alertas.'
          : 'Acá guardas lo que te interesa y configuras tus alertas.'}
      </p>

      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        {cifras.map((cifra) => (
          <Link key={cifra.href} href={cifra.href} className="rounded-marca">
            <Tarjeta interactiva className="p-5">
              <p className="cifra text-tinta text-3xl font-bold">{cifra.valor}</p>
              <p className="text-tinta-60 mt-1 text-[14.5px]">{cifra.texto}</p>
            </Tarjeta>
          </Link>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        {puedePublicar(perfil.role) ? (
          <Boton href="/publicar" tamano="lg">
            Publicar un aviso
          </Boton>
        ) : (
          <Boton href="/comprar" tamano="lg">
            Ver departamentos y casas
          </Boton>
        )}
        <Boton href="/panel/configuracion" variante="secundario" tamano="lg">
          Editar mi perfil
        </Boton>
      </div>

      {esInmobiliaria(perfil.role) && (
        <Tarjeta className="mt-8 p-6">
          <h2 className="text-lg">Tu inmobiliaria</h2>
          <p className="text-tinta-60 mt-1.5 text-[14.5px]">
            Configura los datos de la empresa, el logo y el equipo de corredores.
          </p>
          <div className="mt-4">
            <Boton href="/panel/inmobiliaria" variante="secundario">
              Ir a la inmobiliaria
            </Boton>
          </div>
        </Tarjeta>
      )}
    </div>
  );
}
