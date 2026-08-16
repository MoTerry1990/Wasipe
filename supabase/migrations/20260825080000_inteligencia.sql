-- =====================================================================
-- 20260825080000 — Inteligencia de mercado
--
-- El precio por m² a la vista es lo que diferencia a Wasipe. Y es
-- exactamente por eso que este es el archivo donde más fácil se rompe la
-- confianza: una cifra publicada sin sustento vale menos que no publicar
-- nada.
--
-- Cuatro reglas, y las cuatro viven en la base:
--
--   1. Solo entran avisos PUBLICADOS y DISPONIBLES. Un aviso rechazado,
--      pausado, vencido o ya vendido no representa el mercado de hoy.
--   2. Se descartan los atípicos con vallas intercuartílicas. Un aviso
--      con un cero de más mueve un promedio de treinta.
--   3. Debajo de la muestra mínima NO se publica un número. «Pocos datos»
--      es una respuesta honesta; un promedio de dos avisos, no.
--   4. Todo agregado dice de cuántos avisos sale y cuándo se calculó.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Los cortes que pide el producto
-- ---------------------------------------------------------------------
create type public.market_period as enum ('m3', 'm6', 'm12', 'todo');

/** Debajo de esto no se publica una cifra. Cinco es poco; menos es mentir. */
create or replace function public.muestra_minima()
returns integer language sql immutable as $$ select 5 $$;

-- ---------------------------------------------------------------------
-- market_stats — el índice, ya calculado
--
-- Tabla y no vista: se recalcula a mano o por tarea programada, y hace
-- falta poder decir CUÁNDO se calculó. Una vista siempre parece fresca
-- aunque los datos tengan un mes.
--
-- `property_type` NULL es el corte «todos los tipos»; se guardan las dos
-- filas para no tener que decidir en la consulta.
-- ---------------------------------------------------------------------
create table public.market_stats (
  department text not null,
  province text not null,
  district text not null,
  operation public.listing_operation not null,
  property_type public.property_type,
  period public.market_period not null,

  listings integer not null check (listings >= 0),
  avg_usd_per_m2 numeric(12, 2),
  median_usd_per_m2 numeric(12, 2),
  p25_usd_per_m2 numeric(12, 2),
  p75_usd_per_m2 numeric(12, 2),
  min_usd_per_m2 numeric(12, 2),
  max_usd_per_m2 numeric(12, 2),
  /** Mediana del precio total, para tener el orden de magnitud. */
  median_price_usd numeric(14, 2),
  median_area numeric(12, 2),

  /** Cuántos avisos se dejaron fuera por atípicos. Se muestra. */
  outliers integer not null default 0 check (outliers >= 0),
  /** false cuando no se llegó a la muestra mínima: no hay cifra que dar. */
  sufficient boolean not null default false,

  /** El tipo de cambio con el que se normalizó, y cuándo. */
  pen_per_usd numeric(8, 4) not null,
  computed_at timestamptz not null default now(),

  -- Sin clave primaria a propósito: una columna de la PK es NOT NULL, y
  -- el corte «todos los tipos» es precisamente property_type NULL. La
  -- unicidad va en los dos índices de abajo, uno por cada caso.
  constraint sin_cifra_sin_muestra
    check (not sufficient or median_usd_per_m2 is not null)
);

create unique index market_stats_corte_idx
  on public.market_stats (department, province, district, operation, period, property_type)
  where property_type is not null;

create unique index market_stats_corte_general_idx
  on public.market_stats (department, province, district, operation, period)
  where property_type is null;

comment on table public.market_stats is
  'Índice de precio por m². Se recalcula; nunca se edita a mano. `sufficient` en false significa que no hay cifra que publicar.';
comment on column public.market_stats.pen_per_usd is
  'Tipo de cambio usado para normalizar. Va guardado: sin él, la cifra no se puede reproducir.';

create index market_stats_distrito_idx
  on public.market_stats (district, operation, period) where sufficient;

alter table public.market_stats enable row level security;

-- El índice es público: es el diferenciador del producto.
create policy "el indice de mercado es publico"
  on public.market_stats for select
  to anon, authenticated
  using (true);

-- Escribir es solo del recálculo, que corre con clave de servicio.

-- ---------------------------------------------------------------------
-- Qué avisos entran al cálculo
--
-- Una vista para no repetir el filtro en cinco lugares y, sobre todo,
-- para que la regla esté escrita UNA vez: si mañana hay que sumar otro
-- estado, se cambia acá y no en cada consulta.
-- ---------------------------------------------------------------------
create or replace view public.avisos_para_mercado
with (security_invoker = true) as
select
  p.id, p.department, p.province, p.district, p.operation, p.property_type,
  p.price, p.currency, p.price_usd, p.total_area, p.price_usd_per_m2,
  p.published_at, p.updated_at
from public.properties p
where p.publication_status = 'published'
  and p.status = 'available'
  and p.price_usd_per_m2 is not null
  and p.price_usd_per_m2 > 0
  and p.total_area > 0;

comment on view public.avisos_para_mercado is
  'Los avisos que representan el mercado de hoy: publicados y disponibles. Rechazados, pausados, vencidos y vendidos quedan fuera.';

-- ---------------------------------------------------------------------
-- recalcular_mercado — el único camino para escribir el índice
--
-- Vallas intercuartílicas de Tukey: se descarta lo que cae fuera de
-- [Q1 − 1.5·RIC, Q3 + 1.5·RIC]. Es el criterio estándar y, sobre todo, es
-- explicable: se puede decir cuántos avisos se dejaron fuera y por qué,
-- que es lo que se muestra en la pantalla.
--
-- Con menos de 4 avisos no se calculan cuartiles —no hay con qué— así que
-- el filtro se salta y la muestra queda insuficiente igual.
-- ---------------------------------------------------------------------
create or replace function public.recalcular_mercado()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cambio numeric := public.tipo_cambio_vigente();
  filas integer;
begin
  delete from public.market_stats;

  with base as (
    select
      a.*,
      -- Cada corte de tiempo se resuelve con una columna, no con cuatro
      -- consultas: el aviso pertenece a todos los períodos que lo cubren.
      case
        when a.published_at >= now() - interval '3 months'  then array['m3','m6','m12','todo']
        when a.published_at >= now() - interval '6 months'  then array['m6','m12','todo']
        when a.published_at >= now() - interval '12 months' then array['m12','todo']
        else array['todo']
      end as periodos
    from public.avisos_para_mercado a
  ),
  extendido as (
    select b.*, unnest(b.periodos)::public.market_period as period from base b
  ),
  -- Se abre en dos: con tipo y sin tipo (el corte «todos los tipos»).
  cortes as (
    select department, province, district, operation, property_type, period,
           price_usd_per_m2, price_usd, total_area
      from extendido
    union all
    select department, province, district, operation, null::public.property_type, period,
           price_usd_per_m2, price_usd, total_area
      from extendido
  ),
  vallas as (
    select
      department, province, district, operation, property_type, period,
      percentile_cont(0.25) within group (order by price_usd_per_m2) as q1,
      percentile_cont(0.75) within group (order by price_usd_per_m2) as q3,
      count(*) as crudos
    from cortes
    group by department, province, district, operation, property_type, period
  ),
  limpio as (
    select c.*, v.crudos
    from cortes c
    join vallas v
      on  v.department = c.department
      and v.province = c.province
      and v.district = c.district
      and v.operation = c.operation
      and v.period = c.period
      -- `is not distinct from` y no `=`: el corte «todos los tipos» tiene
      -- property_type NULL, y NULL = NULL no es verdadero.
      and v.property_type is not distinct from c.property_type
    where v.crudos < 4
       or c.price_usd_per_m2 between v.q1 - 1.5 * (v.q3 - v.q1)
                                 and v.q3 + 1.5 * (v.q3 - v.q1)
  )
  insert into public.market_stats (
    department, province, district, operation, property_type, period,
    listings, avg_usd_per_m2, median_usd_per_m2, p25_usd_per_m2, p75_usd_per_m2,
    min_usd_per_m2, max_usd_per_m2, median_price_usd, median_area,
    outliers, sufficient, pen_per_usd, computed_at
  )
  select
    department, province, district, operation, property_type, period,
    count(*)::int,
    round(avg(price_usd_per_m2), 2),
    round((percentile_cont(0.5) within group (order by price_usd_per_m2))::numeric, 2),
    round((percentile_cont(0.25) within group (order by price_usd_per_m2))::numeric, 2),
    round((percentile_cont(0.75) within group (order by price_usd_per_m2))::numeric, 2),
    round(min(price_usd_per_m2), 2),
    round(max(price_usd_per_m2), 2),
    round((percentile_cont(0.5) within group (order by price_usd))::numeric, 2),
    round((percentile_cont(0.5) within group (order by total_area))::numeric, 2),
    (max(crudos) - count(*))::int,
    count(*) >= public.muestra_minima(),
    cambio,
    now()
  from limpio
  group by department, province, district, operation, property_type, period;

  get diagnostics filas = row_count;

  perform public.registrar_auditoria(
    'recalcular_mercado', 'market_stats', null, null,
    jsonb_build_object('filas', filas, 'tipo_cambio', cambio)
  );

  return filas;
end;
$$;

-- ---------------------------------------------------------------------
-- comparables_de — los avisos con los que se evaluó un precio
--
-- «Comparables» que no se pueden mirar no son comparables: son un número
-- que hay que creer. Esta función devuelve exactamente los avisos que
-- entraron a la cuenta, para poder ponerlos en pantalla.
-- ---------------------------------------------------------------------
create or replace function public.comparables_de(
  p_property_id uuid,
  p_limite integer default 8
)
returns table (
  id uuid,
  code text,
  title text,
  district text,
  price numeric,
  currency public.currency,
  total_area numeric,
  price_usd_per_m2 numeric,
  bedrooms integer,
  published_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with yo as (
    select district, province, operation, property_type, total_area, id
      from public.properties where id = p_property_id
  )
  select a.id, p.code, p.title, a.district, a.price, a.currency,
         a.total_area, a.price_usd_per_m2, p.bedrooms, a.published_at
    from public.avisos_para_mercado a
    join public.properties p on p.id = a.id
    join yo on true
   where a.district = yo.district
     and a.province = yo.province
     and a.operation = yo.operation
     and a.property_type = yo.property_type
     and a.id <> yo.id
     -- Un departamento de 40 m² no compara contra uno de 300. La ventana
     -- de ±40% del área es la que usan los tasadores para «similar».
     and a.total_area between yo.total_area * 0.6 and yo.total_area * 1.4
   order by abs(a.total_area - yo.total_area)
   limit greatest(least(p_limite, 30), 1);
$$;

comment on function public.comparables_de(uuid, integer) is
  'Los avisos que sustentan la evaluación de precio. Sin poder mirarlos, la evaluación es un número que hay que creer.';

revoke all on function public.recalcular_mercado() from public;
revoke all on function public.comparables_de(uuid, integer) from public;
grant execute on function public.recalcular_mercado() to service_role;
grant execute on function public.comparables_de(uuid, integer)
  to anon, authenticated, service_role;
grant execute on function public.muestra_minima() to anon, authenticated, service_role;
