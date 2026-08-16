import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { levantarBanco, sembrar, CUENTAS, AVISOS, type Banco } from './banco';

/**
 * Los buckets y sus políticas.
 *
 * PGlite no trae el esquema `storage` de Supabase, así que las políticas
 * sobre `storage.objects` **no se prueban acá** y hay que decirlo: lo que
 * se comprueba es todo lo demás que la migración pone en `public`, que es
 * lo que decide si el relleno de huellas y la limpieza funcionan.
 *
 * Las políticas de storage quedan sin verificar hasta que exista el
 * proyecto de Supabase. Están escritas y revisadas a mano; eso no es lo
 * mismo que probadas, y en `FINAL_AUDIT.md` figuran como lo que son.
 */

let banco: Banco;

beforeAll(async () => {
  banco = await levantarBanco();
  await sembrar(banco);
}, 180_000);

afterAll(async () => {
  await banco?.cerrar();
});

// ---------------------------------------------------------------------
// Dónde vive cada archivo
// ---------------------------------------------------------------------

describe('property_media sabe en qué bucket está cada archivo', () => {
  it('las columnas nuevas existen', async () => {
    const { rows } = await banco.db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'property_media'`,
    );
    const columnas = rows.map((f) => f.column_name);

    for (const columna of ['storage_bucket', 'original_path', 'byte_size', 'mime_type']) {
      expect(columnas, columna).toContain(columna);
    }
  });

  it('lo que ya existía quedó marcado como del bucket público', async () => {
    // Es de donde venimos: antes había un solo bucket.
    const { rows } = await banco.db.query<{ n: string }>(
      `select count(*) as n from public.property_media
        where storage_path is not null and storage_bucket is null`,
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it('no se acepta un bucket inventado', async () => {
    await expect(
      banco.db.query(
        `update public.property_media set storage_bucket = 'publico-abierto' where true`,
      ),
    ).rejects.toThrow(/check|constraint/i);
  });
});

// ---------------------------------------------------------------------
// El relleno de huellas
// ---------------------------------------------------------------------

describe('las huellas', () => {
  it('la vista dice cuánto falta', async () => {
    const { rows } = await banco.db.query<{
      total: string;
      con_huella: string;
      sin_huella: string;
      porcentaje: string;
    }>(`select * from public.avance_de_huellas`);

    const avance = rows[0]!;
    expect(Number(avance.total)).toBeGreaterThanOrEqual(0);
    expect(Number(avance.con_huella) + Number(avance.sin_huella)).toBe(Number(avance.total));
  });

  it('el lote devuelve las más viejas primero y respeta el tope', async () => {
    const lote = await banco.comoServicio(async (db) => {
      const { rows } = await db.query(`select * from public.fotos_sin_huella(3)`);
      return rows;
    });
    expect(lote.length).toBeLessThanOrEqual(3);
  });

  it('el tope no se puede desbordar pidiendo un millón', async () => {
    // `least(p_limite, 500)`: un proceso que pida todo de golpe no puede
    // tumbar la base.
    const lote = await banco.comoServicio(async (db) => {
      const { rows } = await db.query(`select * from public.fotos_sin_huella(1000000)`);
      return rows;
    });
    expect(lote.length).toBeLessThanOrEqual(500);
  });

  it('anotar una huella la escribe', async () => {
    const { rows: fotos } = await banco.db.query<{ id: string }>(
      `select id from public.property_media where kind = 'photo' limit 1`,
    );
    if (fotos.length === 0) return;

    const huella = `sha256:${'a'.repeat(64)}`;

    const escrita = await banco.comoServicio(async (db) => {
      const { rows } = await db.query<{ anotar_huella: boolean }>(
        `select public.anotar_huella($1, $2)`,
        [fotos[0]!.id, huella],
      );
      return rows[0]!.anotar_huella;
    });

    expect(escrita).toBe(true);

    const { rows } = await banco.db.query<{ image_hash: string }>(
      `select image_hash from public.property_media where id = $1`,
      [fotos[0]!.id],
    );
    expect(rows[0]?.image_hash).toBe(huella);
  });

  it('anotarla dos veces no la pisa', async () => {
    // El relleno se corre por lotes y se puede cortar. Que sea idempotente
    // es lo que permite retomarlo sin pensar.
    const { rows: fotos } = await banco.db.query<{ id: string }>(
      `select id from public.property_media where image_hash is not null limit 1`,
    );
    if (fotos.length === 0) return;

    const otraVez = await banco.comoServicio(async (db) => {
      const { rows } = await db.query<{ anotar_huella: boolean }>(
        `select public.anotar_huella($1, $2)`,
        [fotos[0]!.id, `sha256:${'b'.repeat(64)}`],
      );
      return rows[0]!.anotar_huella;
    });

    expect(otraVez).toBe(false);

    const { rows } = await banco.db.query<{ image_hash: string }>(
      `select image_hash from public.property_media where id = $1`,
      [fotos[0]!.id],
    );
    expect(rows[0]?.image_hash?.startsWith('sha256:a')).toBe(true);
  });

  it('una huella que no parece huella se rechaza', async () => {
    const { rows: fotos } = await banco.db.query<{ id: string }>(
      `select id from public.property_media where kind = 'photo' limit 1`,
    );
    if (fotos.length === 0) return;

    await expect(
      banco.comoServicio((db) =>
        db.query(`select public.anotar_huella($1, 'x')`, [fotos[0]!.id]),
      ),
    ).rejects.toThrow(/no parece una huella/);
  });

  it('nadie sin la llave de servicio anota huellas', async () => {
    const { rows: fotos } = await banco.db.query<{ id: string }>(
      `select id from public.property_media limit 1`,
    );
    if (fotos.length === 0) return;

    await expect(
      banco.comoUsuario(CUENTAS.rosa, (db) =>
        db.query(`select public.anotar_huella($1, $2)`, [
          fotos[0]!.id,
          `sha256:${'c'.repeat(64)}`,
        ]),
      ),
    ).rejects.toThrow(/Solo el servidor/);
  });

  it('ni pide el lote pendiente', async () => {
    // Recorre fotos de todo el mundo: es un listado del catálogo entero.
    await expect(
      banco.comoUsuario(CUENTAS.lucia, (db) =>
        db.query(`select * from public.fotos_sin_huella(10)`),
      ),
    ).rejects.toThrow(/Solo el servidor/);
  });
});

// ---------------------------------------------------------------------
// Duplicados
// ---------------------------------------------------------------------

describe('la misma foto en dos avisos', () => {
  it('se marca cuando comparten huella', async () => {
    const huella = `sha256:${'d'.repeat(64)}`;

    await banco.db.query(
      `update public.property_media set image_hash = $1
        where property_id in ($2, $3)`,
      [huella, AVISOS.sanIsidro, AVISOS.jesusMaria],
    );

    await banco.comoServicio((db) =>
      db.query(`select public.marcar_aviso($1)`, [AVISOS.sanIsidro]),
    );

    const { rows } = await banco.db.query<{ kind: string }>(
      `select kind from public.moderation_flags
        where property_id = $1 and kind = 'repeated_image' and status = 'open'`,
      [AVISOS.sanIsidro],
    );
    expect(rows).toHaveLength(1);
  });

  it('el índice de huellas existe: sin él la búsqueda recorre la tabla', async () => {
    const { rows } = await banco.db.query<{ indexname: string }>(
      `select indexname from pg_indexes
        where schemaname = 'public' and tablename = 'property_media'`,
    );
    expect(rows.map((f) => f.indexname)).toContain('property_media_huella_idx');
  });
});

// ---------------------------------------------------------------------
// Subidas abandonadas
// ---------------------------------------------------------------------

describe('las subidas abandonadas', () => {
  it('la función existe y solo la llama el servidor', async () => {
    const { rows } = await banco.db.query<{ proname: string; prosecdef: boolean }>(
      `select proname, prosecdef from pg_proc
        where proname = 'subidas_abandonadas'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.prosecdef).toBe(true);

    await expect(
      banco.comoUsuario(CUENTAS.lucia, (db) =>
        db.query(`select * from public.subidas_abandonadas(48)`),
      ),
    ).rejects.toThrow(/Solo el servidor/);
  });
});
