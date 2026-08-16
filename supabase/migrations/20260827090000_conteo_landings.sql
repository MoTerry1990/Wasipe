-- ---------------------------------------------------------------------
-- Conteo de avisos por landing
--
-- El sitemap tiene que saber cuántos avisos hay detrás de cada
-- combinación de operación, tipo y distrito, para no publicar una
-- dirección con dos resultados. Son unas trescientas combinaciones: pedir
-- trescientos conteos por HTTP es inaceptable, y traerse todos los avisos
-- para contarlos en JavaScript deja de funcionar el día que haya
-- cincuenta mil.
--
-- Así que el agrupamiento lo hace Postgres, que es lo suyo, y devuelve
-- unas pocas decenas de filas.
--
-- `security invoker` a propósito: la función cuenta lo que quien llama
-- puede ver. Un visitante anónimo cuenta avisos publicados, y ya. Con
-- `security definer` un aviso en borrador engordaría el conteo de su
-- distrito y el sitemap publicaría una landing vacía.
-- ---------------------------------------------------------------------

create or replace function public.conteo_de_landings()
returns table (
  operation public.listing_operation,
  property_type public.property_type,
  district text,
  total bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  -- `grouping sets` da en una sola pasada los tres cortes que necesita el
  -- sitemap: por tipo, por distrito, y por los dos juntos. Las columnas
  -- que no participan de un corte salen en null, que es exactamente lo
  -- que significan: «todos los tipos», «todo el país».
  select
    p.operation,
    p.property_type,
    p.district,
    count(*) as total
  from public.properties p
  -- Explícito aunque RLS ya lo haga para un visitante: quien llame con
  -- sesión ve además sus propios borradores, y un borrador no puede
  -- engordar el conteo de su distrito.
  where p.publication_status = 'published' and p.status = 'available'
  group by grouping sets (
    (p.operation, p.property_type),
    (p.operation, p.district),
    (p.operation, p.property_type, p.district)
  )
$$;

comment on function public.conteo_de_landings() is
  'Cuántos avisos visibles hay por operación, tipo y distrito. Lo usa el sitemap para no publicar landings flacas.';

grant execute on function public.conteo_de_landings() to anon, authenticated, service_role;
