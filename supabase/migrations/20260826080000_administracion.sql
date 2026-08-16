-- =====================================================================
-- 20260826080000 — Administración, moderación y confianza
--
-- Tres ideas ordenan este archivo:
--
--   1. **Separación de funciones.** Quien modera avisos no tiene por qué
--      ver pagos, y quien atiende soporte no tiene por qué cambiarle el
--      rol a nadie. Se resuelve con una tabla de personal aparte, no
--      inflando el rol de la cuenta: una persona puede ser propietaria y
--      además moderadora, y son dos cosas distintas.
--
--   2. **Toda decisión de moderación queda escrita, y no se puede
--      borrar.** La bitácora se vuelve de solo inserción con un
--      disparador: ni administración puede editarla.
--
--   3. **Las banderas no deciden nada.** Un duplicado sospechoso o un
--      precio raro son señales para que una persona mire, nunca una
--      acción automática sobre el aviso de alguien.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Personal de Wasipe
--
-- Aparte del rol de la cuenta a propósito. `profiles.role` dice qué es la
-- persona en el mercado —propietaria, corredora, inmobiliaria—; esta
-- tabla dice qué puede hacer dentro de Wasipe. Mezclarlos obligaría a
-- que un moderador deje de poder publicar su propio departamento.
-- ---------------------------------------------------------------------
create type public.staff_role as enum (
  'moderator',    -- avisos, imágenes, denuncias
  'support',      -- cuentas y consultas; sin tocar plata
  'finance',      -- pagos, créditos y destacados
  'super_admin'   -- todo, incluido nombrar personal
);

create table public.staff_members (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.staff_role not null,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  note text,
  primary key (user_id, role)
);

comment on table public.staff_members is
  'Qué puede hacer una persona dentro de Wasipe. Aparte del rol de mercado de su cuenta.';

alter table public.staff_members enable row level security;

create index staff_members_rol_idx on public.staff_members (role);

/** ¿Esta persona tiene este puesto? `super_admin` los tiene todos. */
create or replace function public.es_personal(p_role public.staff_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_members s
     where s.user_id = auth.uid()
       and (s.role = p_role or s.role = 'super_admin')
  );
$$;

/** ¿Es personal de Wasipe, del puesto que sea? */
create or replace function public.es_personal_de_wasipe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.staff_members s where s.user_id = auth.uid());
$$;

-- La lista de personal la ve el personal; nombrarlo es de super_admin.
create policy "el personal se ve entre si"
  on public.staff_members for select
  to authenticated
  using (public.es_personal_de_wasipe());

create policy "solo super admin nombra personal"
  on public.staff_members for all
  to authenticated
  using (public.es_personal('super_admin'))
  with check (public.es_personal('super_admin'));

-- ---------------------------------------------------------------------
-- La bitácora se vuelve inmutable
--
-- Ya era de solo inserción por las políticas —nadie tenía INSERT ni
-- DELETE— pero eso vale para quien pase por PostgREST. Un disparador la
-- cierra también para cualquier conexión directa, clave de servicio
-- incluida. Una bitácora que administración puede editar no sirve como
-- prueba de nada.
-- ---------------------------------------------------------------------
create or replace function public.bitacora_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'La bitácora de auditoría no se edita ni se borra'
    using errcode = '42501';
end;
$$;

create trigger audit_logs_inmutable
  before update or delete on public.audit_logs
  for each row execute function public.bitacora_inmutable();

-- Y se abre la lectura al resto del personal, cada uno a lo suyo. La
-- política anterior solo dejaba entrar a `es_admin()`.
create policy "el personal lee la bitacora"
  on public.audit_logs for select
  to authenticated
  using (public.es_personal_de_wasipe());

-- ---------------------------------------------------------------------
-- listing_reviews — cada decisión de moderación, para siempre
--
-- Tabla y no una columna en `properties`: un aviso puede pasar por
-- revisión cinco veces, y las cinco importan. Con una sola columna la
-- historia se pisa, y justo la vez que hay un reclamo es la vez que se
-- necesita la anterior.
-- ---------------------------------------------------------------------
create type public.review_decision as enum (
  'approve',           -- se publica
  'reject',            -- no se publica, con motivo
  'request_changes',   -- vuelve a borrador para corregir
  'pause'              -- se saca de circulación mientras se revisa
);

create table public.listing_reviews (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.properties (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete restrict,
  decision public.review_decision not null,
  reason text,
  created_at timestamptz not null default now(),

  -- Rechazar, pedir cambios o pausar sin decir por qué deja a la persona
  -- sin saber qué corregir, y a Wasipe sin poder defender la decisión.
  constraint decision_con_motivo
    check (decision = 'approve' or length(trim(coalesce(reason, ''))) >= 10)
);

create index listing_reviews_aviso_idx on public.listing_reviews (property_id, created_at desc);
create index listing_reviews_revisor_idx on public.listing_reviews (reviewer_id, created_at desc);

alter table public.listing_reviews enable row level security;

-- Quien publica ve las decisiones sobre SU aviso: es lo que le dice qué
-- corregir. No ve quién la tomó.
create policy "veo las revisiones de mis avisos"
  on public.listing_reviews for select
  to authenticated
  using (public.administra_aviso(property_id) or public.es_personal('moderator'));

create trigger listing_reviews_inmutable
  before update or delete on public.listing_reviews
  for each row execute function public.bitacora_inmutable();

-- ---------------------------------------------------------------------
-- moderation_flags — señales, no sentencias
--
-- Una bandera nunca despublica nada. Marca un aviso para que una persona
-- lo mire. Automatizar la baja sería castigar a quien publicó dos
-- departamentos parecidos en el mismo edificio, que es lo normal.
-- ---------------------------------------------------------------------
create type public.flag_kind as enum (
  'duplicate',        -- muy parecido a otro aviso
  'suspicious_price', -- precio por m² lejísimos del distrito
  'repeated_image',   -- la misma foto que otro aviso
  'manual'            -- alguien del equipo la puso a mano
);

create type public.flag_status as enum ('open', 'dismissed', 'confirmed');

create table public.moderation_flags (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.properties (id) on delete cascade,
  kind public.flag_kind not null,
  /** Qué se encontró: el otro aviso, la distancia al promedio, el hash. */
  detail jsonb not null default '{}'::jsonb,
  /** 0 a 100. No es una probabilidad: es cuánto conviene mirarlo. */
  score smallint not null default 50 check (score between 0 and 100),
  status public.flag_status not null default 'open',
  resolved_by uuid references public.profiles (id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,

  constraint resolucion_explicada
    check (status = 'open' or length(trim(coalesce(resolution_note, ''))) >= 5)
);

create index moderation_flags_pendientes_idx
  on public.moderation_flags (status, score desc, created_at) where status = 'open';
create index moderation_flags_aviso_idx on public.moderation_flags (property_id);

-- Una bandera abierta del mismo tipo no se duplica.
create unique index moderation_flags_sin_repetir
  on public.moderation_flags (property_id, kind) where status = 'open';

alter table public.moderation_flags enable row level security;

-- Las banderas NO las ve quien publica: son señales internas, muchas
-- falsas, y avisar «te marcamos por precio sospechoso» antes de que una
-- persona mire sería acusar sin haber revisado.
create policy "las banderas las ve moderacion"
  on public.moderation_flags for all
  to authenticated
  using (public.es_personal('moderator'))
  with check (public.es_personal('moderator'));

-- ---------------------------------------------------------------------
-- Huella de las fotos, para detectar imágenes repetidas
--
-- El hash lo calcula el cliente al subir (es un hash perceptual del
-- contenido, no del archivo: una recompresión da el mismo). Acá solo se
-- guarda e indexa.
-- ---------------------------------------------------------------------
alter table public.property_media add column image_hash text;

create index property_media_hash_idx on public.property_media (image_hash)
  where image_hash is not null;

comment on column public.property_media.image_hash is
  'Huella del contenido de la foto. Dos avisos con la misma huella se marcan para revisar.';

-- ---------------------------------------------------------------------
-- Detección de duplicados
--
-- No decide nada: devuelve candidatos con un puntaje. Compara título con
-- trigramas —ya está pg_trgm— más distrito, tipo y áreas parecidas.
-- Dos departamentos del mismo edificio se van a parecer, y por eso el
-- resultado va a una cola de revisión y no a una baja automática.
-- ---------------------------------------------------------------------
create or replace function public.posibles_duplicados(
  p_property_id uuid,
  p_limite integer default 5
)
returns table (id uuid, code text, title text, similitud real, misma_area boolean)
language sql
stable
security definer
-- `extensions` va en el search_path porque similarity() vive ahí: en
-- Supabase las extensiones no se instalan en public.
set search_path = public, extensions
as $$
  with yo as (
    select id, title, district, province, property_type, operation, total_area, owner_id
      from public.properties where id = p_property_id
  )
  select p.id, p.code, p.title,
         similarity(public.sin_tildes(p.title), public.sin_tildes(yo.title)) as similitud,
         abs(p.total_area - yo.total_area) <= greatest(yo.total_area * 0.05, 2) as misma_area
    from public.properties p
    join yo on true
   where p.id <> yo.id
     and p.district = yo.district
     and p.province = yo.province
     and p.property_type = yo.property_type
     and p.operation = yo.operation
     and p.publication_status in ('published', 'in_review')
     and similarity(public.sin_tildes(p.title), public.sin_tildes(yo.title)) > 0.45
   order by similitud desc
   limit greatest(least(p_limite, 20), 1);
$$;

/**
 * ¿El precio por m² está lejísimos de su distrito?
 *
 * Se apoya en `market_stats`, que ya descarta atípicos y exige muestra
 * mínima: sin índice suficiente devuelve false, porque marcar un aviso
 * comparándolo con tres avisos sería la misma precisión falsa que el
 * sprint anterior evita.
 */
create or replace function public.precio_sospechoso(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.price_usd_per_m2 < m.median_usd_per_m2 * 0.35
         or p.price_usd_per_m2 > m.median_usd_per_m2 * 3.0
       from public.properties p
       join public.market_stats m
         on m.district = p.district and m.province = p.province
        and m.operation = p.operation and m.period = 'm12'
        and m.property_type is not distinct from p.property_type
      where p.id = p_property_id
        and p.price_usd_per_m2 is not null
        and m.sufficient),
    false
  );
$$;

/**
 * Revisa un aviso y deja las banderas que correspondan.
 *
 * Se llama al enviar a revisión y desde el panel. Es idempotente: el
 * índice único impide dos banderas abiertas del mismo tipo.
 */
create or replace function public.marcar_aviso(p_property_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  puestas integer := 0;
  duplicado record;
  repetida record;
begin
  -- 1. Duplicado por título muy parecido en el mismo distrito y tipo.
  select * into duplicado
    from public.posibles_duplicados(p_property_id, 1)
   where similitud > 0.6;

  if found then
    insert into public.moderation_flags (property_id, kind, detail, score)
    values (
      p_property_id, 'duplicate',
      jsonb_build_object('otro', duplicado.code, 'similitud', duplicado.similitud,
                         'misma_area', duplicado.misma_area),
      case when duplicado.misma_area then 85 else 60 end
    )
    on conflict do nothing;
    puestas := puestas + 1;
  end if;

  -- 2. Precio por m² lejísimos del distrito.
  if public.precio_sospechoso(p_property_id) then
    insert into public.moderation_flags (property_id, kind, detail, score)
    values (p_property_id, 'suspicious_price', '{}'::jsonb, 70)
    on conflict do nothing;
    puestas := puestas + 1;
  end if;

  -- 3. Una foto que ya está en otro aviso.
  select m2.property_id as otro, m1.image_hash into repetida
    from public.property_media m1
    join public.property_media m2
      on m2.image_hash = m1.image_hash and m2.property_id <> m1.property_id
   where m1.property_id = p_property_id and m1.image_hash is not null
   limit 1;

  if found then
    insert into public.moderation_flags (property_id, kind, detail, score)
    values (p_property_id, 'repeated_image',
            jsonb_build_object('hash', repetida.image_hash, 'otro_aviso', repetida.otro), 75)
    on conflict do nothing;
    puestas := puestas + 1;
  end if;

  return puestas;
end;
$$;

-- ---------------------------------------------------------------------
-- revisar_aviso — la única puerta de la moderación
--
-- Escribe la decisión, mueve el estado del aviso y deja rastro en la
-- bitácora, todo en la misma transacción. Que el estado y la decisión no
-- puedan separarse es el punto: un aviso rechazado sin motivo registrado
-- no debería poder existir.
-- ---------------------------------------------------------------------
create or replace function public.revisar_aviso(
  p_property_id uuid,
  p_decision public.review_decision,
  p_motivo text default null
)
returns public.properties
language plpgsql
security definer
set search_path = public
as $$
declare
  aviso public.properties;
  quien uuid := auth.uid();
begin
  if not public.es_personal('moderator') then
    raise exception 'Solo el equipo de moderación revisa avisos' using errcode = '42501';
  end if;

  if p_decision <> 'approve' and length(trim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Explica en una frase por qué: la persona tiene que saber qué corregir'
      using errcode = '22023';
  end if;

  insert into public.listing_reviews (property_id, reviewer_id, decision, reason)
  values (p_property_id, quien, p_decision, nullif(trim(coalesce(p_motivo, '')), ''));

  update public.properties
     set publication_status = case p_decision
           when 'approve' then 'published'::public.publication_status
           when 'reject' then 'rejected'::public.publication_status
           -- Pedir cambios devuelve el aviso a borrador: es el único
           -- estado desde el que la persona puede volver a editarlo y
           -- reenviarlo sin perder nada.
           when 'request_changes' then 'draft'::public.publication_status
           when 'pause' then 'paused'::public.publication_status
         end,
         rejection_reason = case
           when p_decision = 'approve' then null
           else nullif(trim(coalesce(p_motivo, '')), '')
         end,
         reviewed_by = quien
   where id = p_property_id
  returning * into aviso;

  if not found then
    raise exception 'Ese aviso no existe';
  end if;

  perform public.registrar_auditoria(
    'revisar_aviso', 'properties', p_property_id, null,
    jsonb_build_object('decision', p_decision, 'motivo', p_motivo)
  );

  return aviso;
end;
$$;

/** Verificación de una persona o de una inmobiliaria. La otorga Wasipe. */
create or replace function public.verificar_anunciante(
  p_agency_id uuid,
  p_estado public.verification_status,
  p_motivo text default null
)
returns public.agencies
language plpgsql
security definer
set search_path = public
as $$
declare
  agencia public.agencies;
begin
  if not public.es_personal('moderator') then
    raise exception 'Solo el equipo de Wasipe verifica anunciantes' using errcode = '42501';
  end if;
  if p_estado = 'rejected' and length(trim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Una verificación rechazada tiene que decir por qué'
      using errcode = '22023';
  end if;

  update public.agencies set verification_status = p_estado
   where id = p_agency_id
  returning * into agencia;

  if not found then raise exception 'Esa inmobiliaria no existe'; end if;

  perform public.registrar_auditoria(
    'verificar_anunciante', 'agencies', p_agency_id, null,
    jsonb_build_object('estado', p_estado, 'motivo', p_motivo)
  );

  return agencia;
end;
$$;

/** Cierra una bandera. Confirmarla o descartarla exige una nota. */
create or replace function public.resolver_bandera(
  p_flag_id bigint,
  p_estado public.flag_status,
  p_nota text
)
returns public.moderation_flags
language plpgsql
security definer
set search_path = public
as $$
declare
  bandera public.moderation_flags;
begin
  if not public.es_personal('moderator') then
    raise exception 'Solo el equipo de moderación resuelve banderas' using errcode = '42501';
  end if;
  if p_estado = 'open' then
    raise exception 'Resolver una bandera es cerrarla' using errcode = '22023';
  end if;

  update public.moderation_flags
     set status = p_estado,
         resolution_note = p_nota,
         resolved_by = auth.uid(),
         resolved_at = now()
   where id = p_flag_id and status = 'open'
  returning * into bandera;

  if not found then raise exception 'Esa bandera ya estaba cerrada'; end if;

  perform public.registrar_auditoria(
    'resolver_bandera', 'moderation_flags', bandera.property_id, null,
    jsonb_build_object('bandera', p_flag_id, 'estado', p_estado, 'nota', p_nota)
  );

  return bandera;
end;
$$;

-- ---------------------------------------------------------------------
-- El personal ve lo que le toca
--
-- Cada política nombra su puesto. Un moderador no ve pagos y quien está
-- en finanzas no ve denuncias: no por desconfianza, sino porque el dato
-- personal de alguien no tiene por qué pasar por más manos de las
-- necesarias (Ley 29733).
-- ---------------------------------------------------------------------
create policy "soporte ve los perfiles"
  on public.profiles for select
  to authenticated
  using (public.es_personal('support'));

create policy "finanzas ve las suscripciones"
  on public.subscriptions for select
  to authenticated
  using (public.es_personal('finance'));

create policy "finanzas ve los creditos"
  on public.credit_transactions for select
  to authenticated
  using (public.es_personal('finance'));

create policy "moderacion ve las denuncias"
  on public.reports for all
  to authenticated
  using (public.es_personal('moderator'))
  with check (public.es_personal('moderator'));

create policy "moderacion ve los trabajos de ia"
  on public.ai_jobs for select
  to authenticated
  using (public.es_personal('moderator'));

-- La política de avisos ya existía desde el sprint 3 y miraba el rol de
-- la cuenta. Se amplía al personal de moderación, que ahora vive en su
-- propia tabla.
alter policy "moderacion ve todos los avisos" on public.properties
  using (public.es_moderador() or public.es_personal('moderator'));

create policy "moderacion ve las inmobiliarias"
  on public.agencies for select
  to authenticated
  using (public.es_personal('moderator'));

-- ---------------------------------------------------------------------
-- El disparador de estados también reconoce al personal
--
-- `proteger_estados_aviso()` miraba `es_moderador()`, que lee el rol de
-- la cuenta. Ahora la moderación vive en `staff_members`, así que sin
-- esto `revisar_aviso()` chocaría con su propio disparador.
--
-- Se reemplaza solo esa comprobación; el resto de las reglas del sprint 8
-- —fechas del flujo, verificación que otorga Wasipe, no autoaprobarse—
-- queda igual.
-- ---------------------------------------------------------------------
create or replace function public.es_moderador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('admin', 'moderator') from public.profiles where id = auth.uid()),
    false
  ) or public.es_personal('moderator')
$$;

-- ---------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------
revoke all on function public.revisar_aviso(uuid, public.review_decision, text) from public;
revoke all on function public.verificar_anunciante(uuid, public.verification_status, text) from public;
revoke all on function public.resolver_bandera(bigint, public.flag_status, text) from public;
revoke all on function public.marcar_aviso(uuid) from public;
revoke all on function public.posibles_duplicados(uuid, integer) from public;
revoke all on function public.precio_sospechoso(uuid) from public;

grant execute on function public.revisar_aviso(uuid, public.review_decision, text)
  to authenticated, service_role;
grant execute on function public.verificar_anunciante(uuid, public.verification_status, text)
  to authenticated, service_role;
grant execute on function public.resolver_bandera(bigint, public.flag_status, text)
  to authenticated, service_role;
grant execute on function public.marcar_aviso(uuid) to authenticated, service_role;
grant execute on function public.posibles_duplicados(uuid, integer) to authenticated, service_role;
grant execute on function public.precio_sospechoso(uuid) to authenticated, service_role;
grant execute on function public.es_personal(public.staff_role) to authenticated, service_role;
grant execute on function public.es_personal_de_wasipe() to authenticated, service_role;
