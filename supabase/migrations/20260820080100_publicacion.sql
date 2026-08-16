-- =====================================================================
-- 20260820080100 — Publicación: borradores, moderación y fotos
-- =====================================================================

-- ---------------------------------------------------------------------
-- listing_drafts — el borrador del asistente de publicación.
--
-- No se guarda en `properties` a propósito. Un aviso a medio llenar no
-- tiene título, ni precio, ni distrito, y `properties` exige las tres
-- cosas. Aflojar esas restricciones para poder guardar borradores sería
-- pagar con la integridad de todos los avisos publicados el poder
-- guardar uno incompleto.
--
-- Los datos van en jsonb porque el asistente va a cambiar de campos
-- muchas veces antes de asentarse, y cada cambio no debería costar una
-- migración. Al enviarlo a revisión, el borrador se valida y recién ahí
-- se convierte en una fila de `properties` con todas sus reglas.
-- ---------------------------------------------------------------------
create table public.listing_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  agency_id uuid references public.agencies (id) on delete set null,

  -- Si el borrador nació para editar un aviso ya publicado, acá queda a
  -- cuál. Así se puede corregir un aviso rechazado sin perder el
  -- original ni duplicarlo.
  property_id uuid references public.properties (id) on delete cascade,

  datos jsonb not null default '{}'::jsonb,
  paso smallint not null default 0 check (paso between 0 and 9),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index listing_drafts_user_idx on public.listing_drafts (user_id, updated_at desc);

-- Un solo borrador por aviso en edición: si no, dos pestañas abiertas
-- terminan creando dos borradores del mismo aviso y uno pisa al otro.
create unique index listing_drafts_por_aviso
  on public.listing_drafts (property_id)
  where property_id is not null;

create trigger listing_drafts_updated_at
  before update on public.listing_drafts
  for each row execute function public.tocar_updated_at();

alter table public.listing_drafts enable row level security;

create policy "mis borradores"
  on public.listing_drafts for all
  to authenticated
  using (
    user_id = auth.uid()
    or (agency_id is not null and public.publica_en_agencia(agency_id))
  )
  with check (
    user_id = auth.uid()
    or (agency_id is not null and public.publica_en_agencia(agency_id))
  );

comment on table public.listing_drafts is
  'Avisos a medio llenar. Se validan y pasan a properties recién al enviarse a revisión.';

-- ---------------------------------------------------------------------
-- Moderación: quién revisó y cuándo.
--
-- `rejection_reason` ya existía. Faltaba el rastro de la revisión, que
-- es lo que permite responder "¿por qué me lo rechazaron y quién?" sin
-- tener que buscar en la bitácora.
-- ---------------------------------------------------------------------
alter table public.properties
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column submitted_at timestamptz,
  add column archived_at timestamptz;

comment on column public.properties.submitted_at is
  'Cuándo se envió a revisión. Con esto se mide cuánto tarda la moderación.';

-- Cola de moderación, ordenada por antigüedad: primero el que espera más.
create index properties_cola_revision_idx
  on public.properties (submitted_at)
  where publication_status = 'in_review';

-- ---------------------------------------------------------------------
-- Fotos: se conserva el archivo original.
--
-- Lo que se muestra es una versión comprimida —una foto de celular pesa
-- 6 MB y nadie va a esperar eso en una conexión móvil— pero el archivo
-- tal como salió de la cámara no se toca. Si mañana hay que reprocesar,
-- o si alguien reclama que su foto fue alterada, el original está.
-- ---------------------------------------------------------------------
alter table public.property_media
  add column original_storage_path text,
  add column original_bytes integer check (original_bytes > 0),
  add column bytes integer check (bytes > 0);

comment on column public.property_media.original_storage_path is
  'Archivo tal como lo subieron, sin comprimir. Nunca se borra mientras exista el aviso.';

-- ---------------------------------------------------------------------
-- ¿Puede esta persona escribir en esta carpeta?
--
-- Las fotos se suben ANTES de que el aviso exista: en el asistente, la
-- carpeta es el identificador del borrador. Recién al enviarlo a
-- revisión nace la fila de `properties`.
--
-- Por eso la carpeta puede ser un borrador propio o un aviso que la
-- persona administra. Cualquier otro identificador queda afuera.
-- ---------------------------------------------------------------------
create or replace function public.administra_carpeta(p_carpeta text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  id_carpeta uuid;
begin
  -- Una carpeta que no es un uuid no pertenece a nadie.
  begin
    id_carpeta := p_carpeta::uuid;
  exception when others then
    return false;
  end;

  if exists (
    select 1 from public.listing_drafts d
    where d.id = id_carpeta
      and (d.user_id = auth.uid()
           or (d.agency_id is not null and public.publica_en_agencia(d.agency_id)))
  ) then
    return true;
  end if;

  return public.administra_aviso(id_carpeta);
end;
$$;

grant execute on function public.administra_carpeta(text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Cubeta de fotos de avisos.
--
-- Pública de lectura: las fotos de un aviso publicado las tiene que ver
-- cualquiera. Escribir es otra cosa: la carpeta es el identificador del
-- aviso y solo puede tocarla quien lo administra.
--
--     avisos/<id-del-aviso>/<marca>.webp
--     avisos/<id-del-aviso>/original/<marca>.jpg
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avisos', 'avisos', true,
  15728640,  -- 15 MB: entra una foto de celular sin comprimir
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "las fotos de los avisos son publicas"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'avisos');

create policy "sube fotos quien administra el aviso"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avisos'
    and public.administra_carpeta((storage.foldername(name))[1])
  );

create policy "reemplaza fotos quien administra el aviso"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avisos'
    and public.administra_carpeta((storage.foldername(name))[1])
  )
  with check (
    bucket_id = 'avisos'
    and public.administra_carpeta((storage.foldername(name))[1])
  );

create policy "borra fotos quien administra el aviso"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avisos'
    and public.administra_carpeta((storage.foldername(name))[1])
    -- El original no se borra desde la aplicación. Se conserva mientras
    -- exista el aviso; cuando el aviso se elimina, cae con él.
    and (storage.foldername(name))[2] is distinct from 'original'
  );

-- ---------------------------------------------------------------------
-- Publicar no se puede saltar la moderación.
--
-- El trigger del Sprint 3 ya impedía que alguien se aprobara solo. Acá
-- se completa: se fijan las fechas de envío y de revisión, y se exige
-- que un aviso rechazado explique por qué, con quién lo revisó.
-- ---------------------------------------------------------------------
create or replace function public.proteger_estados_aviso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Marcas de tiempo del flujo. Se ponen acá y no en la aplicación para
  -- que valgan también cuando el cambio viene de la API o de un script.
  if new.publication_status = 'in_review'
     and old.publication_status is distinct from 'in_review' then
    new.submitted_at := now();
  end if;

  if new.publication_status in ('published', 'rejected')
     and old.publication_status is distinct from new.publication_status then
    new.reviewed_at := now();
    new.reviewed_by := coalesce(new.reviewed_by, auth.uid());
  end if;

  if new.publication_status = 'archived'
     and old.publication_status is distinct from 'archived' then
    new.archived_at := now();
  end if;

  -- Al publicarse por primera vez se fija la fecha de publicación; al
  -- reanudarse una pausa NO se toca, para no falsear la antigüedad.
  if new.publication_status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;

  if public.es_moderador() then
    return new;
  end if;

  if new.verification_status is distinct from old.verification_status then
    raise exception 'La verificación del aviso la realiza el equipo de Wasipe'
      using errcode = '42501';
  end if;

  if new.publication_status = 'published'
     and old.publication_status not in ('published', 'paused') then
    raise exception 'El aviso tiene que pasar por revisión antes de publicarse'
      using errcode = '42501';
  end if;

  if new.publication_status = 'rejected'
     and old.publication_status is distinct from 'rejected' then
    raise exception 'Solo el equipo de Wasipe puede rechazar un aviso'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Un aviso rechazado sin motivo deja a la persona sin saber qué corregir.
-- La restricción ya existía; acá se suma que el motivo tenga contenido.
alter table public.properties drop constraint rechazo_explicado;
alter table public.properties
  add constraint rechazo_explicado
  check (
    publication_status <> 'rejected'
    or (rejection_reason is not null and length(trim(rejection_reason)) >= 10)
  );
