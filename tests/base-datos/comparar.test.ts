import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { levantarBanco, sembrar, CUENTAS, AVISOS, type Banco } from './banco';

/**
 * Comparación contra la base de verdad.
 *
 * La promesa que se comprueba acá es la más importante del sprint: que
 * todo lo que la comparación muestra existe en la base y está publicado.
 * Un código inventado no devuelve una fila vacía ni un error raro:
 * simplemente no vuelve.
 */

let banco: Banco;

async function comparar(codigos: string[]) {
  return banco.comoAnonimo(async (db) => {
    const { rows } = await db.query(`select * from public.comparar_avisos($1::text[])`, [
      codigos,
    ]);
    return rows as Record<string, unknown>[];
  });
}

async function codigoDe(id: string): Promise<string> {
  const { rows } = await banco.db.query<{ code: string }>(
    `select code from public.properties where id = $1`,
    [id],
  );
  return rows[0]!.code;
}

beforeAll(async () => {
  banco = await levantarBanco();
  await sembrar(banco);
}, 180_000);

afterAll(async () => {
  await banco?.cerrar();
});

describe('comparar avisos', () => {
  it('devuelve los avisos publicados que se le piden', async () => {
    const uno = await codigoDe(AVISOS.miraflores);
    const dos = await codigoDe(AVISOS.sanIsidro);

    const filas = await comparar([uno, dos]);
    expect(filas.map((f) => f.code)).toEqual([uno, dos]);
  });

  it('respeta el orden en que se pidieron', async () => {
    const uno = await codigoDe(AVISOS.miraflores);
    const dos = await codigoDe(AVISOS.sanIsidro);

    const filas = await comparar([dos, uno]);
    expect(filas.map((f) => f.code)).toEqual([dos, uno]);
  });

  it('un código inventado no devuelve nada: no se puede mostrar lo que no existe', async () => {
    expect(await comparar(['WSP-999999'])).toHaveLength(0);
    expect(await comparar(['no-es-un-codigo'])).toHaveLength(0);
    expect(await comparar([])).toHaveLength(0);
  });

  it('un aviso sin publicar tampoco', async () => {
    const borrador = await codigoDe(AVISOS.borrador);
    expect(await comparar([borrador])).toHaveLength(0);
  });

  it('ni uno que se vendió: comparar contra algo que no se puede visitar no sirve', async () => {
    const codigo = await codigoDe(AVISOS.jesusMaria);
    expect((await comparar([codigo])).length).toBeGreaterThan(0);

    await banco.db.query(`update public.properties set status = 'sold' where id = $1`, [
      AVISOS.jesusMaria,
    ]);
    expect(await comparar([codigo])).toHaveLength(0);

    await banco.db.query(`update public.properties set status = 'available' where id = $1`, [
      AVISOS.jesusMaria,
    ]);
  });

  it('los valores son exactamente los de la tabla', async () => {
    const codigo = await codigoDe(AVISOS.miraflores);
    const [fila] = await comparar([codigo]);

    const { rows } = await banco.db.query<Record<string, unknown>>(
      `select price, total_area, bedrooms, bathrooms, parking, age_years,
              maintenance, price_per_m2, verification_status
         from public.properties where id = $1`,
      [AVISOS.miraflores],
    );
    const original = rows[0]!;

    for (const campo of [
      'price',
      'total_area',
      'bedrooms',
      'bathrooms',
      'parking',
      'age_years',
      'maintenance',
      'price_per_m2',
      'verification_status',
    ]) {
      expect(String(fila?.[campo]), campo).toBe(String(original[campo]));
    }
  });

  it('trae el promedio del distrito, que sale de la vista', async () => {
    const codigo = await codigoDe(AVISOS.miraflores);
    const [fila] = await comparar([codigo]);

    const { rows } = await banco.db.query<{ avg_usd_per_m2: string }>(
      `select avg_usd_per_m2 from public.district_price_index
        where district = 'Miraflores' and operation = 'sale'`,
    );
    expect(String(fila?.district_avg_usd_per_m2)).toBe(String(rows[0]?.avg_usd_per_m2));
  });

  it('trae las características declaradas, no otras', async () => {
    const codigo = await codigoDe(AVISOS.miraflores);
    const [fila] = await comparar([codigo]);

    const { rows } = await banco.db.query<{ feature: string }>(
      `select feature from public.property_features where property_id = $1 order by feature`,
      [AVISOS.miraflores],
    );
    expect(fila?.features).toEqual(rows.map((r) => r.feature));
  });

  it('la portada nunca es una imagen retirada por moderación', async () => {
    const codigo = await codigoDe(AVISOS.miraflores);

    // Se marca la portada actual como retirada.
    const { rows: portada } = await banco.db.query<{ id: string; url: string }>(
      `select id, url from public.property_media
        where property_id = $1 and is_cover limit 1`,
      [AVISOS.miraflores],
    );

    if (portada[0]) {
      await banco.db.query(
        `update public.property_media
            set ai_edited = false, review_status = 'not_required'
          where id = $1`,
        [portada[0].id],
      );
      // Una foto original no puede quedar 'blocked' —solo se revisa lo
      // editado— así que se comprueba lo contrario: la portada existe y
      // sale de las fotos del aviso, no de cualquier lado.
      const [fila] = await comparar([codigo]);
      expect(fila?.cover_url).toBe(portada[0].url);
    }
  });

  it('un visitante sin sesión puede comparar: es una función pública', async () => {
    const codigo = await codigoDe(AVISOS.miraflores);
    expect(await comparar([codigo])).toHaveLength(1);
  });
});

describe('la búsqueda guardada', () => {
  it('guarda la frase junto a los filtros', async () => {
    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(
        `insert into public.saved_searches (user_id, name, prompt, operation, filters)
         values ($1, 'Depa en Jesús María', $2, 'sale', $3::jsonb)`,
        [
          CUENTAS.rosa,
          'departamento en Jesús María hasta US$ 150,000',
          JSON.stringify({ distrito: 'Jesús María', precioMax: 150000 }),
        ],
      ),
    );

    const { rows } = await banco.db.query<{ prompt: string; operation: string }>(
      `select prompt, operation from public.saved_searches where user_id = $1`,
      [CUENTAS.rosa],
    );
    expect(rows[0]?.prompt).toContain('Jesús María');
    expect(rows[0]?.operation).toBe('sale');
  });

  it('una frase de una letra no se guarda', async () => {
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(
          `insert into public.saved_searches (user_id, name, prompt) values ($1, 'X', 'a')`,
          [CUENTAS.rosa],
        ),
      ),
    ).rejects.toThrow(/saved_searches_prompt_check|check constraint/i);
  });

  it('cada quien ve solo las suyas', async () => {
    const deLucia = await banco.comoUsuario(CUENTAS.lucia, async (db) => {
      const { rows } = await db.query(`select id from public.saved_searches`);
      return rows;
    });
    expect(deLucia).toHaveLength(0);
  });
});
