-- =====================================================================
-- 20260815120900 — Búsqueda geográfica con PostGIS
--
-- Está aparte del resto a propósito: es la única migración que depende
-- de PostGIS, y PGlite —el Postgres en WebAssembly con el que corren las
-- pruebas— no lo incluye. Aislarla permite probar todo lo demás sin
-- Docker y deja claro qué parte se verifica recién contra Supabase.
--
-- El punto que se indexa es el PÚBLICO (lat/lon de properties), que ya
-- viene desplazado cuando la dirección no es exacta. El punto real vive
-- en property_locations y nunca entra a este índice.
-- =====================================================================

alter table public.properties
  add column geo extensions.geography(Point, 4326)
  generated always as (
    case
      when lat is null or lon is null then null
      else extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography
    end
  ) stored;

comment on column public.properties.geo is
  'Punto público del aviso. Desplazado ~300 m cuando address_privacy no es exact.';

-- Índice espacial: "departamentos a menos de 2 km de este punto".
create index properties_geo_idx
  on public.properties using gist (geo)
  where publication_status = 'published' and status = 'available';

-- El mismo punto en la tabla de dirección exacta, para el panel interno
-- (por ejemplo, detectar dos avisos idénticos en la misma dirección).
alter table public.property_locations
  add column geo extensions.geography(Point, 4326)
  generated always as (
    extensions.st_setsrid(extensions.st_makepoint(exact_lon, exact_lat), 4326)::extensions.geography
  ) stored;

create index property_locations_geo_idx
  on public.property_locations using gist (geo);

-- ---------------------------------------------------------------------
-- propiedades_cercanas() — búsqueda por radio.
--
-- Devuelve solo avisos públicos y ya ordenados por distancia. Es
-- SECURITY INVOKER (el valor por defecto), así que las políticas de RLS
-- se siguen aplicando: la función no es una puerta trasera.
-- ---------------------------------------------------------------------
create or replace function public.propiedades_cercanas(
  p_lat numeric,
  p_lon numeric,
  p_radio_m integer default 2000,
  p_limite integer default 60
)
returns table (
  id uuid,
  code text,
  title text,
  district text,
  operation public.listing_operation,
  property_type public.property_type,
  currency public.currency,
  price numeric,
  price_usd numeric,
  price_per_m2 numeric,
  distancia_m double precision
)
language sql
stable
set search_path = public, extensions
as $$
  select
    p.id, p.code, p.title, p.district, p.operation, p.property_type,
    p.currency, p.price, p.price_usd, p.price_per_m2,
    extensions.st_distance(
      p.geo,
      extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326)::extensions.geography
    ) as distancia_m
  from public.properties p
  where p.publication_status = 'published'
    and p.status = 'available'
    and p.geo is not null
    and extensions.st_dwithin(
      p.geo,
      extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326)::extensions.geography,
      greatest(p_radio_m, 100)
    )
  order by distancia_m
  limit least(greatest(p_limite, 1), 200)
$$;

comment on function public.propiedades_cercanas is
  'Avisos públicos dentro de un radio, ordenados por distancia. Respeta RLS: no es SECURITY DEFINER.';
