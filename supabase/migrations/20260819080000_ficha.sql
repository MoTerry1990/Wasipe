-- =====================================================================
-- 20260819080000 — Ficha del aviso: contactos, visitas y límite de envíos
-- =====================================================================

-- ---------------------------------------------------------------------
-- Qué tipo de contacto es.
--
-- Pedir una visita y hacer una consulta son cosas distintas para quien
-- recibe: una tiene fecha y hay que responderla hoy. Van en la misma
-- tabla porque comparten todo lo demás.
-- ---------------------------------------------------------------------
create type public.inquiry_kind as enum ('message', 'visit');

alter table public.inquiries
  add column kind public.inquiry_kind not null default 'message',
  add column preferred_visit_at timestamptz;

-- Una visita sin fecha propuesta obliga a un ida y vuelta que se podría
-- haber evitado.
alter table public.inquiries
  add constraint visita_con_fecha
  check (kind <> 'visit' or preferred_visit_at is not null);

create index inquiries_visitas_idx
  on public.inquiries (owner_id, preferred_visit_at)
  where kind = 'visit';

-- ---------------------------------------------------------------------
-- lead_events — qué hizo la gente en la ficha.
--
-- Sirve para que quien publica sepa si su aviso genera interés y en qué
-- momento. NO guarda quién: ni IP, ni correo, ni teléfono. Solo un hash
-- de sesión, que alcanza para no contar diez veces a la misma persona y
-- no permite identificar a nadie (Ley 29733).
-- ---------------------------------------------------------------------
create type public.lead_event_kind as enum (
  'phone_reveal',   -- tocó "ver teléfono"
  'whatsapp',       -- abrió WhatsApp
  'contact_form',   -- envió el formulario
  'visit_request',  -- pidió una visita
  'share',          -- compartió el aviso
  'compare',        -- lo sumó a comparar
  'favorite'        -- lo guardó
);

create table public.lead_events (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.properties (id) on delete cascade,
  kind public.lead_event_kind not null,
  -- Hash de sesión, no identificador de persona. Se rota cada 30 días.
  session_hash text check (length(session_hash) <= 64),
  source text check (length(source) <= 40),
  created_at timestamptz not null default now()
);

create index lead_events_property_idx
  on public.lead_events (property_id, kind, created_at desc);

comment on table public.lead_events is
  'Interacciones con el aviso. Sin datos personales: solo un hash de sesión.';

-- ---------------------------------------------------------------------
-- rate_limits — cupos por ventana de tiempo.
--
-- En Vercel cada petición puede caer en un proceso distinto, así que un
-- contador en memoria no sirve para nada: lo único compartido es la base.
--
-- La tabla no tiene ninguna política de RLS a propósito. Con RLS activa y
-- sin políticas, nadie la lee ni la escribe desde la API; el único acceso
-- es la función de abajo, que es SECURITY DEFINER.
-- ---------------------------------------------------------------------
create table public.rate_limits (
  bucket text not null,
  clave text not null,
  ventana timestamptz not null,
  usos integer not null default 0,
  primary key (bucket, clave, ventana)
);

alter table public.rate_limits enable row level security;

/**
 * Consume un cupo. Devuelve true si se puede seguir.
 *
 * La ventana se redondea hacia abajo, así que todas las peticiones del
 * mismo minuto (o de la misma hora) caen en la misma fila y el conteo es
 * un solo UPDATE atómico. Sin eso, dos envíos simultáneos se pisan y el
 * límite se puede saltar.
 */
create or replace function public.consumir_cupo(
  p_bucket text,
  p_clave text,
  p_limite integer,
  p_ventana_segundos integer default 3600
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inicio timestamptz;
  usos_ahora integer;
begin
  inicio := to_timestamp(
    floor(extract(epoch from now()) / p_ventana_segundos) * p_ventana_segundos
  );

  insert into public.rate_limits (bucket, clave, ventana, usos)
  values (p_bucket, p_clave, inicio, 1)
  on conflict (bucket, clave, ventana)
    do update set usos = public.rate_limits.usos + 1
  returning usos into usos_ahora;

  return usos_ahora <= p_limite;
end;
$$;

revoke all on function public.consumir_cupo(text, text, integer, integer) from public;
grant execute on function public.consumir_cupo(text, text, integer, integer)
  to anon, authenticated, service_role;

/** Limpieza: las ventanas viejas no le sirven a nadie. */
create or replace function public.limpiar_cupos_vencidos()
returns integer
language sql
security definer
set search_path = public
as $$
  with borradas as (
    delete from public.rate_limits where ventana < now() - interval '2 days'
    returning 1
  )
  select count(*)::int from borradas
$$;

-- ---------------------------------------------------------------------
-- Registro de eventos.
--
-- Va por función y no por INSERT directo para que el cliente no pueda
-- inventar el hash de otra persona ni escribir eventos de un aviso que
-- no está publicado.
-- ---------------------------------------------------------------------
create or replace function public.registrar_evento(
  p_property_id uuid,
  p_kind public.lead_event_kind,
  p_session_hash text default null,
  p_source text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.aviso_publico(p_property_id) then
    return;  -- en silencio: no es un error del usuario
  end if;

  insert into public.lead_events (property_id, kind, session_hash, source)
  values (p_property_id, p_kind, left(p_session_hash, 64), left(p_source, 40));
end;
$$;

grant execute on function public.registrar_evento(uuid, public.lead_event_kind, text, text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- RLS de lead_events
--
-- Se escriben solo por registrar_evento(). Se leen únicamente por quien
-- administra el aviso: son sus estadísticas, no las de la competencia.
-- ---------------------------------------------------------------------
alter table public.lead_events enable row level security;

create policy "el anunciante ve la actividad de su aviso"
  on public.lead_events for select
  to authenticated
  using (public.administra_aviso(property_id));

-- ---------------------------------------------------------------------
-- Índice para "propiedades parecidas"
--
-- Se busca en el mismo distrito, misma operación y mismo tipo, ordenando
-- por cercanía de precio. Sin este índice, cada ficha dispara un
-- recorrido de la tabla.
-- ---------------------------------------------------------------------
create index properties_parecidas_idx
  on public.properties (district, operation, property_type, price_usd)
  where publication_status = 'published' and status = 'available';

-- ---------------------------------------------------------------------
-- telefono_de_contacto() — el número, solo cuando lo piden.
--
-- La RLS de `profiles` no deja que nadie lea el teléfono de otra persona,
-- y así tiene que seguir: si el listado lo devolviera, cualquiera podría
-- bajarse todos los números del portal con una sola consulta.
--
-- Esta función lo entrega de a uno, para un aviso publicado, y deja el
-- evento anotado. Es SECURITY DEFINER a propósito: es la única puerta.
--
-- El número no viaja en el HTML de la ficha. Aparece recién cuando la
-- persona toca "ver teléfono", que es también el momento en que el dato
-- vale algo para quien publica.
-- ---------------------------------------------------------------------
create or replace function public.telefono_de_contacto(
  p_property_id uuid,
  p_session_hash text default null
)
returns table (telefono text, whatsapp text, nombre text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.aviso_publico(p_property_id) then
    return;
  end if;

  if not public.consumir_cupo('telefono', coalesce(p_session_hash, 'anonimo'), 30, 3600) then
    raise exception 'Demasiadas consultas seguidas. Espera un momento.'
      using errcode = '53400';
  end if;

  perform public.registrar_evento(p_property_id, 'phone_reveal', p_session_hash, 'ficha');

  return query
  select
    -- La inmobiliaria manda sobre el perfil: si el aviso es de una
    -- empresa, el contacto es el de la empresa.
    coalesce(a.phone, pe.phone),
    coalesce(a.phone, pe.whatsapp),
    coalesce(a.name, pe.full_name)
  from public.properties pr
  join public.profiles pe on pe.id = pr.owner_id
  left join public.agencies a on a.id = pr.agency_id
  where pr.id = p_property_id;
end;
$$;

grant execute on function public.telefono_de_contacto(uuid, text)
  to anon, authenticated, service_role;
