-- =====================================================================
-- 20260824080000 — Búsqueda conversacional y comparación
--
-- La regla que ordena todo este sprint: **la IA no devuelve avisos**.
-- Traduce una frase en castellano a filtros, y esos filtros los consulta
-- Postgres como cualquier otra búsqueda. Un modelo que redacta resultados
-- inventa direcciones y precios que no existen; uno que solo arma un
-- WHERE no puede.
--
-- Por eso acá no hay nada parecido a un índice vectorial ni a un caché de
-- avisos para la IA. Hay dos cosas: dónde guardar la frase original de
-- una búsqueda guardada, y una función que devuelve la comparación con
-- los valores tal como están en la base.
-- =====================================================================

-- ---------------------------------------------------------------------
-- La frase, junto a los filtros
--
-- Se guardan las dos: los filtros son lo que se ejecuta, y la frase es lo
-- que la persona escribió. Sin la frase, una alerta guardada meses atrás
-- es una lista de parámetros que nadie reconoce; con ella se lee
-- «departamento en Jesús María o Magdalena hasta US$ 150,000».
-- ---------------------------------------------------------------------
alter table public.saved_searches
  add column prompt text check (prompt is null or length(trim(prompt)) between 3 and 500),
  add column operation public.listing_operation not null default 'sale';

comment on column public.saved_searches.prompt is
  'Lo que la persona escribió. Los filtros son lo que se ejecuta.';

create index saved_searches_operacion_idx
  on public.saved_searches (operation, alert_frequency) where is_active;

-- ---------------------------------------------------------------------
-- comparar_avisos — los números, tal como están en la base
--
-- Devuelve una fila por aviso PUBLICADO, con todo lo que la comparación
-- muestra, incluido el promedio del distrito. Que salga de una sola
-- función y no de la aplicación es lo que hace comprobable la promesa:
-- los valores de la tabla comparativa son los valores de la base, sin un
-- redondeo de más ni un cálculo intermedio.
--
-- Un código que no existe, o que existe pero no está publicado,
-- simplemente no aparece en el resultado. No es un error: es que ese
-- aviso no se puede comparar.
-- ---------------------------------------------------------------------
create or replace function public.comparar_avisos(p_codigos text[])
returns table (
  id uuid,
  code text,
  title text,
  district text,
  province text,
  operation public.listing_operation,
  property_type public.property_type,
  currency public.currency,
  price numeric,
  price_usd numeric,
  maintenance numeric,
  total_area numeric,
  built_area numeric,
  price_per_m2 numeric,
  price_usd_per_m2 numeric,
  bedrooms integer,
  bathrooms integer,
  parking integer,
  age_years integer,
  furnished public.furnished_status,
  pet_policy public.pet_policy,
  verification_status public.verification_status,
  published_at timestamptz,
  cover_url text,
  features text[],
  district_avg_usd_per_m2 numeric,
  district_listings integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.id, p.code, p.title, p.district, p.province, p.operation, p.property_type,
    p.currency, p.price, p.price_usd, p.maintenance,
    p.total_area, p.built_area, p.price_per_m2, p.price_usd_per_m2,
    p.bedrooms, p.bathrooms, p.parking, p.age_years,
    p.furnished, p.pet_policy, p.verification_status, p.published_at,
    (select m.url from public.property_media m
      where m.property_id = p.id and m.kind = 'photo'
        and m.review_status <> 'blocked'
      order by m.is_cover desc, m.sort_order asc
      limit 1) as cover_url,
    coalesce(
      (select array_agg(f.feature order by f.feature)
         from public.property_features f where f.property_id = p.id),
      '{}'::text[]
    ) as features,
    d.avg_usd_per_m2,
    d.listings
  from public.properties p
  left join public.district_price_index d
    on d.district = p.district
   and d.province = p.province
   and d.operation = p.operation
  where p.code = any (p_codigos)
    -- Solo avisos publicados y disponibles: comparar contra uno vendido
    -- o en revisión es comparar contra algo que no se puede visitar.
    and p.publication_status = 'published'
    and p.status = 'available'
  order by array_position(p_codigos, p.code);
$$;

comment on function public.comparar_avisos(text[]) is
  'Comparación de hasta cuatro avisos publicados. Los valores salen de la base sin intermediarios.';

revoke all on function public.comparar_avisos(text[]) from public;
grant execute on function public.comparar_avisos(text[])
  to anon, authenticated, service_role;
