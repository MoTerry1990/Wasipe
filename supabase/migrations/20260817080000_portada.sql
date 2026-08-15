-- =====================================================================
-- 20260817080000 — Vistas que alimentan la portada
--
-- Las tres van con `security_invoker = true`: se ejecutan con los
-- permisos de quien consulta, así que la RLS de properties sigue
-- mandando. Sin esa opción, una vista correría con los permisos de quien
-- la creó y se convertiría en una puerta trasera al listado completo,
-- borradores incluidos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- listings_price_drops — "Bajaron de precio".
--
-- Es la sección que la competencia no tiene, porque revela cuánto tiempo
-- lleva un aviso sin venderse. Se arma con el historial: se compara el
-- precio de hoy contra el anterior, y solo aparecen los que bajaron.
--
-- Todo se compara en dólares. Comparar `price` contra `price` daría un
-- falso "bajó" cuando alguien pasa un aviso de soles a dólares.
-- ---------------------------------------------------------------------
create view public.listings_price_drops
with (security_invoker = true) as
select
  p.id                                   as property_id,
  anterior.price                         as previous_price,
  anterior.currency                      as previous_currency,
  anterior.price_usd                     as previous_price_usd,
  p.price                                as current_price,
  p.currency                             as current_currency,
  p.price_usd                            as current_price_usd,
  round(
    ((anterior.price_usd - p.price_usd) / nullif(anterior.price_usd, 0)) * 100,
    1
  )                                      as drop_pct,
  anterior.changed_at                    as dropped_at
from public.properties p
join lateral (
  -- La fila anterior a la vigente: por eso el offset 1.
  select ph.price, ph.currency, ph.price_usd, ph.changed_at
  from public.price_history ph
  where ph.property_id = p.id
  order by ph.changed_at desc
  offset 1
  limit 1
) anterior on true
where p.publication_status = 'published'
  and p.status = 'available'
  and p.price_usd is not null
  and anterior.price_usd is not null
  and p.price_usd < anterior.price_usd;

comment on view public.listings_price_drops is
  'Avisos publicados cuyo precio bajó respecto del anterior. Compara en dólares para no confundir un cambio de moneda con una rebaja.';

-- ---------------------------------------------------------------------
-- district_price_index — precio promedio por m².
--
-- Se publican la mediana y el promedio junto con la cantidad de avisos.
-- Mostrar un promedio sin decir de cuántos avisos sale es la forma más
-- fácil de mentir con estadística: con tres departamentos, una mansión
-- levanta el "promedio del distrito" y nadie se entera.
-- ---------------------------------------------------------------------
create view public.district_price_index
with (security_invoker = true) as
select
  department,
  province,
  district,
  operation,
  count(*)::int                                                     as listings,
  round(avg(price_usd_per_m2), 2)                                   as avg_usd_per_m2,
  round(
    (percentile_cont(0.5) within group (order by price_usd_per_m2))::numeric,
    2
  )                                                                 as median_usd_per_m2,
  round(min(price_usd_per_m2), 2)                                   as min_usd_per_m2,
  round(max(price_usd_per_m2), 2)                                   as max_usd_per_m2
from public.properties
where publication_status = 'published'
  and status = 'available'
  and price_usd_per_m2 is not null
group by department, province, district, operation;

comment on view public.district_price_index is
  'Precio por m² por distrito y operación. `listings` va siempre: un promedio sin su tamaño de muestra engaña.';

-- ---------------------------------------------------------------------
-- popular_districts — atajos de la portada.
--
-- Cuántos avisos hay en cada distrito. Con esto los atajos dejan de ser
-- una lista escrita a mano y pasan a reflejar dónde hay algo que ver.
-- ---------------------------------------------------------------------
create view public.popular_districts
with (security_invoker = true) as
select
  department,
  province,
  district,
  count(*)::int                                                     as listings,
  count(*) filter (where operation = 'sale')::int                   as for_sale,
  count(*) filter (where operation = 'rent')::int                   as for_rent,
  round(avg(price_usd_per_m2), 2)                                   as avg_usd_per_m2
from public.properties
where publication_status = 'published'
  and status = 'available'
group by department, province, district;

grant select on public.listings_price_drops, public.district_price_index,
                public.popular_districts
  to anon, authenticated;
