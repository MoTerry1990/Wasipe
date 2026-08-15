-- =====================================================================
-- 20260815120600 — Trabajos de Wasi AI y bitácora de auditoría
-- =====================================================================

-- ---------------------------------------------------------------------
-- ai_jobs — cada pedido a Wasi AI.
--
-- Dos reglas del producto viven acá:
--   · Nada que genere la IA se publica sin que la persona lo confirme.
--     Por eso `accepted_at` empieza en NULL y hay que llenarlo a mano.
--   · Toda estimación de precio es referencial, no una tasación. El
--     texto de la advertencia va en la salida del trabajo.
-- ---------------------------------------------------------------------
create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,

  kind public.ai_job_kind not null,
  status public.ai_job_status not null default 'queued',

  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error text,

  provider text,
  model text,
  cost_credits integer not null default 0 check (cost_credits >= 0),

  -- Confirmación explícita de la persona antes de aplicar el resultado.
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  discarded_at timestamptz,

  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,

  -- Un trabajo aceptado tiene que haber terminado bien.
  constraint aceptado_solo_si_exitoso
    check (accepted_at is null or status = 'succeeded'),
  -- No se acepta y se descarta al mismo tiempo.
  constraint aceptado_o_descartado
    check (accepted_at is null or discarded_at is null),
  -- Un trabajo fallido explica por qué.
  constraint fallo_explicado
    check (status <> 'failed' or error is not null)
);

create index ai_jobs_user_idx on public.ai_jobs (user_id, created_at desc);
create index ai_jobs_property_idx on public.ai_jobs (property_id) where property_id is not null;
create index ai_jobs_pendientes_idx on public.ai_jobs (status, created_at)
  where status in ('queued', 'running');

comment on column public.ai_jobs.accepted_at is
  'Confirmación de la persona. Mientras sea NULL, el resultado no se aplica al aviso.';

-- Ahora sí se puede enlazar la foto editada con el trabajo que la generó.
alter table public.property_media
  add constraint property_media_ai_job_fk
  foreign key (ai_job_id) references public.ai_jobs (id) on delete set null;

-- ---------------------------------------------------------------------
-- audit_logs — quién hizo qué.
--
-- Cubre lo sensible: cambios de rol, moderación de avisos, resolución de
-- denuncias y movimientos de créditos. Nadie la edita ni la borra; las
-- políticas solo permiten leerla a administración.
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  -- La IP se guarda para investigar abuso. Es dato personal según la Ley
  -- 29733: se conserva 12 meses y después se purga (tarea programada).
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_logs_entity_idx on public.audit_logs (entity, entity_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

-- Registrar sin depender de que la aplicación se acuerde.
create or replace function public.registrar_auditoria(
  p_action text,
  p_entity text,
  p_entity_id uuid default null,
  p_before jsonb default null,
  p_after jsonb default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_logs (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_before, p_after);
$$;
