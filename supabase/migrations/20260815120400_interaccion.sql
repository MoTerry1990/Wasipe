-- =====================================================================
-- 20260815120400 — Interacción: favoritos, contactos, búsquedas,
--                  visitas y denuncias
-- =====================================================================

-- ---------------------------------------------------------------------
-- favorites — los avisos guardados de cada persona.
-- ---------------------------------------------------------------------
create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  note text check (length(note) <= 500),
  created_at timestamptz not null default now(),
  primary key (user_id, property_id)
);

create index favorites_property_idx on public.favorites (property_id);

-- ---------------------------------------------------------------------
-- inquiries — consultas de un interesado al anunciante.
--
-- `owner_id` se copia del aviso a propósito. Sin esa copia, la política
-- de RLS tendría que consultar properties en cada fila leída; con ella
-- la comprobación es directa. Un trigger la mantiene sincronizada para
-- que nadie pueda escribir un dueño falso.
-- ---------------------------------------------------------------------
create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,

  -- Datos de contacto: se piden aunque la persona tenga cuenta, porque
  -- el anunciante llama al número que le dejaron, no al del perfil.
  sender_name text not null check (length(trim(sender_name)) between 2 and 80),
  sender_email text check (sender_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  sender_phone text check (sender_phone ~ '^9[0-9]{8}$'),
  message text not null check (length(trim(message)) between 10 and 2000),

  status public.inquiry_status not null default 'new',
  read_at timestamptz,
  answered_at timestamptz,
  created_at timestamptz not null default now(),

  -- Sin correo ni teléfono la consulta no sirve: no hay cómo responder.
  constraint contacto_alcanzable
    check (sender_email is not null or sender_phone is not null)
);

create index inquiries_owner_idx on public.inquiries (owner_id, created_at desc);
create index inquiries_property_idx on public.inquiries (property_id, created_at desc);
create index inquiries_sender_idx on public.inquiries (sender_id) where sender_id is not null;

-- El dueño de la consulta lo decide la base, no el cliente.
create or replace function public.fijar_dueno_consulta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select p.owner_id into new.owner_id
  from public.properties p
  where p.id = new.property_id;

  if new.owner_id is null then
    raise exception 'El aviso % no existe', new.property_id;
  end if;

  -- Nadie se escribe a sí mismo: es ruido en la bandeja.
  if new.sender_id is not null and new.sender_id = new.owner_id then
    raise exception 'No puedes enviarte una consulta a tu propio aviso';
  end if;

  return new;
end;
$$;

create trigger inquiries_dueno
  before insert on public.inquiries
  for each row execute function public.fijar_dueno_consulta();

-- Contador de consultas del aviso, para el panel del anunciante.
create or replace function public.sumar_consulta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.properties
     set inquiries_count = inquiries_count + 1
   where id = new.property_id;
  return new;
end;
$$;

create trigger inquiries_contador
  after insert on public.inquiries
  for each row execute function public.sumar_consulta();

-- ---------------------------------------------------------------------
-- saved_searches — búsquedas guardadas con alerta.
--
-- Los filtros van en jsonb: el buscador va a crecer y cada filtro nuevo
-- no debería costar una migración.
-- ---------------------------------------------------------------------
create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  filters jsonb not null default '{}'::jsonb,
  alert_frequency public.alert_frequency not null default 'daily',
  last_run_at timestamptz,
  last_notified_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index saved_searches_user_idx on public.saved_searches (user_id);
create index saved_searches_pendientes_idx
  on public.saved_searches (alert_frequency, last_run_at)
  where is_active;

create trigger saved_searches_updated_at
  before update on public.saved_searches
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------
-- listing_views — visitas al aviso.
--
-- Tabla de solo inserción. No guarda IP ni nada que identifique a la
-- persona: solo un hash de sesión, suficiente para no contar diez veces
-- la misma visita y respetuoso con la Ley 29733.
-- ---------------------------------------------------------------------
create table public.listing_views (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.properties (id) on delete cascade,
  viewer_id uuid references public.profiles (id) on delete set null,
  session_hash text,
  source text,          -- 'search' · 'direct' · 'favorites' · 'share'
  viewed_at timestamptz not null default now()
);

create index listing_views_property_idx on public.listing_views (property_id, viewed_at desc);

-- ---------------------------------------------------------------------
-- reports — denuncias sobre un aviso.
--
-- Es lo que sostiene la confianza del portal: un aviso ya vendido que
-- sigue publicado es la queja número uno contra la competencia.
-- ---------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  reporter_id uuid references public.profiles (id) on delete set null,
  reason public.report_reason not null,
  detail text check (length(detail) <= 1000),
  status public.report_status not null default 'open',
  resolved_by uuid references public.profiles (id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index reports_estado_idx on public.reports (status, created_at desc);
create index reports_property_idx on public.reports (property_id);

-- Una misma persona no denuncia dos veces el mismo aviso por lo mismo.
create unique index reports_sin_duplicados
  on public.reports (property_id, reporter_id, reason)
  where reporter_id is not null and status in ('open', 'reviewing');
