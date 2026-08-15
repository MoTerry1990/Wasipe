-- =====================================================================
-- 20260815120200 — Perfiles, inmobiliarias y membresías
-- =====================================================================

-- ---------------------------------------------------------------------
-- profiles — datos públicos de la cuenta.
--
-- La identidad (correo, contraseña, sesiones) vive en auth.users, que
-- administra Supabase. Acá va solo lo que la aplicación necesita mostrar
-- o filtrar. El id es el mismo, así que se puede unir sin buscar nada.
--
-- `role` está en esta tabla y NO en los metadatos del token: los
-- metadatos de usuario son editables desde el cliente y quien pueda
-- editarlos se haría administrador solo. Un trigger bloquea el cambio.
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 2 and 80),
  phone text check (phone ~ '^9[0-9]{8}$'),          -- celular peruano
  whatsapp text check (whatsapp ~ '^9[0-9]{8}$'),
  avatar_url text,
  bio text check (length(bio) <= 600),
  role public.user_role not null default 'owner',
  is_active boolean not null default true,
  -- Se cuenta acá para poder aplicar el límite de avisos gratuitos sin
  -- recorrer toda la tabla de propiedades en cada publicación.
  free_listings_used smallint not null default 0 check (free_listings_used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.role is
  'Fuente de verdad del rol. Nunca leer el rol de los metadatos del JWT: son editables por el cliente.';

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.tocar_updated_at();

-- Al registrarse, Supabase crea la fila en auth.users. Este trigger crea
-- el perfil correspondiente para que nunca exista una cuenta sin perfil.
create or replace function public.crear_perfil_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'Usuario de Wasipe'),
    -- El rol SIEMPRE arranca en 'owner'. Aunque el cliente mande
    -- "role": "admin" en los metadatos del registro, se ignora.
    'owner'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_al_registrarse();

-- ---------------------------------------------------------------------
-- agencies — inmobiliarias.
-- ---------------------------------------------------------------------
create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ruc text unique check (ruc ~ '^(10|15|17|20)[0-9]{9}$'),  -- RUC peruano
  logo_url text,
  phone text,
  email text check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  website text,
  description text check (length(description) <= 1200),
  verification_status public.verification_status not null default 'unverified',
  is_active boolean not null default true,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.agencies.ruc is
  'RUC de SUNAT: 11 dígitos que empiezan en 10, 15, 17 o 20. Se pide para verificar la inmobiliaria.';

create trigger agencies_updated_at
  before update on public.agencies
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------
-- agency_members — quién pertenece a qué inmobiliaria y con qué permiso.
--
-- `can_publish` separa al corredor que solo consulta del que publica.
-- La RLS de propiedades se apoya en esta tabla.
-- ---------------------------------------------------------------------
create table public.agency_members (
  agency_id uuid not null references public.agencies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.agency_member_role not null default 'agent',
  can_publish boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (agency_id, user_id)
);

create index agency_members_user_idx on public.agency_members (user_id);
