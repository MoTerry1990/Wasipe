-- =====================================================================
-- 20260815120800 — Seguridad a nivel de fila (RLS)
--
-- Regla de oro de este archivo: la autorización se decide en la base,
-- nunca en el cliente. Aunque alguien tome la clave anónima —que es
-- pública por diseño— y consulte la API directamente, no puede ver ni
-- tocar nada que estas políticas no permitan.
--
-- El rol NUNCA se lee del token. Los metadatos del JWT son editables por
-- el propio usuario a través de la API de Supabase; leer el rol de ahí
-- sería regalar el panel de administración. Se lee siempre de
-- public.profiles.role, que tiene un trigger que impide cambiarlo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funciones de apoyo
--
-- Van con SECURITY DEFINER para poder leer profiles y agency_members sin
-- quedar atrapadas en las propias políticas que las usan (una política
-- sobre profiles que consulte profiles se llamaría a sí misma sin fin).
-- El search_path fijo evita que alguien cuele un esquema propio.
-- ---------------------------------------------------------------------

create or replace function public.mi_rol()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Solo 'admin'. Es quien puede tocar cualquier cosa.
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  )
$$;

-- 'admin' o 'moderator': quienes revisan avisos y denuncias.
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
  )
$$;

create or replace function public.es_miembro_agencia(p_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.agency_members m
    where m.agency_id = p_agency_id and m.user_id = auth.uid()
  )
$$;

create or replace function public.administra_agencia(p_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.agency_members m
    where m.agency_id = p_agency_id
      and m.user_id = auth.uid()
      and m.role = 'agency_admin'
  )
$$;

create or replace function public.publica_en_agencia(p_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.agency_members m
    where m.agency_id = p_agency_id
      and m.user_id = auth.uid()
      and m.can_publish
  )
$$;

-- ¿Quién puede administrar este aviso? El dueño, su inmobiliaria con
-- permiso de publicar, o moderación.
create or replace function public.administra_aviso(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.properties p
    where p.id = p_property_id
      and (
        p.owner_id = auth.uid()
        or (p.agency_id is not null and public.publica_en_agencia(p.agency_id))
      )
  ) or public.es_moderador()
$$;

-- ¿Este aviso lo puede ver cualquiera? Es la definición única de
-- "visible al público": publicado y todavía disponible.
create or replace function public.aviso_publico(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.properties p
    where p.id = p_property_id
      and p.publication_status = 'published'
      and p.status = 'available'
  )
$$;

-- ---------------------------------------------------------------------
-- Escalada de privilegios: bloqueada en la base.
--
-- Una política WITH CHECK no puede comparar contra el valor anterior de
-- la fila, así que la protección del rol tiene que ser un trigger.
-- ---------------------------------------------------------------------
create or replace function public.impedir_cambio_de_rol()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.es_admin() then
    raise exception 'No puedes cambiar tu propio rol'
      using errcode = '42501';
  end if;

  -- El contador de avisos gratuitos tampoco: si no, cualquiera lo pone
  -- en cero y publica gratis para siempre.
  if new.free_listings_used is distinct from old.free_listings_used
     and not public.es_admin() then
    raise exception 'El contador de avisos gratuitos lo lleva el sistema'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_sin_escalada
  before update on public.profiles
  for each row execute function public.impedir_cambio_de_rol();

-- ---------------------------------------------------------------------
-- Estados del aviso: publicar y verificar son decisiones de moderación.
-- ---------------------------------------------------------------------
create or replace function public.proteger_estados_aviso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.es_moderador() then
    return new;
  end if;

  -- La verificación la otorga Wasipe, no quien publica.
  if new.verification_status is distinct from old.verification_status then
    raise exception 'La verificación del aviso la realiza el equipo de Wasipe'
      using errcode = '42501';
  end if;

  -- Se puede pausar y reanudar un aviso ya aprobado, pero no aprobarse
  -- uno mismo: de 'draft', 'in_review' o 'rejected' no se salta a
  -- 'published' sin pasar por revisión.
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

create trigger properties_estados_protegidos
  before update on public.properties
  for each row execute function public.proteger_estados_aviso();

-- =====================================================================
-- Activación de RLS en todas las tablas
-- =====================================================================
alter table public.profiles             enable row level security;
alter table public.agencies             enable row level security;
alter table public.agency_members       enable row level security;
alter table public.properties           enable row level security;
alter table public.property_locations   enable row level security;
alter table public.property_features    enable row level security;
alter table public.property_media       enable row level security;
alter table public.favorites            enable row level security;
alter table public.inquiries            enable row level security;
alter table public.saved_searches       enable row level security;
alter table public.price_history        enable row level security;
alter table public.listing_views        enable row level security;
alter table public.reports              enable row level security;
alter table public.subscriptions        enable row level security;
alter table public.credit_transactions  enable row level security;
alter table public.ai_jobs              enable row level security;
alter table public.audit_logs           enable row level security;
alter table public.exchange_rates       enable row level security;

-- =====================================================================
-- profiles
--
-- El perfil completo lleva teléfono y WhatsApp: dato personal. No se
-- expone al público. Lo que el portal necesita mostrar del anunciante
-- (nombre y foto) sale de la vista `anunciantes`, más abajo.
-- =====================================================================
create policy "perfil propio visible"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "moderacion ve los perfiles"
  on public.profiles for select
  to authenticated
  using (public.es_moderador());

create policy "perfil propio editable"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "administracion edita perfiles"
  on public.profiles for update
  to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- No hay política de INSERT ni de DELETE: el perfil lo crea el trigger
-- del registro y se borra en cascada con la cuenta.

-- Ficha pública del anunciante, sin teléfono ni correo.
create view public.anunciantes
with (security_invoker = false) as
  select p.id, p.full_name, p.avatar_url, p.role, p.created_at
  from public.profiles p
  where p.is_active
    and (
      exists (
        select 1 from public.properties pr
        where pr.owner_id = p.id
          and pr.publication_status = 'published'
          and pr.status = 'available'
      )
      or exists (select 1 from public.agency_members m where m.user_id = p.id)
    );

grant select on public.anunciantes to anon, authenticated;

comment on view public.anunciantes is
  'Datos públicos del anunciante. El teléfono y el correo nunca salen de profiles: el contacto va por inquiries.';

-- =====================================================================
-- agencies · agency_members
-- =====================================================================
create policy "inmobiliarias activas son publicas"
  on public.agencies for select
  to anon, authenticated
  using (is_active);

create policy "miembros ven su inmobiliaria"
  on public.agencies for select
  to authenticated
  using (public.es_miembro_agencia(id) or public.es_moderador());

create policy "cualquiera registra su inmobiliaria"
  on public.agencies for insert
  to authenticated
  with check (
    created_by = auth.uid()
    -- Nadie se verifica solo: la verificación la otorga Wasipe.
    and verification_status = 'unverified'
  );

create policy "la administra quien la administra"
  on public.agencies for update
  to authenticated
  using (public.administra_agencia(id) or public.es_admin())
  with check (
    public.es_admin()
    or (public.administra_agencia(id) and verification_status = 'unverified')
  );

create policy "solo administracion elimina inmobiliarias"
  on public.agencies for delete
  to authenticated
  using (public.es_admin());

create policy "los miembros se ven entre si"
  on public.agency_members for select
  to authenticated
  using (user_id = auth.uid() or public.es_miembro_agencia(agency_id) or public.es_moderador());

create policy "el administrador suma miembros"
  on public.agency_members for insert
  to authenticated
  with check (public.administra_agencia(agency_id) or public.es_admin());

create policy "el administrador cambia permisos"
  on public.agency_members for update
  to authenticated
  using (public.administra_agencia(agency_id) or public.es_admin())
  with check (public.administra_agencia(agency_id) or public.es_admin());

create policy "salir o sacar de la inmobiliaria"
  on public.agency_members for delete
  to authenticated
  using (user_id = auth.uid() or public.administra_agencia(agency_id) or public.es_admin());

-- =====================================================================
-- properties
-- =====================================================================
create policy "el publico ve los avisos publicados"
  on public.properties for select
  to anon, authenticated
  using (publication_status = 'published' and status = 'available');

create policy "cada quien ve sus avisos"
  on public.properties for select
  to authenticated
  using (owner_id = auth.uid());

create policy "la inmobiliaria ve sus avisos"
  on public.properties for select
  to authenticated
  using (agency_id is not null and public.es_miembro_agencia(agency_id));

create policy "moderacion ve todos los avisos"
  on public.properties for select
  to authenticated
  using (public.es_moderador());

create policy "se publica a nombre propio"
  on public.properties for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    -- Si el aviso va a nombre de una inmobiliaria, hay que pertenecer a
    -- ella y tener permiso de publicar.
    and (agency_id is null or public.publica_en_agencia(agency_id))
    -- Un aviso nace en borrador o entra a revisión. Nunca publicado.
    and publication_status in ('draft', 'in_review')
    and verification_status = 'unverified'
  );

create policy "cada quien edita sus avisos"
  on public.properties for update
  to authenticated
  using (
    owner_id = auth.uid()
    or (agency_id is not null and public.publica_en_agencia(agency_id))
  )
  with check (
    owner_id = auth.uid()
    or (agency_id is not null and public.publica_en_agencia(agency_id))
  );

create policy "moderacion edita cualquier aviso"
  on public.properties for update
  to authenticated
  using (public.es_moderador())
  with check (public.es_moderador());

create policy "cada quien borra sus avisos"
  on public.properties for delete
  to authenticated
  using (owner_id = auth.uid() or public.es_admin());

-- =====================================================================
-- property_locations — la dirección exacta
--
-- Solo sale al público cuando quien publica eligió mostrarla.
-- =====================================================================
create policy "direccion exacta solo si se autorizo"
  on public.property_locations for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.properties p
      where p.id = property_id
        and p.publication_status = 'published'
        and p.status = 'available'
        and p.address_privacy = 'exact'
    )
  );

create policy "el anunciante ve su direccion"
  on public.property_locations for select
  to authenticated
  using (public.administra_aviso(property_id));

create policy "el anunciante escribe su direccion"
  on public.property_locations for insert
  to authenticated
  with check (public.administra_aviso(property_id));

create policy "el anunciante corrige su direccion"
  on public.property_locations for update
  to authenticated
  using (public.administra_aviso(property_id))
  with check (public.administra_aviso(property_id));

create policy "el anunciante borra su direccion"
  on public.property_locations for delete
  to authenticated
  using (public.administra_aviso(property_id));

-- =====================================================================
-- property_features · property_media
-- =====================================================================
create policy "caracteristicas de avisos publicos"
  on public.property_features for select
  to anon, authenticated
  using (public.aviso_publico(property_id));

create policy "el anunciante ve sus caracteristicas"
  on public.property_features for select
  to authenticated
  using (public.administra_aviso(property_id));

create policy "el anunciante administra sus caracteristicas"
  on public.property_features for all
  to authenticated
  using (public.administra_aviso(property_id))
  with check (public.administra_aviso(property_id));

create policy "fotos de avisos publicos"
  on public.property_media for select
  to anon, authenticated
  using (public.aviso_publico(property_id));

create policy "el anunciante ve sus fotos"
  on public.property_media for select
  to authenticated
  using (public.administra_aviso(property_id));

create policy "el anunciante administra sus fotos"
  on public.property_media for all
  to authenticated
  using (public.administra_aviso(property_id))
  with check (public.administra_aviso(property_id));

-- =====================================================================
-- favorites — de cada quien y de nadie más
-- =====================================================================
create policy "mis favoritos"
  on public.favorites for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =====================================================================
-- inquiries — visibles solo para quien escribe y quien recibe
-- =====================================================================
create policy "quien escribe ve su consulta"
  on public.inquiries for select
  to authenticated
  using (sender_id = auth.uid());

create policy "quien recibe ve la consulta"
  on public.inquiries for select
  to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.properties p
      where p.id = property_id
        and p.agency_id is not null
        and public.es_miembro_agencia(p.agency_id)
    )
  );

create policy "moderacion ve las consultas"
  on public.inquiries for select
  to authenticated
  using (public.es_moderador());

-- Consultar no exige cuenta: mucha gente escribe sin registrarse. Lo que
-- sí se exige es que el aviso esté publicado y que, si hay sesión, la
-- consulta salga a nombre de quien la envía.
create policy "cualquiera consulta un aviso publicado"
  on public.inquiries for insert
  to anon, authenticated
  with check (
    public.aviso_publico(property_id)
    and sender_id is not distinct from auth.uid()
    and status = 'new'
  );

create policy "quien recibe marca y archiva"
  on public.inquiries for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Nadie borra consultas: son el registro del contacto. Solo administración.
create policy "solo administracion borra consultas"
  on public.inquiries for delete
  to authenticated
  using (public.es_admin());

-- =====================================================================
-- saved_searches
-- =====================================================================
create policy "mis busquedas guardadas"
  on public.saved_searches for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =====================================================================
-- price_history — público a propósito
--
-- Ver que un departamento bajó de precio hace dos meses es justamente lo
-- que la competencia esconde. Se lee, no se escribe: la única forma de
-- agregar una fila es cambiando el precio del aviso.
-- =====================================================================
create policy "historial de precios de avisos publicos"
  on public.price_history for select
  to anon, authenticated
  using (public.aviso_publico(property_id));

create policy "el anunciante ve su historial"
  on public.price_history for select
  to authenticated
  using (public.administra_aviso(property_id));

-- =====================================================================
-- listing_views — se escribe, no se lee
-- =====================================================================
create policy "cualquiera registra una visita"
  on public.listing_views for insert
  to anon, authenticated
  with check (
    public.aviso_publico(property_id)
    and viewer_id is not distinct from auth.uid()
  );

create policy "el anunciante ve sus estadisticas"
  on public.listing_views for select
  to authenticated
  using (public.administra_aviso(property_id));

-- =====================================================================
-- reports
-- =====================================================================
create policy "veo mis denuncias"
  on public.reports for select
  to authenticated
  using (reporter_id = auth.uid() or public.es_moderador());

create policy "denunciar exige cuenta"
  on public.reports for insert
  to authenticated
  with check (reporter_id = auth.uid() and status = 'open');

create policy "moderacion resuelve denuncias"
  on public.reports for update
  to authenticated
  using (public.es_moderador())
  with check (public.es_moderador());

-- =====================================================================
-- subscriptions · credit_transactions
--
-- Se leen desde el cliente, se escriben solo desde el servidor con la
-- clave de servicio, después de que la pasarela confirme el pago.
-- =====================================================================
create policy "veo mis suscripciones"
  on public.subscriptions for select
  to authenticated
  using (
    user_id = auth.uid()
    or (agency_id is not null and public.es_miembro_agencia(agency_id))
    or public.es_admin()
  );

create policy "veo mis movimientos de credito"
  on public.credit_transactions for select
  to authenticated
  using (
    user_id = auth.uid()
    or (agency_id is not null and public.administra_agencia(agency_id))
    or public.es_admin()
  );

-- =====================================================================
-- ai_jobs
--
-- Nada generado por la IA se aplica sin confirmación: por eso al crear
-- el trabajo `accepted_at` tiene que venir vacío.
-- =====================================================================
create policy "veo mis trabajos de ia"
  on public.ai_jobs for select
  to authenticated
  using (user_id = auth.uid() or public.es_admin());

create policy "pido trabajos de ia a mi nombre"
  on public.ai_jobs for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and status = 'queued'
    and accepted_at is null
    and (property_id is null or public.administra_aviso(property_id))
  );

create policy "acepto o descarto lo que propuso la ia"
  on public.ai_jobs for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and accepted_by is not distinct from auth.uid());

-- =====================================================================
-- audit_logs — solo lectura, solo administración
--
-- Se escribe únicamente por public.registrar_auditoria(), que es
-- SECURITY DEFINER: ningún cliente puede insertar ni borrar aquí.
-- =====================================================================
create policy "administracion lee la bitacora"
  on public.audit_logs for select
  to authenticated
  using (public.es_admin());

-- =====================================================================
-- exchange_rates — público de lectura
-- =====================================================================
create policy "el tipo de cambio es publico"
  on public.exchange_rates for select
  to anon, authenticated
  using (true);
