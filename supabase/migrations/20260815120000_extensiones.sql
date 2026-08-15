-- =====================================================================
-- 20260815120000 — Extensiones y utilidades compartidas
--
-- En Supabase las extensiones viven en el esquema `extensions`, que ya
-- está en el search_path por defecto. PostGIS se habilita acá y se usa
-- recién en la migración 20260815120900_geoespacial.sql.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------
-- sin_tildes(): unaccent() envuelto como IMMUTABLE.
--
-- unaccent() es STABLE porque depende de un diccionario que en teoría
-- puede cambiar. En la práctica no cambia, y sin IMMUTABLE no se puede
-- usar dentro de columnas generadas ni de índices. Este envoltorio es el
-- que permite buscar "Miraflores" escribiendo "miraflores" o "mirafloŕes".
-- ---------------------------------------------------------------------
create or replace function public.sin_tildes(texto text)
returns text
language sql
immutable
parallel safe
strict
set search_path = extensions, public
as $$
  select extensions.unaccent('extensions.unaccent', texto)
$$;

-- ---------------------------------------------------------------------
-- Marca de actualización.
--
-- Se engancha como BEFORE UPDATE en toda tabla que tenga `updated_at`,
-- así ninguna capa de aplicación puede olvidarse de refrescarla.
-- ---------------------------------------------------------------------
create or replace function public.tocar_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Código público de aviso: WSP-000123.
--
-- Es el número que la persona dicta por teléfono. Se genera con una
-- secuencia y nunca se reutiliza, ni siquiera si el aviso se borra.
-- ---------------------------------------------------------------------
create sequence if not exists public.codigo_aviso_seq start 1000;

create or replace function public.nuevo_codigo_aviso()
returns text
language sql
volatile
set search_path = public
as $$
  select 'WSP-' || lpad(nextval('public.codigo_aviso_seq')::text, 6, '0')
$$;
