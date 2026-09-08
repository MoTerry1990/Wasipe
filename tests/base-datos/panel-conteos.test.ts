import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { levantarBanco, sembrar, CUENTAS, type Banco } from './banco';

/**
 * Las cifras del resumen del panel cuentan lo de cada quien.
 *
 * El panel le decía a Rosa «8 avisos publicados» cuando tiene tres. Ocho
 * era el total del portal. La consulta no filtraba por `owner_id` ni por
 * `publication_status`:
 *
 *     supabase.from('properties').select('id', { count: 'exact', head: true })
 *
 * Y el comentario del archivo afirmaba que no hacía falta, porque «la RLS
 * ya filtró». Eso es lo que hay que desarmar acá, porque suena razonable
 * y es falso: **RLS acota lo que se puede leer, no dice de quién es.** Un
 * aviso publicado de otra persona es legible a propósito —para eso existe
 * el portal— y contarlo como propio es la aplicación equivocándose.
 *
 * Por eso nunca hubo un error: la consulta no fallaba, contaba de más.
 *
 * La primera prueba reproduce la consulta vieja y comprueba que **cuenta
 * de más**. Sin ella, las otras pasarían igual con el `where` puesto por
 * casualidad y nadie sabría qué se está protegiendo.
 */

let banco: Banco;

beforeAll(async () => {
  banco = await levantarBanco();
  await sembrar(banco);
});

afterAll(async () => {
  await banco.cerrar();
});

/** La consulta vieja: sin decir de quién ni en qué estado. */
const comoAntes = (usuario: string) =>
  banco.comoUsuario(usuario, async (db) => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.properties`,
    );
    return Number(rows[0]!.n);
  });

/** La consulta corregida, con los dos filtros que lleva el panel. */
const comoAhora = (usuario: string) =>
  banco.comoUsuario(usuario, async (db) => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n
         from public.properties
        where owner_id = $1
          and publication_status = 'published'`,
      [usuario],
    );
    return Number(rows[0]!.n);
  });

/** Lo que de verdad tiene cada quien, mirado sin RLS de por medio. */
const deVerdad = (usuario: string) =>
  banco.comoServicio(async (db) => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n
         from public.properties
        where owner_id = $1
          and publication_status = 'published'`,
      [usuario],
    );
    return Number(rows[0]!.n);
  });

describe('el resumen del panel', () => {
  it('la consulta vieja contaba de más: ese era el defecto', async () => {
    const contadoAntes = await comoAntes(CUENTAS.rosa);
    const suyos = await deVerdad(CUENTAS.rosa);

    expect(contadoAntes).toBeGreaterThan(suyos);
  });

  it('cada propietaria ve su propio conteo', async () => {
    for (const usuario of [CUENTAS.rosa, CUENTAS.lucia]) {
      expect(await comoAhora(usuario)).toBe(await deVerdad(usuario));
    }
  });

  it('y los conteos de las dos no son el mismo número', async () => {
    // Si Rosa y Lucía vieran lo mismo, la prueba de arriba podría estar
    // pasando porque las dos ven el total del portal.
    const rosa = await comoAhora(CUENTAS.rosa);
    const lucia = await comoAhora(CUENTAS.lucia);

    expect(rosa).not.toBe(lucia);
    expect(rosa).toBeGreaterThan(0);
    expect(lucia).toBeGreaterThan(0);
  });

  it('un aviso en revisión no cuenta como publicado', async () => {
    const antes = await comoAhora(CUENTAS.rosa);

    const suyo = await banco.comoServicio(async (db) => {
      const { rows } = await db.query<{ id: string }>(
        `select id from public.properties
          where owner_id = $1 and publication_status = 'published' limit 1`,
        [CUENTAS.rosa],
      );
      return rows[0]!.id;
    });

    await banco.comoServicio((db) =>
      db.query(`update public.properties set publication_status = 'paused' where id = $1`, [
        suyo,
      ]),
    );

    expect(await comoAhora(CUENTAS.rosa)).toBe(antes - 1);

    await banco.comoServicio((db) =>
      db.query(`update public.properties set publication_status = 'published' where id = $1`, [
        suyo,
      ]),
    );
  });

  it('los favoritos también se cuentan por dueño', async () => {
    const suyos = await banco.comoUsuario(CUENTAS.lucia, async (db) => {
      const { rows } = await db.query<{ n: number }>(
        `select count(*)::int as n from public.favorites where user_id = $1`,
        [CUENTAS.lucia],
      );
      return Number(rows[0]!.n);
    });

    const reales = await banco.comoServicio(async (db) => {
      const { rows } = await db.query<{ n: number }>(
        `select count(*)::int as n from public.favorites where user_id = $1`,
        [CUENTAS.lucia],
      );
      return Number(rows[0]!.n);
    });

    expect(suyos).toBe(reales);
  });
});
