import Link from 'next/link';
import { Contenedor } from '@/components/ui/contenedor';
import { Insignia } from '@/components/ui/tarjeta';
import { EstadoVacio } from '@/components/estados/estado-vacio';
import { SeccionAvisos, TituloSeccion } from '@/components/propiedades/seccion-avisos';
import { urlDeBusqueda } from '@/lib/catalogo';
import { convertir } from '@/lib/moneda';
import { dinero, numero } from '@/lib/formato';
import { DISTRITOS_POPULARES } from '@/config/sitio';
import {
  destacadas,
  recienPublicadas,
  bajaronDePrecio,
  proyectosNuevos,
  distritosConAvisos,
  precioPorMetroPorDistrito,
} from '@/lib/consultas/portada';
import type { Moneda } from '@/types/base-datos';

/**
 * Las secciones de la portada que dependen de la base.
 *
 * Cada una es un componente de servidor independiente, y la portada las
 * envuelve en su propio Suspense. Así el hero se ve al instante y las
 * secciones van apareciendo a medida que responden: si una tarda, no
 * arrastra a las demás.
 */

type Props = { moneda: Moneda; tipoDeCambio: number };

export async function Destacadas({ moneda, tipoDeCambio }: Props) {
  const avisos = await destacadas(6);

  return (
    <SeccionAvisos
      id="destacadas"
      titulo="Propiedades destacadas"
      descripcion="Avisos verificados por nuestro equipo: alguien de Wasipe comprobó que la propiedad existe y que sigue disponible."
      verTodo={{ texto: 'Ver todas', href: '/comprar' }}
      avisos={avisos}
      moneda={moneda}
      tipoDeCambio={tipoDeCambio}
      prioridad
      vacio={{
        titulo: 'Todavía no hay avisos verificados',
        descripcion:
          'La verificación arranca en cuanto haya avisos publicados. Mientras tanto, puedes ser el primero.',
      }}
    />
  );
}

export async function RecienPublicadas({ moneda, tipoDeCambio }: Props) {
  const avisos = await recienPublicadas(6);

  return (
    <SeccionAvisos
      titulo="Recién publicadas"
      descripcion="Lo último que entró al portal. Acá aparecen antes que en cualquier otro lado."
      verTodo={{ texto: 'Ver todas', href: '/comprar' }}
      avisos={avisos}
      moneda={moneda}
      tipoDeCambio={tipoDeCambio}
      className="bg-white py-10 sm:py-14"
      vacio={{
        titulo: 'Sé el primero en publicar',
        descripcion:
          'El portal acaba de abrir. Tu propiedad puede ser la primera que vean todos, y publicar es gratis.',
      }}
    />
  );
}

export async function BajaronDePrecio({ moneda, tipoDeCambio }: Props) {
  const avisos = await bajaronDePrecio(4);

  return (
    <SeccionAvisos
      titulo="Bajaron de precio"
      descripcion="Avisos cuyo dueño ajustó el precio hacia abajo. Es información que otros portales prefieren no mostrar."
      avisos={avisos}
      moneda={moneda}
      tipoDeCambio={tipoDeCambio}
      columnas={4}
      etiquetaDe={(aviso) => {
        const rebaja = (aviso as { bajaPorcentaje?: number }).bajaPorcentaje;
        return rebaja ? <Insignia tono="fucsia">Bajó {Math.round(rebaja)}%</Insignia> : null;
      }}
      vacio={{
        titulo: 'Ninguna propiedad bajó de precio esta semana',
        descripcion:
          'Cuando alguien ajuste el precio de su aviso, va a aparecer acá con el porcentaje y la fecha del cambio.',
        accion: { texto: 'Ver todas las propiedades', href: '/comprar' },
      }}
    />
  );
}

export async function ProyectosNuevos({ moneda, tipoDeCambio }: Props) {
  const avisos = await proyectosNuevos(4);

  return (
    <SeccionAvisos
      titulo="Proyectos nuevos"
      descripcion="Departamentos en preventa y en construcción, con el precio por m² a la vista para comparar contra lo ya construido."
      verTodo={{ texto: 'Ver proyectos', href: '/proyectos' }}
      avisos={avisos}
      moneda={moneda}
      tipoDeCambio={tipoDeCambio}
      columnas={4}
      className="bg-white py-10 sm:py-14"
      vacio={{
        titulo: 'Todavía no hay proyectos publicados',
        descripcion:
          '¿Eres constructora o inmobiliaria? Publicar tu proyecto es gratis mientras el portal está arrancando.',
      }}
    />
  );
}

/**
 * Distritos populares.
 *
 * Si la base todavía no tiene avisos, se muestran los distritos escritos
 * a mano: la sección sirve igual para navegar, y no aparece un hueco.
 */
export async function DistritosPopulares() {
  const conAvisos = await distritosConAvisos(8);

  const distritos =
    conAvisos.length > 0
      ? conAvisos.map((d) => ({
          nombre: d.district,
          slug: d.district,
          avisos: d.listings,
        }))
      : DISTRITOS_POPULARES.map((d) => ({ nombre: d.nombre, slug: d.slug, avisos: 0 }));

  return (
    <Contenedor as="section" className="py-10 sm:py-14">
      <TituloSeccion
        titulo="Distritos populares"
        descripcion="Los distritos donde más se busca hoy en el Perú."
      />

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" translate="no">
        {distritos.map((distrito) => (
          <li key={distrito.slug}>
            <Link
              href={urlDeBusqueda('sale', { donde: distrito.slug })}
              className="border-linea hover:border-fucsia hover:shadow-marca flex h-full flex-col gap-0.5 rounded-2xl border bg-white p-4 transition-[transform,border-color,box-shadow] hover:-translate-y-0.5"
            >
              <span className="font-display text-[15.5px] font-extrabold">
                {distrito.nombre}
              </span>
              <span className="text-tinta-60 text-[12.5px]">
                {distrito.avisos > 0
                  ? `${numero(distrito.avisos)} ${distrito.avisos === 1 ? 'aviso' : 'avisos'}`
                  : 'Ver propiedades'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Contenedor>
  );
}

/**
 * Precio promedio por m².
 *
 * Se muestra la mediana y no el promedio, y siempre con la cantidad de
 * avisos que la sostienen. Con pocos datos, un solo penthouse mueve el
 * promedio de todo un distrito; decir de cuántos avisos sale el número
 * es la diferencia entre informar y aparentar.
 */
export async function PrecioPromedioPorMetro({ moneda, tipoDeCambio }: Props) {
  const indice = await precioPorMetroPorDistrito(8);

  return (
    <Contenedor as="section" className="bg-white py-10 sm:py-14">
      <TituloSeccion
        titulo="Precio promedio por m²"
        descripcion="Cuánto cuesta el metro cuadrado en venta, distrito por distrito. Es el número con el que se compara de verdad."
        verTodo={{ texto: 'Ver el índice completo', href: '/precio-m2' }}
      />

      {indice.length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay datos suficientes"
          descripcion="El índice se arma con los avisos publicados. En cuanto haya avisos con área y precio, esta tabla se llena sola."
          accion={{ texto: 'Publicar mi propiedad', href: '/publicar' }}
        />
      ) : (
        <>
          <div className="border-linea overflow-x-auto rounded-2xl border bg-white">
            <table className="w-full min-w-[34rem] border-collapse text-left">
              <caption className="solo-lectores">
                Precio por metro cuadrado en venta, por distrito
              </caption>
              <thead>
                <tr className="border-linea text-tinta-45 border-b text-[12.5px] tracking-[0.06em] uppercase">
                  <th scope="col" className="px-4 py-3 font-bold">
                    Distrito
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-bold">
                    Mediana por m²
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-bold">
                    Promedio por m²
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-bold">
                    Avisos
                  </th>
                </tr>
              </thead>
              <tbody>
                {indice.map((fila) => (
                  <tr key={fila.district} className="border-linea border-b last:border-0">
                    <th scope="row" className="text-tinta px-4 py-3 font-bold" translate="no">
                      <Link
                        href={urlDeBusqueda('sale', { donde: fila.district })}
                        className="hover:text-fucsia"
                      >
                        {fila.district}
                      </Link>
                    </th>
                    <td className="cifra text-tinta px-4 py-3 text-right font-bold">
                      {fila.median_usd_per_m2 !== null
                        ? dinero(
                            Math.round(
                              convertir(fila.median_usd_per_m2, 'USD', moneda, tipoDeCambio),
                            ),
                            moneda,
                          )
                        : '—'}
                    </td>
                    <td className="cifra text-tinta-60 px-4 py-3 text-right">
                      {fila.avg_usd_per_m2 !== null
                        ? dinero(
                            Math.round(
                              convertir(fila.avg_usd_per_m2, 'USD', moneda, tipoDeCambio),
                            ),
                            moneda,
                          )
                        : '—'}
                    </td>
                    <td className="cifra text-tinta-60 px-4 py-3 text-right">
                      {numero(fila.listings)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-tinta-45 mt-3 text-[13px]">
            Calculado con los avisos publicados en Wasipe. Es una referencia de mercado, no una
            tasación oficial. Los distritos con pocos avisos pueden mostrar valores poco
            representativos: por eso va la cantidad al costado.
          </p>
        </>
      )}
    </Contenedor>
  );
}
