-- =====================================================================
-- 20260815120300 — Propiedades y su detalle
-- =====================================================================

-- ---------------------------------------------------------------------
-- exchange_rates — tipo de cambio del día.
--
-- En el Perú se publica en soles y en dólares, mezclados en la misma
-- lista. Sin una referencia común, filtrar "hasta 200,000" devuelve
-- resultados incoherentes: es el error que Urbania arrastra hace años.
-- Con esta tabla se normaliza todo a dólares en `price_usd`.
-- ---------------------------------------------------------------------
create table public.exchange_rates (
  day date primary key,
  pen_per_usd numeric(8, 4) not null check (pen_per_usd > 0),
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

-- Tipo de cambio vigente. Si todavía no se cargó ninguno, se usa 3.75
-- para que la aplicación nunca quede sin poder guardar un aviso.
create or replace function public.tipo_cambio_vigente()
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select pen_per_usd from public.exchange_rates order by day desc limit 1),
    3.75
  )
$$;

-- ---------------------------------------------------------------------
-- properties — el aviso.
--
-- Los campos de ubicación que están acá son los PÚBLICOS: departamento,
-- provincia, distrito y un punto aproximado. La dirección exacta vive en
-- property_locations, con RLS más estricta.
-- ---------------------------------------------------------------------
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default public.nuevo_codigo_aviso(),

  -- Quién publica -----------------------------------------------------
  owner_id uuid not null references public.profiles (id) on delete cascade,
  agency_id uuid references public.agencies (id) on delete set null,

  -- Contenido ---------------------------------------------------------
  title text not null check (length(trim(title)) between 10 and 120),
  description text not null check (length(trim(description)) between 40 and 6000),

  -- Clasificación -----------------------------------------------------
  operation public.listing_operation not null,
  property_type public.property_type not null,

  -- Precio ------------------------------------------------------------
  currency public.currency not null,
  price numeric(14, 2) not null check (price > 0),
  -- Mantenimiento mensual del edificio, en la misma moneda del precio.
  maintenance numeric(12, 2) check (maintenance >= 0),

  -- Referencia en dólares. La mantiene un trigger con el tipo de cambio
  -- del día; es la columna sobre la que se filtra y se ordena por precio.
  price_usd numeric(14, 2),
  price_usd_per_m2 numeric(12, 2),

  -- Medidas -----------------------------------------------------------
  total_area numeric(10, 2) not null check (total_area > 0 and total_area <= 1000000),
  built_area numeric(10, 2) check (built_area > 0),
  bedrooms smallint check (bedrooms between 0 and 30),
  bathrooms smallint check (bathrooms between 0 and 30),
  parking smallint check (parking between 0 and 50),
  age_years smallint check (age_years between 0 and 200),  -- 0 = a estrenar

  -- Condiciones -------------------------------------------------------
  furnished public.furnished_status not null default 'none',
  pet_policy public.pet_policy,

  -- Ubicación pública -------------------------------------------------
  address_privacy public.address_privacy not null default 'approximate',
  department text not null,
  province text not null,
  district text not null,
  ubigeo text check (ubigeo ~ '^[0-9]{6}$'),
  -- Punto que se muestra en el mapa. Cuando la privacidad no es 'exact'
  -- viene desplazado ~300 m respecto del real (que está en la tabla de
  -- ubicación). Guardar solo el desplazado evita filtrarlo por error.
  lat numeric(10, 7) check (lat between -18.4 and 0.1),   -- Perú continental
  lon numeric(10, 7) check (lon between -81.4 and -68.6),

  -- Estados -----------------------------------------------------------
  status public.property_status not null default 'available',
  publication_status public.publication_status not null default 'draft',
  verification_status public.verification_status not null default 'unverified',
  rejection_reason text,

  -- Métricas ----------------------------------------------------------
  views_count integer not null default 0 check (views_count >= 0),
  inquiries_count integer not null default 0 check (inquiries_count >= 0),

  -- Fechas ------------------------------------------------------------
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  expires_at timestamptz,

  -- El área techada nunca puede superar el área total.
  constraint area_construida_coherente
    check (built_area is null or built_area <= total_area),

  -- Un aviso rechazado tiene que decir por qué: si no, la persona no
  -- sabe qué corregir y escribe a soporte.
  constraint rechazo_explicado
    check (publication_status <> 'rejected' or rejection_reason is not null),

  -- Publicado implica fecha de publicación.
  constraint publicado_con_fecha
    check (publication_status <> 'published' or published_at is not null)
);

-- ---------------------------------------------------------------------
-- Precio por m²: el diferenciador del producto.
--
-- Es columna generada, no calculada en la aplicación: así ninguna vista,
-- ningún informe y ninguna consulta manual puede mostrar un valor
-- distinto. Se divide entre el área techada cuando existe (es lo que se
-- cotiza en departamentos) y entre el área total cuando no (terrenos).
-- ---------------------------------------------------------------------
alter table public.properties
  add column price_per_m2 numeric(12, 2)
  generated always as (
    round(price / nullif(coalesce(built_area, total_area), 0), 2)
  ) stored;

comment on column public.properties.price_per_m2 is
  'Precio por m² en la moneda del aviso. Generado por la base: no se calcula en la aplicación.';

-- ---------------------------------------------------------------------
-- Normalización a dólares.
--
-- Se recalcula solo cuando cambia el precio, la moneda o el área, para
-- no volver a leer el tipo de cambio en cada UPDATE de vistas.
-- ---------------------------------------------------------------------
create or replace function public.calcular_precio_usd()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  tc numeric;
  area numeric;
begin
  if tg_op = 'UPDATE'
     and new.price is not distinct from old.price
     and new.currency is not distinct from old.currency
     and new.total_area is not distinct from old.total_area
     and new.built_area is not distinct from old.built_area then
    return new;
  end if;

  if new.currency = 'USD' then
    new.price_usd := new.price;
  else
    tc := public.tipo_cambio_vigente();
    new.price_usd := round(new.price / tc, 2);
  end if;

  area := nullif(coalesce(new.built_area, new.total_area), 0);
  new.price_usd_per_m2 := case when area is null then null
                               else round(new.price_usd / area, 2) end;
  return new;
end;
$$;

create trigger properties_precio_usd
  before insert or update on public.properties
  for each row execute function public.calcular_precio_usd();

create trigger properties_updated_at
  before update on public.properties
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------
-- Búsqueda por texto.
--
-- El diccionario 'spanish' quita las palabras vacías del castellano, y
-- sin_tildes() hace que "Miraflores" y "miraflores" sean lo mismo.
-- ---------------------------------------------------------------------
alter table public.properties
  add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('spanish', public.sin_tildes(coalesce(title, ''))), 'A') ||
    setweight(to_tsvector('spanish', public.sin_tildes(coalesce(district, ''))), 'A') ||
    setweight(to_tsvector('spanish', public.sin_tildes(coalesce(province, ''))), 'B') ||
    setweight(to_tsvector('spanish', public.sin_tildes(coalesce(description, ''))), 'C')
  ) stored;

-- ---------------------------------------------------------------------
-- property_locations — la dirección exacta.
--
-- Tabla aparte a propósito: es el dato más sensible del aviso. Vive
-- separada para que la RLS del listado público no la alcance nunca, ni
-- siquiera por un `select *` distraído.
-- ---------------------------------------------------------------------
create table public.property_locations (
  property_id uuid primary key references public.properties (id) on delete cascade,
  address_line text not null,
  urbanization text,
  building_name text,
  floor text,
  interior text,
  reference text,                        -- "a media cuadra del parque Kennedy"
  exact_lat numeric(10, 7) not null check (exact_lat between -18.4 and 0.1),
  exact_lon numeric(10, 7) not null check (exact_lon between -81.4 and -68.6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger property_locations_updated_at
  before update on public.property_locations
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------
-- property_features — características sueltas del inmueble.
--
-- Clave libre con catálogo en la aplicación: agregar "vista al mar" no
-- debería costar una migración.
-- ---------------------------------------------------------------------
create table public.property_features (
  property_id uuid not null references public.properties (id) on delete cascade,
  feature text not null check (feature ~ '^[a-z0-9_]{2,40}$'),
  value text,
  primary key (property_id, feature)
);

-- ---------------------------------------------------------------------
-- property_media — fotos, videos, recorridos y planos.
--
-- Reglas del producto grabadas en la base:
--   · La foto original nunca se reemplaza: una imagen editada con IA
--     apunta a su original con `original_media_id`.
--   · Toda imagen alterada materialmente lleva su etiqueta visible, y la
--     etiqueta es una columna generada, no un texto que la interfaz
--     pueda olvidarse de pintar.
-- ---------------------------------------------------------------------
create table public.property_media (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  kind public.media_kind not null default 'photo',
  url text not null,
  storage_path text,
  width integer check (width > 0),
  height integer check (height > 0),
  sort_order smallint not null default 0 check (sort_order >= 0),
  is_cover boolean not null default false,
  alt text,

  ai_edited boolean not null default false,
  original_media_id uuid references public.property_media (id) on delete set null,
  ai_job_id uuid,   -- referencia a ai_jobs; se enlaza en su migración

  created_at timestamptz not null default now(),

  -- Una imagen editada tiene que conservar de dónde salió.
  constraint editada_conserva_original
    check (not ai_edited or original_media_id is not null)
);

alter table public.property_media
  add column ai_label text
  generated always as (
    case when ai_edited then 'Imagen modificada con Wasi AI' else null end
  ) stored;

comment on column public.property_media.ai_label is
  'Etiqueta obligatoria de transparencia. La genera la base para que ninguna vista pueda omitirla.';

-- Una sola portada por aviso.
create unique index property_media_portada_unica
  on public.property_media (property_id)
  where is_cover;
