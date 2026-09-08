import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { levantarBanco, sembrar, CUENTAS, AVISOS, type Banco } from './banco';

/**
 * La nota de un favorito es de quien la escribió y de nadie más.
 *
 * `favorites.note` existía desde el esquema inicial y hasta el sprint 23C
 * **nadie la escribía**: la página la mostraba si estaba, y la única que
 * se veía la había puesto la siembra. Al agregar el editor, lo que hay
 * que comprobar no es que se guarde —eso se ve— sino que no se pueda
 * escribir en la fila de otra persona.
 *
 * La política `mis favoritos` es `ALL` sobre `user_id = auth.uid()`, así
 * que cubre las cuatro operaciones. Estas pruebas existen para que siga
 * siendo cierto: una nota puede decir «ofrecer 20 mil menos», y eso no lo
 * puede leer ni cambiar nadie más.
 */

let banco: Banco;

beforeAll(async () => {
  banco = await levantarBanco();
});

afterAll(async () => {
  await banco.cerrar();
});

beforeEach(async () => {
  await sembrar(banco);
  await banco.comoServicio((db) => db.query(`delete from public.favorites`));
  await banco.comoServicio((db) =>
    db.query(
      `insert into public.favorites (user_id, property_id, note)
       values ($1, $2, 'Preguntar por el mantenimiento')`,
      [CUENTAS.lucia, AVISOS.miraflores],
    ),
  );
});

const notaDe = (usuario: string, aviso: string) =>
  banco.comoServicio(async (db) => {
    const { rows } = await db.query<{ note: string | null }>(
      `select note from public.favorites where user_id = $1 and property_id = $2`,
      [usuario, aviso],
    );
    return rows[0]?.note ?? null;
  });

describe('la nota de un favorito', () => {
  it('su dueña la escribe', async () => {
    await banco.comoUsuario(CUENTAS.lucia, (db) =>
      db.query(`update public.favorites set note = $1 where property_id = $2`, [
        'Ofrecer 20 mil menos',
        AVISOS.miraflores,
      ]),
    );

    expect(await notaDe(CUENTAS.lucia, AVISOS.miraflores)).toBe('Ofrecer 20 mil menos');
  });

  it('y la borra dejándola en nulo', async () => {
    await banco.comoUsuario(CUENTAS.lucia, (db) =>
      db.query(`update public.favorites set note = null where property_id = $1`, [
        AVISOS.miraflores,
      ]),
    );

    expect(await notaDe(CUENTAS.lucia, AVISOS.miraflores)).toBeNull();
  });

  it('Rosa no puede cambiar la nota de Lucía', async () => {
    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`update public.favorites set note = $1 where property_id = $2`, [
        'Nota metida por otra persona',
        AVISOS.miraflores,
      ]),
    );

    // RLS no lanza: no alcanza ninguna fila. Comprobar que «no falló» no
    // dice nada; hay que mirar el dato.
    expect(await notaDe(CUENTAS.lucia, AVISOS.miraflores)).toBe('Preguntar por el mantenimiento');
  });

  it('ni leerla', async () => {
    const loQueVeRosa = await banco.comoUsuario(CUENTAS.rosa, async (db) => {
      const { rows } = await db.query<{ n: number }>(
        `select count(*)::int as n from public.favorites where property_id = $1`,
        [AVISOS.miraflores],
      );
      return Number(rows[0]!.n);
    });

    // Una nota puede decir cuánto está dispuesta a pagar. No es de nadie
    // más, ni siquiera de quien publicó el aviso.
    expect(loQueVeRosa).toBe(0);
  });

  it('ni borrarla borrando el favorito ajeno', async () => {
    await banco.comoUsuario(CUENTAS.rosa, (db) =>
      db.query(`delete from public.favorites where property_id = $1`, [AVISOS.miraflores]),
    );

    expect(await notaDe(CUENTAS.lucia, AVISOS.miraflores)).toBe('Preguntar por el mantenimiento');
  });

  it('un visitante sin sesión no ve ninguna', async () => {
    const visibles = await banco.comoAnonimo(async (db) => {
      const { rows } = await db.query<{ n: number }>(
        `select count(*)::int as n from public.favorites`,
      );
      return Number(rows[0]!.n);
    });

    expect(visibles).toBe(0);
  });

  it('la base no acepta una nota desmedida', async () => {
    // El editor corta en 280; la base tiene su propio techo en 500. Las
    // dos capas, porque la interfaz no es el único camino a la tabla.
    await expect(
      banco.comoUsuario(CUENTAS.lucia, (db) =>
        db.query(`update public.favorites set note = $1 where property_id = $2`, [
          'x'.repeat(501),
          AVISOS.miraflores,
        ]),
      ),
    ).rejects.toThrow(/favorites_note_check|violates check constraint/i);
  });
});
