-- =====================================================================
-- 20260822080000 — Mejora de fotos y amoblamiento virtual
--
-- Una foto retocada de un inmueble no es una foto bonita: es lo que
-- alguien va a usar para decidir si viaja media hora a ver un
-- departamento. Por eso las reglas de este sprint son casi todas
-- prohibiciones, y casi todas viven en la base:
--
--   · el archivo original no se sobrescribe nunca, ni por la aplicación
--     ni por alguien que hable directo con storage;
--   · toda imagen alterada lleva su etiqueta, y la etiqueta la genera la
--     base para que ninguna vista pueda olvidarse de pintarla;
--   · una imagen editada no entra al aviso hasta que la persona la
--     confirme, y esa confirmación es un trabajo de IA aceptado;
--   · moderación puede marcar y bloquear una imagen sin borrar nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Qué se le puede hacer a una foto
--
-- La lista es cerrada a propósito. Un enumerado y no un texto libre:
-- así no se puede colar mañana un 'remove_damage' sin pasar por una
-- migración que alguien tenga que revisar.
-- ---------------------------------------------------------------------
create type public.media_edit_kind as enum (
  'lighting',       -- luz y exposición
  'white_balance',  -- balance de blancos
  'perspective',    -- corrección de perspectiva (líneas verticales)
  'upscale',        -- más resolución
  'staging',        -- amoblamiento virtual
  'style',          -- variación de estilo de interior
  'wall_color',     -- color de paredes
  'declutter'       -- quitar objetos personales movibles
);

-- Revisión de seguridad de moderación. Una imagen bloqueada no se borra:
-- se deja de mostrar. Borrarla perdería la prueba de lo que se subió.
create type public.media_review_status as enum (
  'not_required',  -- foto original sin editar
  'pending',       -- editada con IA, sin revisar
  'cleared',       -- revisada y correcta
  'flagged',       -- marcada, todavía visible
  'blocked'        -- retirada de la vista pública
);

-- ---------------------------------------------------------------------
-- Columnas nuevas de property_media
-- ---------------------------------------------------------------------
alter table public.property_media
  add column edit_kind public.media_edit_kind,
  -- El amoblamiento virtual lleva su propia etiqueta porque es otra
  -- promesa: no es «esta foto se ve mejor», es «estos muebles no están».
  add column is_staged boolean not null default false,
  add column review_status public.media_review_status not null default 'not_required',
  add column review_reason text,
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  -- Lo que costó de verdad en el proveedor, en millonésimas de dólar.
  -- Se guarda aparte de cost_credits: una cosa es lo que se le cobra a
  -- la persona y otra lo que nos costó a nosotros.
  add column provider_cost_micros bigint check (provider_cost_micros >= 0);

comment on column public.property_media.is_staged is
  'Amoblamiento virtual. Cambia la etiqueta: los muebles no existen.';
comment on column public.property_media.review_status is
  'Revisión de seguridad. "blocked" retira la imagen de la vista pública sin borrarla.';

-- ---------------------------------------------------------------------
-- La etiqueta, otra vez
--
-- Ahora hay dos textos posibles y siguen siendo columna generada: no hay
-- forma de guardar una imagen editada sin etiqueta, ni de que una vista
-- se olvide de mostrarla.
-- ---------------------------------------------------------------------
alter table public.property_media drop column ai_label;

alter table public.property_media
  add column ai_label text
  generated always as (
    case
      when is_staged then 'Amoblamiento virtual — imagen referencial'
      when ai_edited then 'Imagen modificada con Wasi AI'
      else null
    end
  ) stored;

comment on column public.property_media.ai_label is
  'Etiqueta obligatoria de transparencia. La genera la base para que ninguna vista pueda omitirla.';

-- ---------------------------------------------------------------------
-- Lo que la base no acepta
-- ---------------------------------------------------------------------
alter table public.property_media
  -- Una edición dice qué se le hizo. «Editada con IA» a secas no sirve
  -- para nada: la persona tiene derecho a saber qué se tocó.
  add constraint edicion_declara_que_hizo
    check (not ai_edited or edit_kind is not null),
  -- El amoblamiento virtual es una edición, no un original.
  add constraint amoblado_es_edicion
    check (not is_staged or (ai_edited and edit_kind = 'staging')),
  -- Un original no apunta a otro original.
  add constraint original_no_desciende_de_nadie
    check (ai_edited or original_media_id is null),
  -- Y solo lo editado se revisa.
  add constraint solo_lo_editado_se_revisa
    check (ai_edited = (review_status <> 'not_required'));

-- Borrar el original dejaría huérfana a la edición y sin con qué
-- comparar. Antes era `set null`; ahora no se puede.
alter table public.property_media
  drop constraint property_media_original_media_id_fkey;
alter table public.property_media
  add constraint property_media_original_media_id_fkey
  foreign key (original_media_id) references public.property_media (id) on delete restrict;

create index property_media_original_idx on public.property_media (original_media_id)
  where original_media_id is not null;
create index property_media_revision_idx on public.property_media (review_status, created_at desc)
  where review_status in ('pending', 'flagged');

-- ---------------------------------------------------------------------
-- El original no se toca
--
-- Dos cosas distintas: que no se pueda reescribir la fila que apunta al
-- archivo original, y que no se pueda reescribir el archivo. Lo primero
-- es este disparador; lo segundo, la política de storage de más abajo.
-- ---------------------------------------------------------------------
create or replace function public.proteger_foto_original()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  quien_es text := coalesce(auth.role(), '');
begin
  -- Una vez guardado, el archivo original de una foto es el que es.
  if old.original_storage_path is not null
     and new.original_storage_path is distinct from old.original_storage_path then
    raise exception 'El archivo original de una foto no se reemplaza'
      using errcode = '42501';
  end if;

  -- Una foto no cambia de naturaleza: un original no se convierte en
  -- edición ni al revés. Si hay que editar, se crea una fila nueva.
  if new.ai_edited is distinct from old.ai_edited
     or new.original_media_id is distinct from old.original_media_id then
    raise exception 'Una edición se agrega como foto nueva, no se transforma la original'
      using errcode = '42501';
  end if;

  -- La revisión de seguridad la hace Wasipe, no quien publica.
  if quien_es in ('authenticated', 'anon')
     and not public.es_moderador()
     and (new.review_status is distinct from old.review_status
          or new.review_reason is distinct from old.review_reason) then
    raise exception 'La revisión de las imágenes la realiza el equipo de Wasipe'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger property_media_original_protegido
  before update on public.property_media
  for each row execute function public.proteger_foto_original();

-- ---------------------------------------------------------------------
-- Storage: el archivo original tampoco se sobrescribe
--
-- La política de UPDATE del sprint 8 dejaba reemplazar cualquier objeto
-- de la cubeta, subcarpeta `original/` incluida. Se cierra: ahí dentro
-- no se escribe encima de nada.
-- ---------------------------------------------------------------------
alter policy "reemplaza fotos quien administra el aviso" on storage.objects
  using (
    bucket_id = 'avisos'
    and public.administra_carpeta((storage.foldername(name))[1])
    and (storage.foldername(name))[2] is distinct from 'original'
  )
  with check (
    bucket_id = 'avisos'
    and public.administra_carpeta((storage.foldername(name))[1])
    and (storage.foldername(name))[2] is distinct from 'original'
  );

-- ---------------------------------------------------------------------
-- Cola de trabajos: reintentos
--
-- Un proveedor de imágenes falla más que uno de texto —tarda más, se
-- satura, devuelve basura— así que un fallo no puede ser el final del
-- camino. Lo que NO cambia es que cada intento fallido no cobra nada.
-- ---------------------------------------------------------------------
alter table public.ai_jobs
  add column attempts smallint not null default 0 check (attempts >= 0),
  add column max_attempts smallint not null default 3 check (max_attempts between 1 and 10),
  add column next_attempt_at timestamptz,
  add column provider_cost_micros bigint check (provider_cost_micros >= 0);

comment on column public.ai_jobs.attempts is
  'Intentos consumidos. Al llegar a max_attempts el trabajo queda fallido de verdad.';

create index ai_jobs_reintentos_idx on public.ai_jobs (next_attempt_at)
  where status = 'failed' and next_attempt_at is not null;

/**
 * Vuelve a abrir un trabajo que falló.
 *
 * Devuelve NULL cuando ya no quedan intentos: eso es «se acabó», y el
 * asistente lo dice con todas sus letras en vez de reintentar para
 * siempre. No cobra nada: el cobro sigue siendo cosa de terminar bien.
 */
create or replace function public.reintentar_trabajo_ia(p_job_id uuid)
returns public.ai_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  trabajo public.ai_jobs;
begin
  update public.ai_jobs
     set status = 'running',
         error = null,
         started_at = now(),
         finished_at = null,
         next_attempt_at = null
   where id = p_job_id
     and status = 'failed'
     and attempts < max_attempts
  returning * into trabajo;

  if not found then return null; end if;
  return trabajo;
end;
$$;

-- El contador de intentos lo lleva la base, no quien llama: así no se
-- puede reintentar indefinidamente pasando siempre por la misma puerta.
create or replace function public.contar_intento_ia()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'running' and old.status is distinct from 'running' then
    new.attempts := old.attempts + 1;
  end if;
  return new;
end;
$$;

create trigger ai_jobs_cuenta_intentos
  before update on public.ai_jobs
  for each row execute function public.contar_intento_ia();

-- El primer intento también cuenta.
create or replace function public.contar_primer_intento_ia()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'running' then new.attempts := 1; end if;
  return new;
end;
$$;

create trigger ai_jobs_cuenta_primer_intento
  before insert on public.ai_jobs
  for each row execute function public.contar_primer_intento_ia();

-- ---------------------------------------------------------------------
-- Adjuntar una foto editada
--
-- Esta es la única puerta por la que una imagen de IA entra a un aviso,
-- y exige tres cosas a la vez: que el trabajo haya salido bien, que sea
-- de quien lo pide, y que la persona YA lo haya aceptado. Sin la
-- confirmación previa, la función no hace nada.
--
-- Crea una fila NUEVA. La original queda intacta, en su sitio, y la
-- nueva apunta a ella: de ahí sale el antes y después.
-- ---------------------------------------------------------------------
create or replace function public.adjuntar_foto_editada(
  p_job_id uuid,
  p_original_media_id uuid,
  p_url text,
  p_storage_path text,
  p_edit_kind public.media_edit_kind,
  p_width integer default null,
  p_height integer default null,
  p_bytes integer default null
)
returns public.property_media
language plpgsql
security definer
set search_path = public
as $$
declare
  trabajo public.ai_jobs;
  original public.property_media;
  nueva public.property_media;
begin
  select * into trabajo from public.ai_jobs where id = p_job_id;
  if not found then
    raise exception 'Ese trabajo no existe';
  end if;
  if trabajo.user_id <> auth.uid() then
    raise exception 'Ese trabajo no es tuyo' using errcode = '42501';
  end if;
  if trabajo.status <> 'succeeded' then
    raise exception 'Ese trabajo no terminó bien' using errcode = '42501';
  end if;
  if trabajo.accepted_at is null then
    raise exception 'Primero tienes que aceptar el resultado' using errcode = '42501';
  end if;

  select * into original from public.property_media where id = p_original_media_id;
  if not found then
    raise exception 'Esa foto no existe';
  end if;
  if not public.administra_aviso(original.property_id) then
    raise exception 'Ese aviso no es tuyo' using errcode = '42501';
  end if;
  if original.ai_edited then
    raise exception 'No se edita una edición: se parte siempre del original'
      using errcode = '42501';
  end if;

  -- Una edición no se cuela como portada ni se mete entre las demás:
  -- va al final, y mover fotos sigue siendo cosa de la persona.
  insert into public.property_media (
    property_id, kind, url, storage_path, width, height, bytes,
    sort_order, is_cover, alt,
    ai_edited, is_staged, edit_kind, original_media_id, ai_job_id,
    review_status,
    original_storage_path
  )
  values (
    original.property_id, original.kind, p_url, p_storage_path, p_width, p_height, p_bytes,
    coalesce(
      (select max(sort_order) + 1 from public.property_media
        where property_id = original.property_id),
      0
    ),
    false, original.alt,
    true, p_edit_kind = 'staging', p_edit_kind, original.id, p_job_id,
    'pending',
    original.original_storage_path
  )
  returning * into nueva;

  return nueva;
end;
$$;

-- ---------------------------------------------------------------------
-- Revisión de seguridad
--
-- Moderación marca o bloquea; nunca borra. Una imagen bloqueada deja de
-- verse, pero sigue en la base y su archivo sigue en storage: si mañana
-- hay un reclamo, la prueba está.
-- ---------------------------------------------------------------------
create or replace function public.revisar_foto(
  p_media_id uuid,
  p_estado public.media_review_status,
  p_motivo text default null
)
returns public.property_media
language plpgsql
security definer
set search_path = public
as $$
declare
  foto public.property_media;
begin
  if not public.es_moderador() then
    raise exception 'Solo el equipo de Wasipe revisa las imágenes' using errcode = '42501';
  end if;
  if p_estado = 'not_required' then
    raise exception 'Una imagen editada siempre se revisa' using errcode = '22023';
  end if;
  if p_estado in ('flagged', 'blocked') and coalesce(trim(p_motivo), '') = '' then
    raise exception 'Una imagen marcada o bloqueada tiene que explicar por qué'
      using errcode = '22023';
  end if;

  update public.property_media
     set review_status = p_estado,
         review_reason = p_motivo,
         reviewed_at = now(),
         reviewed_by = auth.uid()
   where id = p_media_id and ai_edited
  returning * into foto;

  if not found then
    raise exception 'Esa imagen no existe o no fue editada con IA';
  end if;

  perform public.registrar_auditoria(
    'revisar_imagen', 'property_media', p_media_id,
    null, jsonb_build_object('estado', p_estado, 'motivo', p_motivo)
  );

  return foto;
end;
$$;

-- ---------------------------------------------------------------------
-- Una imagen bloqueada no se muestra
--
-- La política de lectura pública de property_media se estrecha: lo
-- bloqueado solo lo ve quien administra el aviso y moderación.
-- ---------------------------------------------------------------------
alter policy "fotos de avisos publicos" on public.property_media
  using (public.aviso_publico(property_id) and review_status <> 'blocked');

-- Quien publica y moderación sí siguen viendo lo bloqueado: hay que
-- poder explicarle a alguien qué imagen suya se retiró y por qué.
create policy "moderacion ve las fotos bloqueadas"
  on public.property_media for select
  to authenticated
  using (public.es_moderador());

-- ---------------------------------------------------------------------
-- Una edición no entra sin trabajo aceptado
--
-- La política "el anunciante administra sus fotos" es FOR ALL, así que
-- quien publica puede insertar filas. Este disparador exige que una fila
-- marcada como editada con IA venga de un trabajo suyo, terminado bien y
-- YA aceptado. En la práctica eso solo lo consigue
-- `adjuntar_foto_editada()`, que es justamente la idea.
-- ---------------------------------------------------------------------
create or replace function public.exigir_confirmacion_de_edicion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;
  if not new.ai_edited then
    return new;
  end if;

  if not exists (
    select 1 from public.ai_jobs j
     where j.id = new.ai_job_id
       and j.user_id = auth.uid()
       and j.status = 'succeeded'
       and j.accepted_at is not null
  ) then
    raise exception 'Una imagen editada necesita un resultado de Wasi AI que hayas aceptado'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger property_media_edicion_confirmada
  before insert on public.property_media
  for each row execute function public.exigir_confirmacion_de_edicion();

revoke all on function public.reintentar_trabajo_ia(uuid) from public;
revoke all on function public.adjuntar_foto_editada(
  uuid, uuid, text, text, public.media_edit_kind, integer, integer, integer) from public;
revoke all on function public.revisar_foto(uuid, public.media_review_status, text) from public;

grant execute on function public.reintentar_trabajo_ia(uuid) to service_role;
grant execute on function public.adjuntar_foto_editada(
  uuid, uuid, text, text, public.media_edit_kind, integer, integer, integer)
  to authenticated, service_role;
grant execute on function public.revisar_foto(uuid, public.media_review_status, text)
  to authenticated, service_role;
