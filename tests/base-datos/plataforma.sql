-- =====================================================================
-- Lo que Supabase ya trae puesto.
--
-- Las migraciones de supabase/migrations/ dan por sentado un esquema
-- `auth` con usuarios, tres roles (anon, authenticated, service_role) y
-- la función auth.uid(). Nada de eso lo crean las migraciones: viene con
-- el proyecto de Supabase.
--
-- Para probar contra PGlite —un Postgres real compilado a WebAssembly,
-- sin Docker— hay que reproducir ese punto de partida. Este archivo es
-- la única pieza "de mentira" del banco de pruebas; todo lo demás son
-- las migraciones reales, sin tocar.
-- =====================================================================

create schema if not exists auth;
create schema if not exists extensions;

-- ---------------------------------------------------------------------
-- Roles
--
-- `anon`: visitante sin sesión.
-- `authenticated`: alguien que inició sesión.
-- `service_role`: el servidor con la clave de servicio. En Supabase real
--   tiene BYPASSRLS; acá se marca igual para que las pruebas comprueben
--   que efectivamente se salta las políticas.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- auth.users — versión mínima.
--
-- Solo las columnas que tocan las migraciones y la semilla. La tabla
-- real de Supabase tiene muchas más, pero ninguna nos importa acá.
-- ---------------------------------------------------------------------
create table if not exists auth.users (
  id uuid primary key,
  instance_id uuid,
  aud text,
  role text,
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- auth.uid() — quién está haciendo la consulta.
--
-- En Supabase sale de los claims del JWT, que PostgREST pone en el
-- parámetro de sesión `request.jwt.claims`. Acá se lee lo mismo, así que
-- las políticas funcionan sin modificar ni una línea.
-- ---------------------------------------------------------------------
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  )
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'role', current_setting('role', true))
$$;

grant usage on schema auth, extensions, public to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- search_path.
--
-- En Supabase el esquema `extensions` viene incluido en el search_path
-- por defecto, y por eso las migraciones y la semilla pueden llamar a
-- crypt(), gen_salt() o unaccent() sin calificarlas. Acá hay que decirlo
-- a mano para que el banco se comporte igual.
-- ---------------------------------------------------------------------
set search_path = public, extensions;
alter role anon set search_path = public, extensions;
alter role authenticated set search_path = public, extensions;
alter role service_role set search_path = public, extensions;
