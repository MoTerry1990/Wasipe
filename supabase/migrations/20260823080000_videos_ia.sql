-- =====================================================================
-- 20260823080000 — Video automático del aviso
--
-- Un video de un inmueble se comparte por WhatsApp y se reenvía. Sale
-- del control de Wasipe en el primer envío, así que todo lo que afirme
-- tiene que ser verdad en el momento de renderizarlo, y tiene que poder
-- caducar.
--
-- Lo nuevo de este sprint frente a los dos anteriores:
--   · reserva de créditos: renderizar tarda minutos, así que se aparta el
--     crédito al empezar y se devuelve entero si falla;
--   · progreso y cancelación, porque medio minuto de espera se aguanta y
--     cuatro no;
--   · descarga autorizada: la cubeta de videos es privada y el archivo
--     se entrega con enlace firmado, no con una URL que se reenvía;
--   · vencimiento y limpieza, para no cargar con un video que dice un
--     precio que ya no es.
-- =====================================================================

create type public.video_format as enum (
  'vertical',    -- 9:16 — historias y reels
  'square',      -- 1:1  — feed
  'horizontal'   -- 16:9 — YouTube y web
);

create type public.video_template as enum (
  'modern',
  'premium',
  'minimal',
  'reel'
);

create type public.video_status as enum (
  'queued',
  'rendering',
  'ready',
  'failed',
  'canceled',
  'expired'
);

-- ---------------------------------------------------------------------
-- property_videos — un render, con todo lo que afirmó
--
-- Los datos del aviso se copian acá (`facts`) en el momento de
-- renderizar. No es duplicación por descuido: el video ya dice ese
-- precio. Guardar lo que decía es lo único que permite, meses después,
-- responder «el aviso cambió el 3 de setiembre, el video es de antes».
-- ---------------------------------------------------------------------
create table public.property_videos (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  ai_job_id uuid references public.ai_jobs (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete cascade,

  format public.video_format not null,
  template public.video_template not null,
  status public.video_status not null default 'queued',

  -- Lo que el video muestra y narra, congelado al renderizar.
  facts jsonb not null default '{}'::jsonb,
  -- El texto exacto de la narración. Se guarda para poder auditarlo.
  narration text,
  music_track text,
  captions boolean not null default true,

  storage_path text,
  poster_path text,
  duration_ms integer check (duration_ms is null or duration_ms > 0),
  bytes bigint check (bytes is null or bytes > 0),

  provider text,
  provider_ref text,
  provider_cost_micros bigint check (provider_cost_micros >= 0),

  -- Un video no vive para siempre: a los 90 días el precio que dice ya
  -- puede ser mentira. Vencido deja de descargarse y la limpieza lo borra.
  expires_at timestamptz,
  downloads integer not null default 0 check (downloads >= 0),
  last_downloaded_at timestamptz,

  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,

  constraint listo_tiene_archivo
    check (status <> 'ready' or storage_path is not null),
  constraint fallo_explicado
    check (status <> 'failed' or error is not null)
);

create index property_videos_aviso_idx
  on public.property_videos (property_id, created_at desc);
create index property_videos_persona_idx
  on public.property_videos (created_by, created_at desc);
create index property_videos_vencidos_idx
  on public.property_videos (expires_at)
  where status = 'ready' and expires_at is not null;

comment on column public.property_videos.facts is
  'Lo que el video dice, congelado al renderizar. El aviso puede cambiar después.';
comment on column public.property_videos.expires_at is
  'Un video con un precio viejo engaña. Vencido no se descarga y se limpia.';

alter table public.property_videos enable row level security;

create policy "veo los videos de mis avisos"
  on public.property_videos for select
  to authenticated
  using (public.administra_aviso(property_id) or public.es_moderador());

-- Insertar y actualizar es cosa del servidor: acá se escribe el estado
-- del render y el costo, y eso no lo dicta el navegador.
create policy "moderacion revisa los videos"
  on public.property_videos for update
  to authenticated
  using (public.es_moderador())
  with check (public.es_moderador());

-- ---------------------------------------------------------------------
-- Progreso, cancelación y reserva en ai_jobs
-- ---------------------------------------------------------------------
alter table public.ai_jobs
  add column progress smallint not null default 0
    check (progress between 0 and 100),
  -- Lo que se apartó al empezar. Se cobra al terminar bien y se devuelve
  -- entero si falla o si se cancela.
  add column reserved_credits integer not null default 0
    check (reserved_credits >= 0),
  add column canceled_at timestamptz,
  -- Referencia del render en el proveedor, para poder preguntarle cómo va.
  add column provider_ref text;

comment on column public.ai_jobs.reserved_credits is
  'Créditos apartados al empezar. Un render que falla los devuelve enteros.';

-- ---------------------------------------------------------------------
-- Reserva de créditos
--
-- Renderizar tarda minutos, así que no sirve cobrar al final y ya: dos
-- pedidos en paralelo con saldo para uno solo se colarían los dos. Se
-- aparta al empezar, con un movimiento negativo de verdad en el libro
-- mayor, y se devuelve con otro positivo si algo sale mal.
--
-- El libro mayor sigue siendo de solo inserción: no se edita ni se borra
-- nada, y la historia queda legible («reserva» y luego «devolución»).
-- ---------------------------------------------------------------------
create or replace function public.reservar_creditos_ia(
  p_job_id uuid,
  p_creditos integer
)
returns public.ai_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  trabajo public.ai_jobs;
  saldo integer;
begin
  select * into trabajo from public.ai_jobs where id = p_job_id for update;
  if not found then
    raise exception 'Ese trabajo no existe';
  end if;
  if trabajo.reserved_credits > 0 then
    return trabajo;  -- ya estaba reservado; no se aparta dos veces
  end if;
  if p_creditos <= 0 then
    return trabajo;
  end if;

  saldo := public.saldo_de_creditos(trabajo.user_id);
  if saldo < p_creditos then
    raise exception 'No te alcanzan los créditos para este video'
      using errcode = '53400';
  end if;

  insert into public.credit_transactions
    (user_id, amount, balance_after, reason, property_id)
  values
    (trabajo.user_id, -p_creditos, saldo - p_creditos,
     'wasi_ai:reserva:' || coalesce(trabajo.operation, trabajo.kind::text),
     trabajo.property_id);

  update public.ai_jobs
     set reserved_credits = p_creditos
   where id = p_job_id
  returning * into trabajo;

  return trabajo;
end;
$$;

/**
 * Devuelve lo reservado.
 *
 * Se llama al fallar y al cancelar. Es idempotente: toma la fila con
 * `for update` y pone la reserva en cero en la misma transacción, así que
 * la segunda llamada ya no encuentra nada que devolver.
 */
create or replace function public.devolver_creditos_ia(
  p_job_id uuid,
  p_motivo text default 'falla'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  trabajo public.ai_jobs;
  saldo integer;
  monto integer;
begin
  -- El monto se lee ANTES de poner la reserva en cero: el RETURNING de un
  -- UPDATE devuelve la fila nueva, y ahí ya sería 0.
  select * into trabajo from public.ai_jobs where id = p_job_id for update;
  if not found or trabajo.reserved_credits <= 0 then return 0; end if;
  monto := trabajo.reserved_credits;

  update public.ai_jobs set reserved_credits = 0 where id = p_job_id;

  saldo := public.saldo_de_creditos(trabajo.user_id);

  insert into public.credit_transactions
    (user_id, amount, balance_after, reason, property_id)
  values
    (trabajo.user_id, monto, saldo + monto,
     'wasi_ai:devolucion:' || p_motivo, trabajo.property_id);

  return monto;
end;
$$;

/**
 * Cierra bien un trabajo que tenía créditos reservados.
 *
 * La reserva ya se cobró al apartarla, así que acá no se vuelve a cobrar:
 * solo se convierte en costo definitivo. Es la diferencia con
 * `terminar_trabajo_ia()`, que cobra en el momento de terminar.
 */
create or replace function public.terminar_trabajo_reservado(
  p_job_id uuid,
  p_output jsonb,
  p_provider text,
  p_model text,
  p_duration_ms integer default null,
  p_provider_cost_micros bigint default null
)
returns public.ai_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  trabajo public.ai_jobs;
begin
  update public.ai_jobs
     set status = 'succeeded',
         output = p_output,
         provider = p_provider,
         model = p_model,
         cost_credits = reserved_credits,
         reserved_credits = 0,
         progress = 100,
         duration_ms = p_duration_ms,
         provider_cost_micros = p_provider_cost_micros,
         finished_at = now()
   where id = p_job_id and status = 'running'
  returning * into trabajo;

  if not found then
    select * into trabajo from public.ai_jobs where id = p_job_id;
  end if;
  return trabajo;
end;
$$;

/** Cuánto va del render. Solo sube: un progreso que retrocede confunde. */
create or replace function public.avanzar_trabajo_ia(
  p_job_id uuid,
  p_progreso smallint,
  p_provider_ref text default null
)
returns public.ai_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  trabajo public.ai_jobs;
begin
  update public.ai_jobs
     set progress = greatest(progress, least(p_progreso, 100)),
         provider_ref = coalesce(p_provider_ref, provider_ref)
   where id = p_job_id and status = 'running'
  returning * into trabajo;

  if not found then
    select * into trabajo from public.ai_jobs where id = p_job_id;
  end if;
  return trabajo;
end;
$$;

/**
 * La persona se arrepintió.
 *
 * Cancelar devuelve lo reservado entero. Un render a medias no se cobra:
 * lo que se lleva la persona es nada, y cobrar por nada es lo que hace
 * que la gente no vuelva a apretar el botón.
 */
-- ---------------------------------------------------------------------
-- Una puerta para las funciones del servidor
--
-- El disparador del sprint 9 impide que el navegador escriba el resultado
-- de un trabajo, y lo hace mirando el rol del token. Cancelar es la
-- primera operación legítima que un usuario `authenticated` necesita
-- hacer sobre esas mismas columnas, así que hace falta distinguir «lo
-- pidió el navegador» de «lo hizo una función nuestra en su nombre».
--
-- Se resuelve con una marca de transacción que solo ponen las funciones
-- SECURITY DEFINER de acá. Un cliente de PostgREST no puede ponerla: no
-- ejecuta SQL suelto, solo las funciones que le concedimos, y ninguna la
-- expone.
-- ---------------------------------------------------------------------
create or replace function public.proteger_trabajo_ia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;
  if current_setting('wasipe.trabajo_ia', true) = 'servidor' then
    return new;
  end if;

  if new.status is distinct from old.status
     or new.output is distinct from old.output
     or new.error is distinct from old.error
     or new.provider is distinct from old.provider
     or new.model is distinct from old.model
     or new.cost_credits is distinct from old.cost_credits
     or new.reserved_credits is distinct from old.reserved_credits
     or new.progress is distinct from old.progress
     or new.input is distinct from old.input
     or new.kind is distinct from old.kind
     or new.operation is distinct from old.operation
     or new.duration_ms is distinct from old.duration_ms then
    raise exception 'El resultado de Wasi AI lo escribe el servidor'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.cancelar_trabajo_ia(p_job_id uuid)
returns public.ai_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  trabajo public.ai_jobs;
begin
  select * into trabajo from public.ai_jobs where id = p_job_id;
  if not found then
    raise exception 'Ese trabajo no existe';
  end if;
  if trabajo.user_id <> auth.uid() and not public.es_moderador() then
    raise exception 'Ese trabajo no es tuyo' using errcode = '42501';
  end if;
  if trabajo.status not in ('queued', 'running') then
    return trabajo;  -- ya terminó; no hay nada que cancelar
  end if;

  -- Dura hasta el final de la transacción: no queda encendida.
  perform set_config('wasipe.trabajo_ia', 'servidor', true);

  perform public.devolver_creditos_ia(p_job_id, 'cancelacion');

  update public.ai_jobs
     set status = 'canceled',
         cost_credits = 0,
         canceled_at = now(),
         finished_at = now()
   where id = p_job_id
  returning * into trabajo;

  update public.property_videos
     set status = 'canceled', finished_at = now()
   where ai_job_id = p_job_id and status in ('queued', 'rendering');

  return trabajo;
end;
$$;

-- Un trabajo fallido o cancelado no puede quedarse con la reserva: sería
-- un cobro silencioso. La base no lo permite.
alter table public.ai_jobs add constraint sin_reserva_al_cerrar
  check (status not in ('succeeded', 'failed', 'canceled') or reserved_credits = 0);

-- ---------------------------------------------------------------------
-- Descarga autorizada
--
-- La cubeta de videos es PRIVADA. No hay URL pública que reenviar: el
-- archivo se entrega con un enlace firmado y de vida corta, y solo a
-- quien administra el aviso. Un video con el precio y el teléfono de
-- alguien no debería quedar accesible para siempre a quien tropiece con
-- la dirección.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'videos', 'videos', false,
  209715200,  -- 200 MB
  array['video/mp4', 'video/webm', 'image/webp', 'image/jpeg']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "los videos los ve quien administra el aviso"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'videos'
    and public.administra_carpeta((storage.foldername(name))[1])
  );

-- Escribir es del servidor, con clave de servicio: nadie sube un video a
-- mano a la carpeta de un aviso.

/**
 * ¿Se puede entregar este video?
 *
 * Tres condiciones, y las tres tienen que darse: que esté listo, que no
 * haya vencido y que quien lo pide administre el aviso.
 */
create or replace function public.puede_descargar_video(p_video_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.property_videos v
     where v.id = p_video_id
       and v.status = 'ready'
       and (v.expires_at is null or v.expires_at > now())
       and public.administra_aviso(v.property_id)
  );
$$;

/** Anota la descarga. Devuelve la ruta solo si corresponde entregarla. */
create or replace function public.registrar_descarga_de_video(p_video_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  ruta text;
begin
  if not public.puede_descargar_video(p_video_id) then
    return null;
  end if;

  update public.property_videos
     set downloads = downloads + 1, last_downloaded_at = now()
   where id = p_video_id
  returning storage_path into ruta;

  return ruta;
end;
$$;

/**
 * Marca vencidos los videos que pasaron su fecha.
 *
 * Borrar el archivo es cosa de la tarea programada, que corre con clave
 * de servicio; acá solo se marca. Separarlo permite que marcar sea barato
 * y que borrar pueda fallar y reintentarse sin perder el estado.
 */
create or replace function public.vencer_videos()
returns setof public.property_videos
language sql
security definer
set search_path = public
as $$
  update public.property_videos
     set status = 'expired'
   where status = 'ready'
     and expires_at is not null
     and expires_at <= now()
  returning *;
$$;

revoke all on function public.reservar_creditos_ia(uuid, integer) from public;
revoke all on function public.devolver_creditos_ia(uuid, text) from public;
revoke all on function public.terminar_trabajo_reservado(
  uuid, jsonb, text, text, integer, bigint) from public;
revoke all on function public.avanzar_trabajo_ia(uuid, smallint, text) from public;
revoke all on function public.cancelar_trabajo_ia(uuid) from public;
revoke all on function public.puede_descargar_video(uuid) from public;
revoke all on function public.registrar_descarga_de_video(uuid) from public;
revoke all on function public.vencer_videos() from public;

grant execute on function public.reservar_creditos_ia(uuid, integer) to service_role;
grant execute on function public.devolver_creditos_ia(uuid, text) to service_role;
grant execute on function public.terminar_trabajo_reservado(
  uuid, jsonb, text, text, integer, bigint) to service_role;
grant execute on function public.avanzar_trabajo_ia(uuid, smallint, text) to service_role;
grant execute on function public.cancelar_trabajo_ia(uuid) to authenticated, service_role;
grant execute on function public.puede_descargar_video(uuid) to authenticated, service_role;
grant execute on function public.registrar_descarga_de_video(uuid)
  to authenticated, service_role;
grant execute on function public.vencer_videos() to service_role;
