-- Proyectos inmobiliarios: la entidad que faltaba.
--
-- Hasta hoy un «proyecto» era una fila de `properties` con
-- `operation = 'project'`. Eso no alcanza, y no por prolijidad: una fila
-- de `properties` tiene UN precio, UN número de dormitorios y UN área.
-- Un proyecto real se vende por tipologías —1, 2 y 3 dormitorios, cada
-- una con su rango de precio— así que publicarlo obligaba a elegir una y
-- callar las demás, o a inventar un promedio. La portada, mientras tanto,
-- prometía «el precio por m² a la vista para comparar contra lo ya
-- construido». Esa promesa no se podía cumplir con el modelo anterior.
--
-- Se comprobó antes de escribir esto: hay **cero** filas con
-- `operation = 'project'`. Por eso esta migración no trae ninguna lógica
-- de traslado de datos. Si algún día aparecen, se moverán con una
-- migración propia que se pueda revisar sola.
--
-- ### Qué se reutiliza y qué no
--
-- Se reutiliza todo lo que ya está probado: `agencies` y `agency_members`
-- para la propiedad, `es_miembro_agencia()` y `es_moderador()` para los
-- permisos, el enum `publication_status` para el flujo de revisión, y la
-- forma del disparador que protege las transiciones de un aviso. No se
-- inventa un segundo sistema de moderación al lado del que funciona.
--
-- No se agrega `verification_status` a `projects`. En `properties` conviven
-- dos cosas distintas —si el aviso está publicado y si alguien de Wasipe
-- comprobó que es real— y acá no hace falta: la aprobación de un proyecto
-- es un solo hecho, y tener dos columnas que lo cuenten deja abierta la
-- posibilidad de que se contradigan. Una sola fuente de verdad:
-- `publication_status`.

-- ---------------------------------------------------------------------
-- Etapa comercial
-- ---------------------------------------------------------------------

-- No es lo mismo comprar sobre plano que recibir la llave. Es lo primero
-- que pregunta quien compra, y sin esto habría que deducirlo de una fecha.
create type public.project_stage as enum (
  'preventa',           -- sobre plano, aún no se construye
  'construccion',       -- en obra
  'entrega_inmediata'   -- terminado, con unidades disponibles
);

create sequence if not exists public.codigo_proyecto_seq;

create or replace function public.nuevo_codigo_proyecto()
returns text
language sql
volatile
set search_path = pg_catalog, public, pg_temp
as $$
  select 'PRY-' || lpad(nextval('public.codigo_proyecto_seq')::text, 6, '0')
$$;

-- ---------------------------------------------------------------------
-- El proyecto
-- ---------------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  -- Sin DEFAULT a propósito: lo pone un disparador. Un DEFAULT de
  -- columna se evalúa **con los privilegios de quien inserta**, así que
  -- con `execute` revocado el insert moría en «permission denied for
  -- function nuevo_codigo_proyecto» aunque RLS lo permitiera. Un
  -- disparador, en cambio, no exige ese permiso al que inserta.
  code text not null unique,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  -- El dueño es la inmobiliaria, no una persona. `created_by` queda para
  -- saber quién lo abrió, pero los permisos salen de la membresía: si la
  -- persona que lo creó se va, el proyecto sigue siendo de la empresa.
  agency_id uuid not null references public.agencies (id) on delete restrict,
  created_by uuid not null references public.profiles (id) on delete restrict,

  name text not null check (length(trim(name)) between 3 and 140),
  description text check (length(description) <= 4000),
  stage public.project_stage not null default 'preventa',

  -- Mes de entrega estimado. Se guarda como fecha por comodidad de
  -- consulta y se muestra como mes: nadie promete un día exacto tres años
  -- antes, y mostrarlo daría una precisión que no existe.
  delivery_estimate date,

  -- Ubicación. A diferencia de un aviso, acá no hay `address_privacy`: un
  -- proyecto se promociona con su dirección: está en carteles y en la
  -- publicidad. Ocultarla sería pedirle al comprador que adivine dónde va
  -- a vivir.
  department text not null,
  province text not null,
  district text not null,
  ubigeo text check (ubigeo ~ '^[0-9]{6}$'),
  address text check (length(address) <= 240),
  lat double precision check (lat between -18.5 and 0.1),
  lon double precision check (lon between -81.5 and -68.5),

  publication_status public.publication_status not null default 'draft',
  rejection_reason text check (length(rejection_reason) <= 600),

  views_count integer not null default 0 check (views_count >= 0),
  inquiries_count integer not null default 0 check (inquiries_count >= 0),

  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.projects is
  'Proyecto inmobiliario. Los precios y las áreas NO viven acá: viven en project_typologies, porque un proyecto no tiene un precio sino un rango por tipología.';

comment on column public.projects.publication_status is
  'Única fuente de verdad de la aprobación. A propósito no hay verification_status: dos columnas contando el mismo hecho pueden contradecirse.';

create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.tocar_updated_at();

create index projects_publicos on public.projects (published_at desc)
  where publication_status = 'published';
create index projects_por_agencia on public.projects (agency_id);
create index projects_por_distrito on public.projects (department, province, district);
create index projects_por_estado on public.projects (publication_status);

-- ---------------------------------------------------------------------
-- Tipologías: acá sí viven los precios
-- ---------------------------------------------------------------------

create table public.project_typologies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,

  name text not null check (length(trim(name)) between 2 and 80),
  bedrooms smallint not null check (bedrooms between 0 and 10),
  bathrooms smallint not null check (bathrooms between 0 and 10),
  parking smallint not null default 0 check (parking between 0 and 10),

  total_area numeric(8, 2) check (total_area > 0 and total_area <= 100000),
  built_area numeric(8, 2) check (built_area > 0 and built_area <= 100000),

  currency public.currency not null default 'PEN',
  price_from numeric(14, 2) not null check (price_from > 0),
  price_to numeric(14, 2) not null check (price_to > 0),

  units_total smallint not null check (units_total > 0 and units_total <= 2000),
  units_available smallint not null check (units_available >= 0),

  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Un rango al revés no es un error de la persona: es un dato que haría
  -- que el filtro «hasta S/ 300,000» devuelva cosas de S/ 500,000.
  constraint rango_de_precio_coherente check (price_to >= price_from),

  -- No se pueden tener más disponibles que existentes. Sin esto, «quedan
  -- 80 de 60» sale publicado y nadie lo nota hasta que alguien pregunta.
  constraint disponibles_no_superan_el_total check (units_available <= units_total),

  -- El área construida es parte del área total, nunca mayor.
  constraint area_construida_cabe check (built_area is null or total_area is null or built_area <= total_area)
);

comment on table public.project_typologies is
  'Una tipología es un modelo de departamento dentro del proyecto: «2 dormitorios, 65 m²», con su rango de precio y cuántas quedan. NO es una unidad individual: registrar el departamento 502 sería un CRM, no un portal.';

create trigger project_typologies_updated_at
  before update on public.project_typologies
  for each row execute function public.tocar_updated_at();

create index project_typologies_por_proyecto
  on public.project_typologies (project_id, sort_order);

-- ---------------------------------------------------------------------
-- Fotos y planos
-- ---------------------------------------------------------------------

-- Mismo patrón que `property_media`, y mismos depósitos: el original va
-- al bucket privado y la versión que se muestra al público. No se crea
-- ningún bucket nuevo; los archivos van bajo el prefijo del proyecto.
create table public.project_media (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind public.media_kind not null default 'photo',
  url text not null,
  storage_path text not null,
  width integer check (width > 0),
  height integer check (height > 0),
  sort_order smallint not null default 0,
  is_cover boolean not null default false,
  alt text check (length(alt) <= 200),
  created_at timestamptz not null default now()
);

create index project_media_por_proyecto
  on public.project_media (project_id, sort_order);

-- Una sola portada por proyecto. Con dos, cuál se muestra depende del
-- orden en que vuelvan las filas, que es decir «cualquiera».
create unique index project_media_una_portada
  on public.project_media (project_id)
  where is_cover;

-- ---------------------------------------------------------------------
-- Amenidades
-- ---------------------------------------------------------------------

create table public.project_features (
  project_id uuid not null references public.projects (id) on delete cascade,
  feature text not null check (length(trim(feature)) between 2 and 60),
  primary key (project_id, feature)
);

comment on table public.project_features is
  'Piscina, gimnasio, sala de juegos. Clave compuesta para que la misma amenidad no se pueda cargar dos veces.';

-- ---------------------------------------------------------------------
-- Consultas: una fila de `inquiries` apunta a un aviso O a un proyecto
-- ---------------------------------------------------------------------

alter table public.inquiries
  add column project_id uuid references public.projects (id) on delete cascade;

alter table public.inquiries
  alter column property_id drop not null;

-- Exactamente uno de los dos. Ni ninguno —una consulta sobre nada— ni los
-- dos, que dejaría sin definir a quién le llega.
alter table public.inquiries
  add constraint consulta_sobre_una_sola_cosa
  check ((property_id is not null) <> (project_id is not null));

create index inquiries_por_proyecto on public.inquiries (project_id)
  where project_id is not null;

-- ---------------------------------------------------------------------
-- Funciones de permiso
-- ---------------------------------------------------------------------

-- Un proyecto es público solo si está publicado y su inmobiliaria activa.
-- Lo segundo importa: dar de baja una inmobiliaria tiene que sacar sus
-- proyectos de la vista, no dejarlos huérfanos y visibles.
create or replace function public.proyecto_publico(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1
      from public.projects p
      join public.agencies a on a.id = p.agency_id
     where p.id = p_project_id
       and p.publication_status = 'published'
       and a.is_active
  )
$$;

-- Quién puede ESCRIBIR un proyecto: solo el administrador de su
-- inmobiliaria. Se apoya en `administra_agencia()`, que ya existe y ya
-- exige el rol `agency_admin`; no hace falta un rol nuevo.
--
-- La separación importa: un corredor del equipo tiene que poder ver el
-- borrador para responder consultas, pero cambiarle el precio a una
-- tipología es otra cosa. En preventa, el precio es la decisión comercial
-- de la empresa, no de quien atiende.
create or replace function public.administra_proyecto(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1 from public.projects p
     where p.id = p_project_id
       and public.administra_agencia(p.agency_id)
  )
$$;

-- Quién puede LEER lo que no es público: cualquier miembro, incluidos los
-- corredores. Ver el borrador y atender sus consultas es su trabajo.
create or replace function public.miembro_del_proyecto(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1 from public.projects p
     where p.id = p_project_id
       and public.es_miembro_agencia(p.agency_id)
  )
$$;

-- A quién le llega una consulta de proyecto. Es `created_by` y no un
-- dueño nuevo: `inquiries.owner_id` ya existe y las políticas que lo usan
-- están probadas. Los demás miembros de la inmobiliaria la ven por su
-- propia política, más abajo.
create or replace function public.dueno_de_proyecto(p_project_id uuid)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select created_by from public.projects where id = p_project_id
$$;

-- ---------------------------------------------------------------------
-- Transiciones de estado
-- ---------------------------------------------------------------------

-- Misma forma que `proteger_estados_aviso()`, con dos diferencias: no hay
-- verificación que proteger —no existe esa columna acá— y sí hay dos
-- requisitos de contenido para publicar.
create or replace function public.proteger_estados_proyecto()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_tipologias integer;
  v_fotos integer;
  v_sin_contadores public.projects%rowtype;
begin
  -- El código es un identificador interno y no se edita. Nunca, tampoco
  -- desde moderación: es lo que la gente escribe para buscar el proyecto
  -- y lo que va en los correos, así que cambiarlo rompe enlaces viejos
  -- sin avisar a nadie.
  --
  -- Se normaliza en vez de rechazar, igual que al crear: mandarlo no
  -- sirve de nada, que es más difícil de olvidar que acordarse de no
  -- mandarlo. Va antes que todo lo demás para que ninguna rama posterior
  -- pueda devolver `new` con el código cambiado.
  new.code := old.code;

  -- Marcas de tiempo del flujo. Van acá y no en la aplicación para que
  -- valgan también cuando el cambio viene de la API o de un guion.
  if new.publication_status = 'in_review'
     and old.publication_status is distinct from 'in_review' then
    new.submitted_at := now();
  end if;

  if new.publication_status in ('published', 'rejected')
     and old.publication_status is distinct from new.publication_status then
    new.reviewed_at := now();
    new.reviewed_by := coalesce(new.reviewed_by, auth.uid());
  end if;

  -- Al publicarse por primera vez se fija la fecha; al reanudar una pausa
  -- NO se toca, para no falsear la antigüedad del proyecto.
  if new.publication_status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;

  -- Un proyecto sin tipologías es un nombre y una foto: no dice ni cuánto
  -- cuesta ni qué se vende. Y sin foto, nadie lo abre. Se comprueba en la
  -- base y no en el formulario porque la aprobación puede llegar por la
  -- API, y ahí no hay formulario que valide nada. La comprobación va más
  -- abajo, después de los permisos.

  -- Primero lo que la inmobiliaria NO puede hacer sola, y recién después
  -- los requisitos de contenido. El orden no es cosmético: a quien
  -- intenta publicar sin permiso hay que decirle que le falta la
  -- revisión, no que le falta una foto. Lo segundo lo mandaría a
  -- completar el proyecto para volver a chocarse con lo mismo.
  if not public.es_moderador() then
    if new.publication_status = 'published'
       and old.publication_status not in ('published', 'paused') then
      raise exception 'El proyecto tiene que pasar por revisión antes de publicarse'
        using errcode = '42501';
    end if;

    if new.publication_status = 'rejected'
       and old.publication_status is distinct from 'rejected' then
      raise exception 'Solo el equipo de Wasipe puede rechazar un proyecto'
        using errcode = '42501';
    end if;

    -- El motivo del rechazo lo escribe quien rechaza. Si la inmobiliaria
    -- pudiera editarlo, el historial de moderación dejaría de servir.
    if new.rejection_reason is distinct from old.rejection_reason then
      raise exception 'El motivo del rechazo lo escribe el equipo de Wasipe'
        using errcode = '42501';
    end if;

    -- Los contadores no se escriben a mano: los mueven los disparadores.
    --
    -- Hace falta distinguir el incremento legítimo del que viene de una
    -- persona, y `es_moderador()` no sirve: `sumar_consulta()` es SECURITY
    -- DEFINER, pero eso cambia el rol de la conexión, **no** las
    -- credenciales del JWT. Ahí adentro `es_moderador()` sigue siendo
    -- falso, así que esta guarda rechazaba el incremento que ella misma
    -- describe como legítimo. Se descubrió porque la prueba de consultas
    -- anónimas se puso roja: la consulta entraba y el contador no subía.
    --
    -- La distinción es `pg_trigger_depth()`. Y acá está el cuidado que
    -- importa: **estar dentro de un disparador no autoriza nada más**. Un
    -- disparador anidado que aprovechara este camino para cambiar el
    -- estado de publicación, el motivo del rechazo o la inmobiliaria
    -- dueña sería una escalada de privilegios silenciosa. Por eso, en
    -- profundidad, se permite el cambio de contadores **y solo eso**: se
    -- compara la fila entera con los contadores igualados, y si algo más
    -- difiere se rechaza igual.
    if new.views_count is distinct from old.views_count
       or new.inquiries_count is distinct from old.inquiries_count then

      if pg_trigger_depth() <= 1 then
        raise exception 'Los contadores no se editan'
          using errcode = '42501';
      end if;

      v_sin_contadores := new;
      v_sin_contadores.views_count := old.views_count;
      v_sin_contadores.inquiries_count := old.inquiries_count;

      if v_sin_contadores is distinct from old then
        raise exception 'Un disparador solo puede mover los contadores, nada más'
          using errcode = '42501';
      end if;
    end if;
  end if;

  -- Los requisitos de contenido valen para todos, moderación incluida:
  -- aprobar un proyecto vacío no es un privilegio, es un error.
  if new.publication_status = 'published'
     and old.publication_status is distinct from 'published' then
    select count(*) into v_tipologias
      from public.project_typologies where project_id = new.id;
    select count(*) into v_fotos
      from public.project_media where project_id = new.id;

    if v_tipologias = 0 then
      raise exception 'Un proyecto no se puede publicar sin al menos una tipología'
        using errcode = '23514';
    end if;

    if v_fotos = 0 then
      raise exception 'Un proyecto no se puede publicar sin al menos una foto'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger projects_transiciones
  before update on public.projects
  for each row execute function public.proteger_estados_proyecto();

-- Lo que se prepara y lo que se impide al crear un proyecto.
--
-- Van juntos porque los dos son «cómo nace un proyecto» y separarlos
-- daría dos disparadores BEFORE INSERT sobre la misma tabla, con el orden
-- entre ellos decidido por el nombre.
--
-- **El código lo pone la base, no el cliente.** Se sobrescribe siempre lo
-- que venga: no se rechaza, se normaliza. Rechazar obligaría a cada
-- formulario a acordarse de no mandarlo; sobrescribir hace que mandarlo
-- no sirva de nada, que es más difícil de olvidar. La unicidad y el
-- comportamiento ante concurrencia los da la secuencia, no un `select
-- max()` que dos sesiones podrían leer a la vez.
--
-- El estado inicial también se protege acá: sin esto, un `insert` con
-- `publication_status = 'published'` se saltaría la revisión entera.
create or replace function public.preparar_proyecto_nuevo()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  new.code := public.nuevo_codigo_proyecto();

  if not public.es_moderador() and new.publication_status is distinct from 'draft' then
    raise exception 'Un proyecto nuevo empieza en borrador'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger projects_nacen_en_borrador
  before insert on public.projects
  for each row execute function public.preparar_proyecto_nuevo();


-- ---------------------------------------------------------------------
-- Consultas: el dueño lo sigue decidiendo la base
-- ---------------------------------------------------------------------

-- Se reemplaza `fijar_dueno_consulta()` en vez de agregar un segundo
-- disparador. La versión anterior buscaba el dueño en `properties` y, si
-- no lo encontraba, cortaba con «El aviso <NULL> no existe» — que es
-- exactamente lo que pasaba con una consulta de proyecto, porque su
-- `property_id` es nulo a propósito.
--
-- Se conserva la idea original, que es la correcta: **el cliente no
-- elige a quién le llega su consulta**. Solo se amplía de dónde sale el
-- dueño cuando lo que se consulta es un proyecto.
create or replace function public.fijar_dueno_consulta()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.property_id is not null then
    select p.owner_id into new.owner_id
      from public.properties p
     where p.id = new.property_id;

    if new.owner_id is null then
      raise exception 'El aviso % no existe', new.property_id;
    end if;
  else
    select p.created_by into new.owner_id
      from public.projects p
     where p.id = new.project_id;

    if new.owner_id is null then
      raise exception 'El proyecto % no existe', new.project_id;
    end if;
  end if;

  -- Nadie se escribe a sí mismo: es ruido en la bandeja.
  if new.sender_id is not null and new.sender_id = new.owner_id then
    raise exception 'No puedes enviarte una consulta a tu propio aviso';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Contador de consultas: una sola función para las dos cosas
-- ---------------------------------------------------------------------

-- Se reemplaza la que existía en vez de agregar una segunda. Dos
-- disparadores sobre la misma tabla, cada uno con la mitad de la lógica,
-- es como se termina con un contador que suma dos veces.
create or replace function public.sumar_consulta()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.property_id is not null then
    update public.properties
       set inquiries_count = inquiries_count + 1
     where id = new.property_id;
  else
    update public.projects
       set inquiries_count = inquiries_count + 1
     where id = new.project_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.projects enable row level security;
alter table public.project_typologies enable row level security;
alter table public.project_media enable row level security;
alter table public.project_features enable row level security;

-- --- projects ---

-- Un borrador o un rechazado NO son públicos. El precio de preventa antes
-- del lanzamiento es información comercial, y un rechazado es justamente
-- lo que se decidió no mostrar.
create policy "el publico ve los proyectos publicados"
  on public.projects for select
  to anon, authenticated
  using (public.proyecto_publico(id));

create policy "la inmobiliaria ve sus proyectos"
  on public.projects for select
  to authenticated
  using (public.es_miembro_agencia(agency_id));

create policy "moderacion ve todos los proyectos"
  on public.projects for select
  to authenticated
  using (public.es_moderador());

-- Crear: solo miembros de la inmobiliaria, y solo en la suya. No hace
-- falta que esté verificada —eso se decidió a propósito— pero sí activa.
create policy "el administrador de la inmobiliaria crea sus proyectos"
  on public.projects for insert
  to authenticated
  with check (
    public.administra_agencia(agency_id)
    and created_by = auth.uid()
    and exists (select 1 from public.agencies a where a.id = agency_id and a.is_active)
  );

-- Editar y enviar a revisión: solo el administrador. Un `agent` que
-- intente un update no recibe un error: RLS simplemente no le alcanza
-- ninguna fila y el cambio no ocurre.
create policy "el administrador de la inmobiliaria edita sus proyectos"
  on public.projects for update
  to authenticated
  using (public.administra_agencia(agency_id))
  with check (public.administra_agencia(agency_id));

create policy "moderacion edita cualquier proyecto"
  on public.projects for update
  to authenticated
  using (public.es_moderador())
  with check (public.es_moderador());

-- Borrar solo lo que nunca se publicó. Un proyecto que estuvo público
-- tiene consultas colgando y gente que lo vio: se pausa o se archiva, no
-- se borra.
create policy "el administrador borra solo borradores"
  on public.projects for delete
  to authenticated
  using (
    public.administra_agencia(agency_id)
    and publication_status = 'draft'
    and published_at is null
  );

-- --- tipologías, fotos y amenidades: heredan del proyecto ---

create policy "las tipologias siguen al proyecto"
  on public.project_typologies for select
  to anon, authenticated
  using (public.proyecto_publico(project_id) or public.miembro_del_proyecto(project_id) or public.es_moderador());

create policy "el administrador escribe las tipologias"
  on public.project_typologies for all
  to authenticated
  using (public.administra_proyecto(project_id))
  with check (public.administra_proyecto(project_id));

create policy "las fotos siguen al proyecto"
  on public.project_media for select
  to anon, authenticated
  using (public.proyecto_publico(project_id) or public.miembro_del_proyecto(project_id) or public.es_moderador());

create policy "el administrador escribe las fotos"
  on public.project_media for all
  to authenticated
  using (public.administra_proyecto(project_id))
  with check (public.administra_proyecto(project_id));

create policy "las amenidades siguen al proyecto"
  on public.project_features for select
  to anon, authenticated
  using (public.proyecto_publico(project_id) or public.miembro_del_proyecto(project_id) or public.es_moderador());

create policy "el administrador escribe las amenidades"
  on public.project_features for all
  to authenticated
  using (public.administra_proyecto(project_id))
  with check (public.administra_proyecto(project_id));

-- --- consultas sobre un proyecto ---

-- Las consultas no son públicas: llevan nombre, correo y teléfono de
-- quien pregunta.
create policy "la inmobiliaria ve las consultas de sus proyectos"
  on public.inquiries for select
  to authenticated
  using (project_id is not null and public.miembro_del_proyecto(project_id));

create policy "cualquiera consulta un proyecto publicado"
  on public.inquiries for insert
  to anon, authenticated
  with check (
    project_id is not null
    and public.proyecto_publico(project_id)
    and owner_id = public.dueno_de_proyecto(project_id)
    and sender_id is not distinct from auth.uid()
    and status = 'new'
  );

-- Atender consultas SÍ es trabajo de cualquier miembro: marcarlas como
-- leídas o respondidas no cambia nada del proyecto.
create policy "la inmobiliaria marca las consultas de sus proyectos"
  on public.inquiries for update
  to authenticated
  using (project_id is not null and public.miembro_del_proyecto(project_id))
  with check (project_id is not null and public.miembro_del_proyecto(project_id));

-- ---------------------------------------------------------------------
-- Permisos de las funciones
-- ---------------------------------------------------------------------

-- Las de los disparadores no las llama nadie desde fuera. Mismo criterio
-- que la migración de permisos del sprint 21: si no hace falta que un
-- visitante anónimo pueda ejecutarla, no puede.
-- Las de los disparadores no las llama nadie desde fuera, y el código del
-- proyecto tampoco se genera a pedido.
revoke execute on function public.proteger_estados_proyecto() from public, anon, authenticated;
revoke execute on function public.preparar_proyecto_nuevo() from public, anon, authenticated;
revoke execute on function public.nuevo_codigo_proyecto() from public, anon, authenticated;

-- Estas dos ya estaban revocadas desde el sprint 21 y `create or replace`
-- conserva los permisos, así que esto no cambia nada hoy. Se repite a
-- propósito: quien lea esta migración no tiene por qué saber que
-- reemplazar una función preserva su ACL.
revoke execute on function public.fijar_dueno_consulta() from public, anon, authenticated;
revoke execute on function public.sumar_consulta() from public, anon, authenticated;

-- Las que usan las políticas de RLS sí se conceden, y de forma explícita
-- en vez de confiar en el permiso por omisión: en Postgres toda función
-- nueva nace con `execute` para PUBLIC, o sea que «no tocar nada» ya es
-- una decisión, y una que concede de más. Acá se revoca primero y se
-- concede después solo a los dos roles que las necesitan.
revoke execute on function
  public.proyecto_publico(uuid),
  public.administra_proyecto(uuid),
  public.miembro_del_proyecto(uuid),
  public.dueno_de_proyecto(uuid)
  from public;

grant execute on function
  public.proyecto_publico(uuid),
  public.administra_proyecto(uuid),
  public.miembro_del_proyecto(uuid),
  public.dueno_de_proyecto(uuid)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Lo que este sprint NO resuelve, dicho acá para que no se dé por hecho
-- ---------------------------------------------------------------------

-- **Una fila en `project_media` no prueba que el archivo exista.** La
-- tabla guarda una ruta y una dirección, y la regla de «no se publica sin
-- foto» comprueba que haya una fila, no que haya un objeto en Storage.
-- Hasta el sprint 25C —donde se suben las fotos de verdad y se escriben
-- las políticas de Storage con el prefijo del proyecto— alguien con
-- permiso de escritura podría insertar una fila apuntando a nada y pasar
-- la comprobación.
--
-- No se resuelve acá a propósito: verificar la existencia del objeto
-- desde la base exigiría que Postgres hable con Storage, que es
-- justamente el acoplamiento que el contrato de almacenamiento evita.
-- Se resuelve en 25C, del lado que sube el archivo.
--
-- Lo que sí acota el riesgo hoy: **no existe ninguna interfaz ni ruta que
-- publique proyectos.** 25A es solo modelo de datos. Nadie puede llegar a
-- este camino desde el navegador.

-- **`views_count` se queda en cero.** No hay disparador que lo alimente y
-- es a propósito: contar vistas necesita la ficha pública, que llega en
-- 25E. Un sistema parcial de vistas —incrementar desde cualquier lado, o
-- sin distinguir un robot de una persona— daría un número que parece
-- información y no lo es. Mejor un cero honesto que un número inventado.
