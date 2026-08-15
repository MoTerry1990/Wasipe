-- =====================================================================
-- 20260815120100 — Tipos enumerados
--
-- Los valores van en inglés, igual que las tablas y las columnas: son
-- identificadores de código. Las etiquetas que ve la persona usuaria
-- están en español en lib/etiquetas.ts, y la prueba de idioma vigila
-- que ningún valor crudo se filtre a la interfaz.
-- =====================================================================

-- Rol de usuario. `admin` y `moderator` NUNCA se asignan desde el
-- cliente: hay un trigger que bloquea el cambio de rol (ver RLS).
create type public.user_role as enum (
  'owner',        -- propietario directo
  'agent',        -- corredor inmobiliario independiente
  'agency_admin', -- administra una inmobiliaria
  'moderator',    -- revisa avisos y denuncias
  'admin'         -- acceso total
);

-- Estado comercial del inmueble: qué pasó con la propiedad.
create type public.property_status as enum (
  'available',
  'reserved',
  'sold',
  'rented',
  'withdrawn'
);

-- Operación del aviso.
create type public.listing_operation as enum (
  'sale',     -- venta
  'rent',     -- alquiler
  'project'   -- proyecto en construcción / preventa
);

-- Tipo de inmueble, con los que realmente se publican en el Perú.
create type public.property_type as enum (
  'apartment',    -- departamento
  'house',        -- casa
  'land',         -- terreno
  'office',       -- oficina
  'commercial',   -- local comercial
  'warehouse',    -- almacén / depósito
  'room',         -- habitación
  'country_house',-- casa de campo
  'garage',       -- cochera
  'building'      -- edificio completo
);

-- Moneda. Solo soles y dólares: es lo que se usa en el mercado peruano.
create type public.currency as enum ('PEN', 'USD');

-- Estado editorial del aviso: en qué punto del flujo de publicación está.
create type public.publication_status as enum (
  'draft',
  'in_review',
  'published',
  'rejected',
  'paused',
  'expired'
);

-- Verificación del aviso: si alguien de Wasipe comprobó que es real.
create type public.verification_status as enum (
  'unverified',
  'in_progress',
  'verified',
  'rejected'
);

-- ---------------------------------------------------------------------
-- Enumerados de apoyo
-- ---------------------------------------------------------------------

-- Privacidad de la dirección. Por defecto se publica aproximada: el mapa
-- muestra un punto desplazado ~300 m y la dirección exacta queda en
-- property_locations, con RLS más estricta.
create type public.address_privacy as enum (
  'exact',          -- se muestra la dirección completa
  'approximate',    -- solo la manzana / punto desplazado
  'district_only'   -- únicamente distrito
);

create type public.furnished_status as enum ('none', 'partial', 'full');

create type public.pet_policy as enum ('allowed', 'not_allowed', 'negotiable');

create type public.agency_member_role as enum ('agency_admin', 'agent');

create type public.media_kind as enum ('photo', 'video', 'tour', 'floor_plan');

create type public.inquiry_status as enum ('new', 'read', 'answered', 'archived', 'spam');

create type public.report_reason as enum (
  'duplicate',
  'wrong_price',
  'already_taken',
  'fake_photos',
  'scam',
  'wrong_location',
  'other'
);

create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');

create type public.subscription_status as enum (
  'trialing',
  'active',
  'past_due',
  'canceled',
  'expired'
);

create type public.alert_frequency as enum ('never', 'instant', 'daily', 'weekly');

-- Trabajos de Wasi AI. Cada uno consume créditos y deja rastro.
create type public.ai_job_kind as enum (
  'listing_draft',      -- redacción del aviso
  'photo_enhance',      -- mejora de foto
  'virtual_staging',    -- amoblado virtual
  'video_tour',         -- video automático
  'price_estimate',     -- estimación referencial de precio
  'search_parse'        -- interpretación de búsqueda en lenguaje natural
);

create type public.ai_job_status as enum (
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled'
);
