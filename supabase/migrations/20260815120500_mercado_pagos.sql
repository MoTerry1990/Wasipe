-- =====================================================================
-- 20260815120500 — Historial de precios, suscripciones y créditos
-- =====================================================================

-- ---------------------------------------------------------------------
-- price_history — cada cambio de precio del aviso.
--
-- Es una promesa del producto: quien mira un departamento ve si bajó de
-- precio y cuándo. La escribe un trigger, no la aplicación, así que la
-- línea de tiempo no se puede maquillar desde el panel.
-- ---------------------------------------------------------------------
create table public.price_history (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.properties (id) on delete cascade,
  price numeric(14, 2) not null check (price > 0),
  currency public.currency not null,
  price_usd numeric(14, 2),
  price_per_m2 numeric(12, 2),
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index price_history_property_idx
  on public.price_history (property_id, changed_at desc);

create or replace function public.registrar_cambio_precio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Al crear el aviso se guarda el precio inicial; después, solo los
  -- cambios reales de precio o de moneda.
  if tg_op = 'UPDATE'
     and new.price is not distinct from old.price
     and new.currency is not distinct from old.currency then
    return new;
  end if;

  insert into public.price_history
    (property_id, price, currency, price_usd, price_per_m2, changed_by)
  values
    (new.id, new.price, new.currency, new.price_usd, new.price_per_m2, auth.uid());

  return new;
end;
$$;

-- AFTER, no BEFORE: price_per_m2 es una columna generada y recién tiene
-- valor una vez que la fila está escrita.
create trigger properties_historial_precio
  after insert or update of price, currency on public.properties
  for each row execute function public.registrar_cambio_precio();

-- ---------------------------------------------------------------------
-- subscriptions — planes contratados.
--
-- El titular puede ser una persona o una inmobiliaria, nunca los dos.
-- Publicar avisos básicos es y sigue siendo gratis; esto cubre los
-- planes de destaque y volumen.
-- ---------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  agency_id uuid references public.agencies (id) on delete cascade,

  plan_code text not null,
  status public.subscription_status not null default 'trialing',
  currency public.currency not null default 'PEN',
  amount numeric(12, 2) not null check (amount >= 0),
  listings_included integer not null default 0 check (listings_included >= 0),
  featured_included integer not null default 0 check (featured_included >= 0),

  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  auto_renew boolean not null default false,
  canceled_at timestamptz,

  -- Referencia de la pasarela (Culqi). Nunca se guarda el número de
  -- tarjeta: solo el identificador que devuelve la pasarela.
  provider text,
  provider_ref text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint titular_unico
    check (num_nonnulls(user_id, agency_id) = 1),
  constraint vigencia_coherente
    check (ends_at is null or ends_at > starts_at)
);

create index subscriptions_user_idx on public.subscriptions (user_id) where user_id is not null;
create index subscriptions_agency_idx on public.subscriptions (agency_id) where agency_id is not null;
create index subscriptions_vigentes_idx on public.subscriptions (status, ends_at);

create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------
-- credit_transactions — libro mayor de créditos.
--
-- Créditos para destacar avisos y para Wasi AI. Es un libro de solo
-- inserción: los ajustes se hacen con un movimiento en contra, nunca
-- editando o borrando el anterior. `balance_after` deja el saldo a la
-- vista sin tener que sumar toda la historia.
-- ---------------------------------------------------------------------
create table public.credit_transactions (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete cascade,
  agency_id uuid references public.agencies (id) on delete cascade,

  amount integer not null check (amount <> 0),   -- + carga · − consumo
  balance_after integer not null check (balance_after >= 0),
  reason text not null,
  property_id uuid references public.properties (id) on delete set null,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint titular_unico
    check (num_nonnulls(user_id, agency_id) = 1)
);

create index credit_transactions_user_idx
  on public.credit_transactions (user_id, created_at desc) where user_id is not null;
create index credit_transactions_agency_idx
  on public.credit_transactions (agency_id, created_at desc) where agency_id is not null;
