import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { levantarBanco, sembrar, type Banco } from './banco';

/**
 * Buscar por zona, sin desdecir a quien eligió no mostrarla.
 *
 * El dato ya se pedía al publicar y se guardaba en
 * `property_locations.urbanization`. No se podía buscar por él, y no por
 * olvido: la búsqueda no toca esa tabla a propósito, porque ahí vive la
 * dirección exacta.
 *
 * La copia en `properties` resuelve eso, pero abre una pregunta que hay
 * que contestar bien: **una urbanización acota muchísimo más que un
 * distrito.** De «Miraflores» a «Chacarilla del Estanque» hay unas pocas
 * cuadras. Quien eligió `district_only` pidió que se supiera su distrito
 * y nada más; publicar su urbanización sería desdecir esa elección con
 * una función agregada después.
 *
 * Por eso la prueba que más importa acá no es la de buscar, sino la
 * última: que el aviso con `district_only` no aparezca nunca en un filtro
 * de zona, ni con el nombre exacto.
 */

let banco: Banco;

beforeAll(async () => {
  banco = await levantarBanco();
  await sembrar(banco);
});

afterAll(async () => {
  await banco.cerrar();
});

/** Lo que ve un visitante buscando por zona, como lo hace la consulta. */
const buscandoZona = (texto: string) =>
  banco.comoAnonimo(async (db) => {
    const { rows } = await db.query<{ code: string }>(
      `select code from public.properties
        where urbanization ilike $1
        order by code`,
      [`%${texto}%`],
    );
    return rows.map((r) => r.code);
  });

describe('el filtro por zona', () => {
  it('encuentra por el nombre de la urbanización', async () => {
    const encontrados = await buscandoZona('Olivar');
    expect(encontrados.length).toBeGreaterThan(0);
  });

  it('encuentra escribiendo solo un pedazo', async () => {
    // Nadie escribe «Chacarilla del Estanque» entero.
    const completo = await buscandoZona('Chacarilla del Estanque');
    const pedazo = await buscandoZona('chacarilla');

    expect(pedazo).toEqual(completo);
    expect(pedazo.length).toBeGreaterThan(0);
  });

  it('no distingue mayúsculas', async () => {
    expect(await buscandoZona('OLIVAR')).toEqual(await buscandoZona('olivar'));
  });
});

describe('la privacidad manda sobre la zona', () => {
  it('el aviso que eligió mostrar solo el distrito no tiene zona', async () => {
    const sinZona = await banco.comoServicio(async (db) => {
      const { rows } = await db.query<{ code: string; urbanization: string | null }>(
        `select code, urbanization from public.properties
          where address_privacy = 'district_only'`,
      );
      return rows;
    });

    expect(sinZona.length).toBeGreaterThan(0);
    for (const aviso of sinZona) expect(aviso.urbanization).toBeNull();
  });

  it('y su urbanización sigue guardada donde corresponde', async () => {
    // El dato no se pierde: sigue en la tabla de la dirección, que es de
    // quien publicó. Lo que no se hace es publicarlo.
    const guardadas = await banco.comoServicio(async (db) => {
      const { rows } = await db.query<{ n: number }>(
        `select count(*)::int as n
           from public.property_locations l
           join public.properties p on p.id = l.property_id
          where p.address_privacy = 'district_only'
            and l.urbanization is not null`,
      );
      return Number(rows[0]!.n);
    });

    expect(guardadas).toBeGreaterThan(0);
  });

  it('NO aparece en un filtro de zona, ni con el nombre exacto', async () => {
    const suUrbanizacion = await banco.comoServicio(async (db) => {
      const { rows } = await db.query<{ urbanization: string }>(
        `select l.urbanization
           from public.property_locations l
           join public.properties p on p.id = l.property_id
          where p.address_privacy = 'district_only'
            and l.urbanization is not null
          limit 1`,
      );
      return rows[0]!.urbanization;
    });

    const encontrados = await buscandoZona(suUrbanizacion);

    // Si esto falla, alguien copió la urbanización sin mirar la
    // privacidad y el aviso pasó de «Miraflores» a unas pocas cuadras.
    expect(encontrados).toEqual([]);
  });
});
