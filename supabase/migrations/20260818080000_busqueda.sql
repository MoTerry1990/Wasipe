-- =====================================================================
-- 20260818080000 — Soporte del buscador
--
-- Dos filtros de la búsqueda ("bajaron de precio" y "recién publicados")
-- se podían resolver leyendo el historial en cada consulta. Eso obliga a
-- recorrer price_history por cada aviso candidato: con mil avisos anda,
-- con cien mil no.
--
-- Se guarda la fecha de la última rebaja en la propia fila del aviso y se
-- indexa. La mantiene el mismo trigger que ya escribe el historial, así
-- que no hay dos fuentes de verdad que puedan separarse.
-- =====================================================================

alter table public.properties
  add column price_dropped_at timestamptz;

comment on column public.properties.price_dropped_at is
  'Última vez que el precio bajó, en dólares. La escribe el trigger del historial: no se toca a mano.';

create or replace function public.registrar_cambio_precio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  anterior_usd numeric;
begin
  if tg_op = 'UPDATE'
     and new.price is not distinct from old.price
     and new.currency is not distinct from old.currency then
    return new;
  end if;

  insert into public.price_history
    (property_id, price, currency, price_usd, price_per_m2, changed_by)
  values
    (new.id, new.price, new.currency, new.price_usd, new.price_per_m2, auth.uid());

  -- ¿Bajó? Se compara contra la referencia en dólares del precio
  -- anterior. Comparar `price` contra `price` marcaría como rebaja el
  -- simple hecho de pasar un aviso de soles a dólares.
  if tg_op = 'UPDATE' then
    anterior_usd := old.price_usd;

    if anterior_usd is not null
       and new.price_usd is not null
       and new.price_usd < anterior_usd then
      -- El trigger está declarado `of price, currency`, así que escribir
      -- otra columna no lo vuelve a disparar.
      update public.properties
         set price_dropped_at = now()
       where id = new.id;
    end if;
  end if;

  return new;
end;
$$;

-- Los avisos que ya tienen historial no pasaron por el trigger nuevo.
update public.properties p
   set price_dropped_at = rebaja.dropped_at
  from public.listings_price_drops rebaja
 where rebaja.property_id = p.id;

-- ---------------------------------------------------------------------
-- Índices del buscador
--
-- Todos son parciales sobre los avisos publicados y disponibles, que es
-- lo único que el buscador mira. Con el tiempo los borradores, pausados
-- y vencidos van a ser la mayoría de la tabla: dejarlos fuera del índice
-- lo mantiene chico y en memoria.
-- ---------------------------------------------------------------------

-- El camino más recorrido: operación + distrito, ordenado por fecha.
create index properties_busqueda_distrito_idx
  on public.properties (operation, district, published_at desc)
  where publication_status = 'published' and status = 'available';

-- Lo mismo, ordenando por precio (el segundo orden más usado).
create index properties_busqueda_precio_idx
  on public.properties (operation, district, price_usd)
  where publication_status = 'published' and status = 'available';

-- Filtro por tipo de inmueble dentro de una operación.
create index properties_busqueda_tipo_idx
  on public.properties (operation, property_type, price_usd)
  where publication_status = 'published' and status = 'available';

-- Provincia y departamento, para las búsquedas amplias.
create index properties_busqueda_region_idx
  on public.properties (department, province, operation, published_at desc)
  where publication_status = 'published' and status = 'available';

-- "Solo verificados".
create index properties_verificados_idx
  on public.properties (operation, verification_status, published_at desc)
  where publication_status = 'published'
    and status = 'available'
    and verification_status = 'verified';

-- "Bajaron de precio".
create index properties_rebajados_idx
  on public.properties (price_dropped_at desc)
  where publication_status = 'published'
    and status = 'available'
    and price_dropped_at is not null;

-- Orden por precio por m², que es el que diferencia a Wasipe.
create index properties_orden_m2_idx
  on public.properties (operation, price_usd_per_m2)
  where publication_status = 'published'
    and status = 'available'
    and price_usd_per_m2 is not null;
