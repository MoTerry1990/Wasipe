-- =====================================================================
-- 20260821080000 — Asistente de avisos de Wasi AI
--
-- La tabla `ai_jobs` ya existía desde el sprint 3. Lo que falta acá es
-- el contrato que hace que se pueda enchufar un proveedor de verdad sin
-- que el cliente pueda mentir sobre lo que pasó:
--
--   · un pedido repetido devuelve el mismo trabajo, no cobra dos veces;
--   · un trabajo que falla no descuenta ni un crédito;
--   · el navegador no puede escribir el resultado, el proveedor, el
--     modelo ni el costo: eso lo escriben funciones del servidor;
--   · lo único que la persona puede tocar es aceptar o descartar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Columnas nuevas
-- ---------------------------------------------------------------------

-- `kind` dice de qué familia es el trabajo; `operation` dice exactamente
-- qué se pidió dentro de esa familia. Un mismo 'listing_draft' puede ser
-- el título, la descripción o los textos alternativos de las fotos, y
-- para medir el uso hay que poder separarlos.
alter table public.ai_jobs add column operation text;

-- Clave de idempotencia. La arma el servidor a partir de lo que se pidió,
-- así que dos clics seguidos en el mismo botón con los mismos datos son
-- el mismo trabajo y no dos cobros.
alter table public.ai_jobs add column idempotency_key text;

-- Cuánto tardó el proveedor. Se guarda aparte de started_at/finished_at
-- porque esos dos incluyen la cola, y lo que interesa medir es el modelo.
alter table public.ai_jobs add column duration_ms integer
  check (duration_ms is null or duration_ms >= 0);

create unique index ai_jobs_idempotencia_idx
  on public.ai_jobs (user_id, kind, idempotency_key)
  where idempotency_key is not null;

create index ai_jobs_operacion_idx on public.ai_jobs (operation, created_at desc)
  where operation is not null;

comment on column public.ai_jobs.idempotency_key is
  'Huella del pedido. Dos pedidos iguales devuelven el mismo trabajo.';

-- Un trabajo que no salió bien no cobra. Es regla del producto y va
-- escrita en la base, no solo en el código que la llama.
alter table public.ai_jobs add constraint fallo_no_cobra
  check (status not in ('failed', 'canceled') or cost_credits = 0);

-- ---------------------------------------------------------------------
-- El navegador no escribe resultados
--
-- La política de UPDATE deja a cada quien tocar sus propios trabajos:
-- hace falta para aceptar o descartar. Sin este disparador, esa misma
-- política dejaría escribir el `output`, marcar 'succeeded' un trabajo
-- que nunca corrió o poner el costo en cero.
--
-- Las funciones de más abajo son SECURITY DEFINER: corren como dueñas de
-- la base, no como `authenticated`, así que pasan de largo.
-- ---------------------------------------------------------------------
create or replace function public.proteger_trabajo_ia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Se mira el rol del token, no `current_user`: dentro de una función
  -- SECURITY DEFINER `current_user` ya es la dueña de la base y este
  -- disparador dejaría pasar todo.
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.status is distinct from old.status
     or new.output is distinct from old.output
     or new.error is distinct from old.error
     or new.provider is distinct from old.provider
     or new.model is distinct from old.model
     or new.cost_credits is distinct from old.cost_credits
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

create trigger ai_jobs_resultado_protegido
  before update on public.ai_jobs
  for each row execute function public.proteger_trabajo_ia();

-- La política de UPDATE exigía que `accepted_by` fuera siempre quien
-- consulta, y eso dejaba fuera el caso de descartar: ahí nadie acepta
-- nada y la columna queda en NULL. Se afloja para que el disparador de
-- arriba sea el que decida, que es el que sabe qué se está tocando.
alter policy "acepto o descarto lo que propuso la ia" on public.ai_jobs
  with check (
    user_id = auth.uid()
    and (accepted_by is null or accepted_by = auth.uid())
  );

-- Y tampoco se inventa un trabajo ya cobrado al insertarlo.
alter policy "pido trabajos de ia a mi nombre" on public.ai_jobs
  with check (
    user_id = auth.uid()
    and status = 'queued'
    and accepted_at is null
    and cost_credits = 0
    and output is null
    and (property_id is null or public.administra_aviso(property_id))
  );

-- ---------------------------------------------------------------------
-- Créditos
-- ---------------------------------------------------------------------

/** Saldo de créditos de una persona. El libro mayor es de solo inserción. */
create or replace function public.saldo_de_creditos(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select balance_after
       from public.credit_transactions
      where user_id = p_user
      order by id desc
      limit 1),
    0
  );
$$;

revoke all on function public.saldo_de_creditos(uuid) from public;
grant execute on function public.saldo_de_creditos(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Ciclo de vida de un trabajo
-- ---------------------------------------------------------------------

/**
 * Pide un trabajo a Wasi AI.
 *
 * Devuelve el trabajo, sea recién creado o el que ya existía con la
 * misma clave de idempotencia. `p_limite_hora` es el tope de pedidos por
 * hora y por persona; cuando se pasa, levanta excepción en vez de
 * devolver un trabajo, porque el asistente tiene que poder decir
 * exactamente qué pasó.
 *
 * El costo NO se cobra acá: se reserva la comprobación de saldo y el
 * descuento ocurre recién si el proveedor responde bien.
 */
create or replace function public.iniciar_trabajo_ia(
  p_kind public.ai_job_kind,
  p_operation text,
  p_input jsonb,
  p_idempotency_key text,
  p_property_id uuid default null,
  p_costo integer default 0,
  p_limite_hora integer default 30
)
returns public.ai_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  quien uuid := auth.uid();
  trabajo public.ai_jobs;
begin
  if quien is null then
    raise exception 'Inicia sesión para usar Wasi AI' using errcode = '42501';
  end if;

  -- Pedido repetido: se devuelve el de antes tal cual.
  select * into trabajo
    from public.ai_jobs
   where user_id = quien and kind = p_kind and idempotency_key = p_idempotency_key;
  if found then
    return trabajo;
  end if;

  if p_property_id is not null and not public.administra_aviso(p_property_id) then
    raise exception 'Ese aviso no es tuyo' using errcode = '42501';
  end if;

  if not public.consumir_cupo('ia', quien::text, p_limite_hora, 3600) then
    raise exception 'Llegaste al límite de pedidos a Wasi AI por hora'
      using errcode = '53400';
  end if;

  if p_costo > 0 and public.saldo_de_creditos(quien) < p_costo then
    raise exception 'No te alcanzan los créditos para este pedido'
      using errcode = '53400';
  end if;

  insert into public.ai_jobs
    (user_id, property_id, kind, operation, status, input, idempotency_key, started_at)
  values
    (quien, p_property_id, p_kind, p_operation, 'running', p_input, p_idempotency_key, now())
  on conflict (user_id, kind, idempotency_key) where idempotency_key is not null
    do nothing
  returning * into trabajo;

  -- Dos pedidos idénticos a la vez: gana el primero, el segundo lo lee.
  if not found then
    select * into trabajo
      from public.ai_jobs
     where user_id = quien and kind = p_kind and idempotency_key = p_idempotency_key;
  end if;

  return trabajo;
end;
$$;

/**
 * El proveedor respondió bien.
 *
 * Acá sí se cobra, y en la misma transacción que se guarda el resultado:
 * o quedan las dos cosas o no queda ninguna.
 */
create or replace function public.terminar_trabajo_ia(
  p_job_id uuid,
  p_output jsonb,
  p_provider text,
  p_model text,
  p_costo integer default 0,
  p_duration_ms integer default null
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
  if trabajo.status <> 'running' then
    return trabajo;  -- ya lo cerró otra llamada; no se cobra dos veces
  end if;

  if p_costo > 0 then
    saldo := public.saldo_de_creditos(trabajo.user_id);
    if saldo < p_costo then
      raise exception 'No te alcanzan los créditos para este pedido'
        using errcode = '53400';
    end if;
    insert into public.credit_transactions
      (user_id, amount, balance_after, reason, property_id)
    values
      (trabajo.user_id, -p_costo, saldo - p_costo,
       'wasi_ai:' || coalesce(trabajo.operation, trabajo.kind::text),
       trabajo.property_id);
  end if;

  update public.ai_jobs
     set status = 'succeeded',
         output = p_output,
         provider = p_provider,
         model = p_model,
         cost_credits = p_costo,
         duration_ms = p_duration_ms,
         finished_at = now()
   where id = p_job_id
  returning * into trabajo;

  return trabajo;
end;
$$;

/** El proveedor falló o no estaba disponible. No se cobra nada. */
create or replace function public.fallar_trabajo_ia(
  p_job_id uuid,
  p_error text,
  p_provider text default null,
  p_duration_ms integer default null
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
     set status = 'failed',
         error = coalesce(nullif(p_error, ''), 'Error sin detalle'),
         provider = coalesce(p_provider, provider),
         cost_credits = 0,
         duration_ms = p_duration_ms,
         finished_at = now()
   where id = p_job_id and status = 'running'
  returning * into trabajo;

  if not found then
    select * into trabajo from public.ai_jobs where id = p_job_id;
  end if;
  return trabajo;
end;
$$;

/**
 * La persona confirma que quiere usar lo que propuso la IA.
 *
 * Nada se aplica al aviso sin pasar por acá. La función no toca el
 * aviso: solo deja constancia de la confirmación. Escribir el texto en
 * el borrador es cosa del asistente, que ya sabe cómo hacerlo.
 */
create or replace function public.aceptar_trabajo_ia(p_job_id uuid)
returns public.ai_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  trabajo public.ai_jobs;
begin
  update public.ai_jobs
     set accepted_at = now(), accepted_by = auth.uid()
   where id = p_job_id
     and user_id = auth.uid()
     and status = 'succeeded'
     and accepted_at is null
     and discarded_at is null
  returning * into trabajo;

  if not found then
    raise exception 'Ese resultado ya no se puede aplicar' using errcode = '42501';
  end if;
  return trabajo;
end;
$$;

/** La persona no quiere lo que propuso la IA. */
create or replace function public.descartar_trabajo_ia(p_job_id uuid)
returns public.ai_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  trabajo public.ai_jobs;
begin
  update public.ai_jobs
     set discarded_at = now()
   where id = p_job_id and user_id = auth.uid() and accepted_at is null
  returning * into trabajo;
  return trabajo;
end;
$$;

revoke all on function public.iniciar_trabajo_ia(
  public.ai_job_kind, text, jsonb, text, uuid, integer, integer) from public;
revoke all on function public.terminar_trabajo_ia(uuid, jsonb, text, text, integer, integer) from public;
revoke all on function public.fallar_trabajo_ia(uuid, text, text, integer) from public;
revoke all on function public.aceptar_trabajo_ia(uuid) from public;
revoke all on function public.descartar_trabajo_ia(uuid) from public;

grant execute on function public.iniciar_trabajo_ia(
  public.ai_job_kind, text, jsonb, text, uuid, integer, integer) to authenticated, service_role;
grant execute on function public.terminar_trabajo_ia(uuid, jsonb, text, text, integer, integer)
  to service_role;
grant execute on function public.fallar_trabajo_ia(uuid, text, text, integer)
  to service_role;
grant execute on function public.aceptar_trabajo_ia(uuid) to authenticated, service_role;
grant execute on function public.descartar_trabajo_ia(uuid) to authenticated, service_role;
