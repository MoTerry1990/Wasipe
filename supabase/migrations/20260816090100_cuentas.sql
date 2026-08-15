-- =====================================================================
-- 20260816090100 — Cuentas: datos de bienvenida y distritos de interés
-- =====================================================================

-- Cómo prefiere que lo contacten. En el Perú WhatsApp gana por lejos:
-- es la primera opción y el valor por defecto.
create type public.contact_method as enum ('whatsapp', 'phone', 'email');

-- A qué vino la persona. Define qué se le muestra en el panel.
create type public.user_intent as enum ('buy', 'rent', 'sell', 'rent_out', 'invest');

alter table public.profiles
  add column preferred_contact public.contact_method not null default 'whatsapp',
  add column intent public.user_intent,
  -- Marca el final de la bienvenida. Mientras sea NULL, la persona puede
  -- elegir su tipo de cuenta; después ya no (ver el trigger de abajo).
  add column onboarded_at timestamptz;

comment on column public.profiles.onboarded_at is
  'Fin de la bienvenida. Mientras sea NULL se permite elegir el tipo de cuenta una sola vez.';

-- Quien se registra ahora entra como comprador: es el rol que menos
-- puede hacer. Publicar exige elegirlo en la bienvenida.
alter table public.profiles alter column role set default 'buyer';

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
    -- El rol arranca SIEMPRE en 'buyer'. Aunque el registro mande
    -- "role": "admin" en los metadatos, acá se ignora.
    'buyer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Elegir tipo de cuenta: una vez, y solo entre los roles sin privilegios.
--
-- La versión anterior bloqueaba todo cambio de rol, lo que dejaba a la
-- bienvenida sin poder hacer su trabajo. Ahora se permite exactamente lo
-- que la bienvenida necesita: elegir una vez entre comprador,
-- propietario, corredor o inmobiliaria. 'moderator' y 'admin' siguen
-- siendo intocables desde el cliente.
-- ---------------------------------------------------------------------
create or replace function public.impedir_cambio_de_rol()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.es_admin() then
    if old.onboarded_at is not null then
      raise exception 'El tipo de cuenta ya no se puede cambiar desde acá. Escríbenos y lo vemos.'
        using errcode = '42501';
    end if;

    if new.role not in ('buyer', 'owner', 'agent', 'agency_admin') then
      raise exception 'Ese tipo de cuenta no se puede elegir'
        using errcode = '42501';
    end if;
  end if;

  if new.free_listings_used is distinct from old.free_listings_used
     and not public.es_admin() then
    raise exception 'El contador de avisos gratuitos lo lleva el sistema'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- profile_districts — distritos que le interesan a la persona.
--
-- Tabla y no un arreglo en jsonb: se cruza con los avisos para las
-- alertas, y un índice sobre una columna de texto es mucho más barato
-- que recorrer arreglos.
-- ---------------------------------------------------------------------
create table public.profile_districts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  district text not null check (length(trim(district)) between 2 and 80),
  province text,
  department text,
  created_at timestamptz not null default now(),
  primary key (user_id, district)
);

create index profile_districts_district_idx on public.profile_districts (district);

alter table public.profile_districts enable row level security;

create policy "mis distritos de interes"
  on public.profile_districts for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
