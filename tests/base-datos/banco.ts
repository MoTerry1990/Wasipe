import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Banco de pruebas de la base de datos.
 *
 * Levanta un Postgres real (PGlite: Postgres compilado a WebAssembly) en
 * memoria, le pone encima lo que Supabase da por hecho —esquema auth,
 * roles, auth.uid()— y aplica LAS MIGRACIONES REALES, sin editarlas.
 *
 * Así las políticas de RLS se prueban tal cual van a correr en
 * producción, y sin necesidad de Docker.
 *
 * LÍMITE CONOCIDO: PGlite no incluye PostGIS. La migración geoespacial
 * se omite y queda anotada en OMITIDAS. Todo lo que dependa de `geo`
 * —el índice GIST y propiedades_cercanas()— se verifica recién contra un
 * Supabase de verdad. No se afirma acá que funcione.
 */

const RAIZ = join(__dirname, '..', '..');
const MIGRACIONES = join(RAIZ, 'supabase', 'migrations');

/** Migraciones que este banco no puede ejecutar, y por qué. */
export const OMITIDAS: Record<string, string> = {
  '20260815120900_geoespacial.sql': 'PGlite no incluye PostGIS',
};

export type Banco = {
  db: PGlite;
  /** Ejecuta como visitante sin sesión. */
  comoAnonimo<T>(consulta: (db: PGlite) => Promise<T>): Promise<T>;
  /** Ejecuta como una persona con sesión iniciada. */
  comoUsuario<T>(id: string, consulta: (db: PGlite) => Promise<T>): Promise<T>;
  /** Ejecuta con la clave de servicio: se salta la RLS. */
  comoServicio<T>(consulta: (db: PGlite) => Promise<T>): Promise<T>;
  cerrar(): Promise<void>;
};

/** Aplica plataforma + migraciones sobre una base nueva. */
export async function levantarBanco(): Promise<Banco> {
  const db = await PGlite.create({
    extensions: { pg_trgm, unaccent, btree_gist, pgcrypto },
  });

  // 1. El punto de partida que da Supabase.
  await db.exec(readFileSync(join(__dirname, 'plataforma.sql'), 'utf8'));

  // 2. Las migraciones reales, en orden.
  for (const archivo of readdirSync(MIGRACIONES).sort()) {
    if (!archivo.endsWith('.sql')) continue;
    if (OMITIDAS[archivo]) continue;

    let sql = readFileSync(join(MIGRACIONES, archivo), 'utf8');

    // PostGIS tampoco está disponible para el CREATE EXTENSION. Se quita
    // solo esa línea; el resto del archivo se aplica sin cambios.
    sql = sql.replace(/^create extension if not exists postgis[^;]*;/gim, '');

    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Falló la migración ${archivo}: ${(error as Error).message}`);
    }
  }

  // 3. Los permisos que Supabase concede por defecto. Sin esto, anon y
  //    authenticated no llegan ni a evaluar las políticas.
  await db.exec(`
    grant select, insert, update, delete on all tables in schema public
      to anon, authenticated, service_role;
    grant usage, select on all sequences in schema public
      to anon, authenticated, service_role;
    grant execute on all functions in schema public
      to anon, authenticated, service_role;
  `);

  async function conRol<T>(
    rol: string,
    claims: string | null,
    consulta: (db: PGlite) => Promise<T>,
  ): Promise<T> {
    await db.exec(`set role ${rol};`);
    await db.query('select set_config($1, $2, false)', ['request.jwt.claims', claims ?? '']);
    try {
      return await consulta(db);
    } finally {
      await db.exec('reset role;');
      await db.query('select set_config($1, $2, false)', ['request.jwt.claims', '']);
    }
  }

  return {
    db,
    comoAnonimo: (consulta) => conRol('anon', JSON.stringify({ role: 'anon' }), consulta),
    comoUsuario: (id, consulta) =>
      conRol('authenticated', JSON.stringify({ sub: id, role: 'authenticated' }), consulta),
    comoServicio: (consulta) =>
      conRol('service_role', JSON.stringify({ role: 'service_role' }), consulta),
    cerrar: () => db.close(),
  };
}

/** Aplica supabase/seed.sql sobre un banco ya levantado. */
export async function sembrar(banco: Banco) {
  await banco.db.exec(readFileSync(join(RAIZ, 'supabase', 'seed.sql'), 'utf8'));
}

/** Identificadores de las cuentas de la semilla, para no repetirlos. */
export const CUENTAS = {
  rosa: '11111111-1111-4111-8111-111111111111',
  martin: '22222222-2222-4222-8222-222222222222',
  lucia: '33333333-3333-4333-8333-333333333333',
  moderacion: '44444444-4444-4444-8444-444444444444',
} as const;

export const AVISOS = {
  miraflores: 'c0000001-0000-4000-8000-000000000001',
  sanIsidro: 'c0000002-0000-4000-8000-000000000002',
  jesusMaria: 'c0000003-0000-4000-8000-000000000003',
  barranco: 'c0000005-0000-4000-8000-000000000005',
  borrador: 'c0000008-0000-4000-8000-000000000008',
} as const;
