-- =====================================================================
-- 20260815120700 — Índices de búsqueda
--
-- Están todos juntos a propósito: así se ve de un vistazo qué consultas
-- se están sosteniendo, y se nota enseguida cuando falta una.
-- =====================================================================

-- ---------------------------------------------------------------------
-- El índice principal: el listado público.
--
-- Casi toda consulta del portal empieza por "avisos publicados y
-- disponibles". El índice parcial deja fuera borradores, pausados y
-- vencidos, que son la mayoría con el tiempo.
-- ---------------------------------------------------------------------
create index properties_publicos_idx
  on public.properties (operation, property_type, district, price_usd)
  where publication_status = 'published' and status = 'available';

-- Orden por defecto del listado: lo más nuevo primero.
create index properties_recientes_idx
  on public.properties (published_at desc)
  where publication_status = 'published' and status = 'available';

-- Rango de precio entre monedas: se filtra siempre por la referencia en
-- dólares, nunca por `price`, que mezcla soles con dólares.
create index properties_precio_usd_idx
  on public.properties (price_usd)
  where publication_status = 'published' and status = 'available';

-- Ordenar por precio por m², que es como se compara de verdad.
create index properties_precio_m2_idx
  on public.properties (price_usd_per_m2)
  where publication_status = 'published' and status = 'available';

-- Filtros de ambientes.
create index properties_ambientes_idx
  on public.properties (bedrooms, bathrooms, parking)
  where publication_status = 'published' and status = 'available';

-- Panel del anunciante y de la inmobiliaria.
create index properties_owner_idx on public.properties (owner_id, created_at desc);
create index properties_agency_idx
  on public.properties (agency_id, created_at desc) where agency_id is not null;

-- Cola de moderación.
create index properties_revision_idx
  on public.properties (publication_status, created_at)
  where publication_status in ('in_review', 'rejected');

-- Vencimiento de avisos (tarea programada).
create index properties_vencimiento_idx
  on public.properties (expires_at)
  where publication_status = 'published';

-- Búsqueda por texto.
create index properties_texto_idx on public.properties using gin (search_vector);

-- Autocompletado de distrito: "mira" → "Miraflores". Con trigramas sobre
-- el texto sin tildes, para que funcione escrito de cualquier forma.
create index properties_distrito_trgm_idx
  on public.properties using gin (public.sin_tildes(district) extensions.gin_trgm_ops);

-- Índice del índice de precios por m²: alimenta la página /precio-m2.
create index properties_indice_distrito_idx
  on public.properties (department, province, district, property_type, operation)
  where publication_status = 'published' and price_usd_per_m2 is not null;

-- Caja de búsqueda por código: "WSP-001234".
-- (el UNIQUE de `code` ya sirve; se documenta para que no se agregue otro)

-- ---------------------------------------------------------------------
-- Detalle del aviso
-- ---------------------------------------------------------------------
create index property_media_property_idx
  on public.property_media (property_id, sort_order);

create index property_features_feature_idx
  on public.property_features (feature);
