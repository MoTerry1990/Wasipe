import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { levantarBanco, sembrar, CUENTAS, AVISOS, type Banco } from './banco';

/**
 * Cerrar un aviso: vendido, alquilado o retirado.
 *
 * Hasta el sprint 23B, `property_status` existía con sus cinco valores y
 * **nada en la aplicación lo escribía**. Quien vendía su departamento no
 * tenía forma de decirlo: el aviso se quedaba publicado hasta que alguien
 * lo pausara a mano o venciera a los noventa días.
 *
 * Estas pruebas cubren las dos mitades que importan y que son distintas:
 * que la transición solo se pueda hacer desde donde corresponde, y que un
 * aviso cerrado desaparezca de verdad de lo que ve el público. Lo segundo
 * no lo hace ninguna línea de código nueva: lo hace la política
 * `el publico ve los avisos publicados`, que ya exigía
 * `status = 'available'`. Si alguien la afloja, esto falla.
 */

let banco: Banco;

const AVISO_DE_ROSA = AVISOS.miraflores;
const AVISO_DE_LUCIA = AVISOS.barranco;

beforeAll(async () => {
  banco = await levantarBanco();
});

afterAll(async () => {
  await banco.cerrar();
});

beforeEach(async () => {
  await sembrar(banco);

  // La siembra es idempotente con `on conflict do nothing`, así que no
  // deshace lo que estas pruebas cambian: hay que devolver los dos avisos
  // a su estado inicial a mano. Sin esto, la segunda prueba corre sobre
  // lo que dejó la primera y el orden de ejecución decide el resultado.
  await banco.comoServicio((db) =>
    db.query(
      `update public.properties
          set status = 'available', publication_status = 'published'
        where id = any($1)`,
      [[AVISO_DE_ROSA, AVISO_DE_LUCIA]],
    ),
  );
});

const disponibilidadDe = async (aviso: string) =>
  banco.comoServicio(async (db) => {
    const { rows } = await db.query<{ status: string; publication_status: string }>(
      `select status, publication_status from public.properties where id = $1`,
      [aviso],
    );
    return rows[0]!;
  });

describe('quién puede cerrar', () => {
  it('la dueña cierra su aviso publicado', async () => {
    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`update public.properties set status = 'sold' where id = $1`, [AVISO_DE_ROSA]),
    );

    expect((await disponibilidadDe(AVISO_DE_ROSA)).status).toBe('sold');
  });

  it('los tres motivos valen', async () => {
    for (const motivo of ['sold', 'rented', 'withdrawn']) {
      await banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(`update public.properties set status = $2 where id = $1`, [
          AVISO_DE_ROSA,
          motivo,
        ]),
      );
      expect((await disponibilidadDe(AVISO_DE_ROSA)).status).toBe(motivo);

      // Se reabre para el siguiente motivo: reabrir también es un cambio
      // de disponibilidad y tiene que estar permitido.
      await banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(`update public.properties set status = 'available' where id = $1`, [
          AVISO_DE_ROSA,
        ]),
      );
    }
  });

  it('Lucía no puede cerrar el aviso de Rosa', async () => {
    await banco.comoUsuario(CUENTAS.lucia, (db) =>
      db.query(`update public.properties set status = 'sold' where id = $1`, [AVISO_DE_ROSA]),
    );

    // RLS no lanza: simplemente no alcanza ninguna fila. Comprobar que
    // «no falló» no sirve de nada; hay que mirar el dato.
    expect((await disponibilidadDe(AVISO_DE_ROSA)).status).toBe('available');
  });

  it('y cada quien sí cierra el suyo', async () => {
    await banco.comoUsuario(CUENTAS.lucia, (db) =>
      db.query(`update public.properties set status = 'rented' where id = $1`, [AVISO_DE_LUCIA]),
    );

    expect((await disponibilidadDe(AVISO_DE_LUCIA)).status).toBe('rented');
  });
});

describe('desde qué estado', () => {
  it('un borrador no se puede marcar como vendido', async () => {
    // Marcar vendido algo que nunca se publicó no significa nada, y
    // ensucia las estadísticas de mercado, que se calculan sobre cierres.
    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(`update public.properties set status = 'sold' where id = $1`, [AVISOS.borrador]),
      ),
    ).rejects.toThrow(/Solo se puede cerrar un aviso publicado o pausado/);
  });

  it('un aviso pausado sí', async () => {
    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`update public.properties set publication_status = 'paused' where id = $1`, [
        AVISO_DE_ROSA,
      ]),
    );

    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`update public.properties set status = 'sold' where id = $1`, [AVISO_DE_ROSA]),
    );

    expect((await disponibilidadDe(AVISO_DE_ROSA)).status).toBe('sold');
  });
});

describe('un aviso cerrado desaparece', () => {
  const loVe = async (aviso: string) =>
    banco.comoAnonimo(async (db) => {
      const { rows } = await db.query<{ n: number }>(
        `select count(*)::int as n from public.properties where id = $1`,
        [aviso],
      );
      return Number(rows[0]!.n) > 0;
    });

  it('un visitante lo ve mientras está disponible', async () => {
    expect(await loVe(AVISO_DE_ROSA)).toBe(true);
  });

  it('y deja de verlo apenas se cierra', async () => {
    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`update public.properties set status = 'sold' where id = $1`, [AVISO_DE_ROSA]),
    );

    expect(await loVe(AVISO_DE_ROSA)).toBe(false);
  });

  it('pero su dueña lo sigue viendo en su panel', async () => {
    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`update public.properties set status = 'sold' where id = $1`, [AVISO_DE_ROSA]),
    );

    const suyos = await banco.comoUsuario(CUENTAS.rosa, async (db) => {
      const { rows } = await db.query<{ n: number }>(
        `select count(*)::int as n from public.properties where id = $1`,
        [AVISO_DE_ROSA],
      );
      return Number(rows[0]!.n);
    });

    // Cerrar no es borrar: el historial y las consultas siguen siendo suyos.
    expect(suyos).toBe(1);
  });

  it('y vuelve a aparecer si lo reabre', async () => {
    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`update public.properties set status = 'sold' where id = $1`, [AVISO_DE_ROSA]),
    );
    expect(await loVe(AVISO_DE_ROSA)).toBe(false);

    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`update public.properties set status = 'available' where id = $1`, [AVISO_DE_ROSA]),
    );
    expect(await loVe(AVISO_DE_ROSA)).toBe(true);
  });
});
