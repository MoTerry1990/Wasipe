-- =====================================================================
-- Datos de ejemplo — Wasipe
--
-- TODO ACÁ ES FICTICIO. Los nombres, correos, teléfonos, direcciones y
-- precios son inventados para poder desarrollar y probar. No hay ningún
-- inmueble ni ninguna persona real en este archivo.
--
-- Se ejecuta con:
--     npm run sembrar          (contra la base configurada en .env)
--     supabase db reset        (lo aplica solo, después de las migraciones)
--
-- El script es idempotente: se puede correr dos veces sin duplicar nada.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- El trigger que impide cambiar el rol se apoya en auth.uid(), y en una
-- siembra no hay sesión: sin sesión, es_admin() es falso y no se podría
-- crear ni un moderador. Se desactiva solo durante la transacción.
-- ---------------------------------------------------------------------
alter table public.profiles disable trigger profiles_sin_escalada;

-- ---------------------------------------------------------------------
-- Tipo de cambio (ficticio, del orden del real)
-- ---------------------------------------------------------------------
insert into public.exchange_rates (day, pen_per_usd, source)
values (current_date, 3.7450, 'semilla')
on conflict (day) do update set pen_per_usd = excluded.pen_per_usd;

-- ---------------------------------------------------------------------
-- Cuentas de prueba
--
-- Se insertan en auth.users, que es donde Supabase guarda la identidad.
-- El trigger `al_crear_usuario` crea el perfil correspondiente.
-- La contraseña de todas es "wasipe-demo-2026" (solo para desarrollo).
-- ---------------------------------------------------------------------
-- Las cuatro columnas de token van en cadena vacía y NO en NULL, aunque
-- la tabla admita NULL. El servicio de autenticación de Supabase está
-- escrito en Go y las lee como texto: un NULL ahí revienta el escaneo y
-- sale al cliente como «Database error querying schema», un 500 en cada
-- inicio de sesión. Cuesta de encontrar porque el mensaje no menciona ni
-- la columna ni la tabla.
--
-- Descubierto en el sprint 22, al correr el flujo de guardar un borrador
-- contra el Preview: la siembra funcionaba, los perfiles se creaban, y
-- nadie podía entrar.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rosa.quispe@ejemplo.pe',
   crypt('wasipe-demo-2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Rosa Quispe"}'::jsonb, now(), now(), '', '', '', ''),

  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'martin.alarcon@ejemplo.pe',
   crypt('wasipe-demo-2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Martín Alarcón"}'::jsonb, now(), now(), '', '', '', ''),

  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lucia.ferrer@ejemplo.pe',
   crypt('wasipe-demo-2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Lucía Ferrer"}'::jsonb, now(), now(), '', '', '', ''),

  ('44444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'moderacion@ejemplo.pe',
   crypt('wasipe-demo-2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Equipo de moderación"}'::jsonb, now(), now(), '', '', '', '')
on conflict (id) do nothing;

-- Por si la base no tiene el trigger de registro (por ejemplo, cuando se
-- siembra sobre un esquema recreado a mano), se asegura el perfil.
insert into public.profiles (id, full_name, role)
values
  ('11111111-1111-4111-8111-111111111111', 'Rosa Quispe', 'owner'),
  ('22222222-2222-4222-8222-222222222222', 'Martín Alarcón', 'agency_admin'),
  ('33333333-3333-4333-8333-333333333333', 'Lucía Ferrer', 'owner'),
  ('44444444-4444-4444-8444-444444444444', 'Equipo de moderación', 'moderator')
on conflict (id) do nothing;

-- Todas las cuentas de ejemplo ya pasaron la bienvenida.
update public.profiles set
  phone = '987654321', whatsapp = '987654321',
  bio = 'Vendo el departamento donde viví los últimos ocho años.',
  preferred_contact = 'whatsapp', intent = 'sell', onboarded_at = now()
where id = '11111111-1111-4111-8111-111111111111';

update public.profiles set
  role = 'agency_admin', phone = '912345678',
  preferred_contact = 'phone', intent = 'sell', onboarded_at = now()
where id = '22222222-2222-4222-8222-222222222222';

update public.profiles set
  role = 'owner', phone = '976543210', whatsapp = '976543210',
  preferred_contact = 'whatsapp', intent = 'buy', onboarded_at = now()
where id = '33333333-3333-4333-8333-333333333333';

update public.profiles set role = 'moderator', onboarded_at = now()
where id = '44444444-4444-4444-8444-444444444444';

-- Distritos que le interesan a Lucía: alimentan sus alertas.
insert into public.profile_districts (user_id, district, province, department)
values
  ('33333333-3333-4333-8333-333333333333', 'Miraflores', 'Lima', 'Lima'),
  ('33333333-3333-4333-8333-333333333333', 'Barranco', 'Lima', 'Lima'),
  ('33333333-3333-4333-8333-333333333333', 'San Isidro', 'Lima', 'Lima')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Inmobiliaria de ejemplo
-- ---------------------------------------------------------------------
insert into public.agencies (id, name, slug, ruc, phone, email, description, created_by)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Inmobiliaria Costa Verde',
  'costa-verde',
  '20512345678',
  '014567890',
  'contacto@costaverde.ejemplo.pe',
  'Inmobiliaria ficticia usada para probar Wasipe. No existe.',
  '22222222-2222-4222-8222-222222222222'
)
on conflict (id) do nothing;

insert into public.agency_members (agency_id, user_id, role, can_publish)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '22222222-2222-4222-8222-222222222222', 'agency_admin', true)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Avisos
--
-- Los precios están en el orden de lo que se pide hoy en cada distrito,
-- pero los inmuebles son inventados. El punto del mapa es el público:
-- viene desplazado respecto de la dirección exacta.
-- ---------------------------------------------------------------------
insert into public.properties (
  id, owner_id, agency_id, title, description,
  operation, property_type, currency, price, maintenance,
  total_area, built_area, bedrooms, bathrooms, parking, age_years,
  furnished, pet_policy, address_privacy,
  department, province, district, ubigeo, lat, lon,
  status, publication_status, verification_status, published_at
)
values
  -- Miraflores, venta en dólares
  ('c0000001-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', null,
   'Departamento de 92 m² a dos cuadras del parque Kennedy',
   'Departamento en un edificio de 2015, piso 7 con vista despejada. Sala comedor amplia, cocina con isla, tres dormitorios con clósets empotrados y dos baños completos. Una cochera techada y depósito. El edificio tiene ascensor, portería 24 horas y área de parrillas.',
   'sale', 'apartment', 'USD', 195000, 320,
   92, 92, 3, 2, 1, 11,
   'none', 'negotiable', 'approximate',
   'Lima', 'Lima', 'Miraflores', '150122', -12.1211, -77.0298,
   'available', 'published', 'verified', now() - interval '9 days'),

  -- San Isidro, venta en dólares, más caro por m²
  ('c0000002-0000-4000-8000-000000000002',
   '22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Departamento estreno de 120 m² frente al Olivar',
   'Proyecto entregado este año, con acabados de primera: pisos de porcelanato, cocina equipada y closets instalados. Tres dormitorios, el principal con walk-in closet y baño en suite. Dos cocheras continuas. El edificio cuenta con gimnasio, sala de reuniones y terraza común en el último piso.',
   'sale', 'apartment', 'USD', 420000, 550,
   120, 120, 3, 3, 2, 0,
   'none', 'allowed', 'approximate',
   'Lima', 'Lima', 'San Isidro', '150131', -12.0975, -77.0387,
   'available', 'published', 'verified', now() - interval '4 days'),

  -- Jesús María, alquiler en soles
  ('c0000003-0000-4000-8000-000000000003',
   '33333333-3333-4333-8333-333333333333', null,
   'Alquiler de departamento amoblado de 68 m² en Jesús María',
   'Departamento amoblado y listo para mudarse, a cinco minutos del Campo de Marte. Dos dormitorios, un baño completo y medio baño de visita. Incluye refrigeradora, lavadora, cocina y todos los muebles de la sala. El precio no incluye los servicios. Se pide un mes de garantía.',
   'rent', 'apartment', 'PEN', 2500, 180,
   68, 68, 2, 2, 1, 14,
   'full', 'not_allowed', 'approximate',
   'Lima', 'Lima', 'Jesús María', '150113', -12.0742, -77.0489,
   'available', 'published', 'unverified', now() - interval '2 days'),

  -- Surco, casa en venta en soles
  ('c0000004-0000-4000-8000-000000000004',
   '11111111-1111-4111-8111-111111111111', null,
   'Casa de 240 m² con jardín en Santiago de Surco',
   'Casa de dos pisos en una calle tranquila de Chacarilla. Sala, comedor, cocina con repostero, sala de estar en el segundo piso, cuatro dormitorios y tres baños. Jardín posterior con grass natural y espacio para parrilla. Cochera para dos autos. Documentos en regla y listos para transferencia.',
   'sale', 'house', 'PEN', 1290000, null,
   300, 240, 4, 3, 2, 22,
   'none', 'allowed', 'approximate',
   'Lima', 'Lima', 'Santiago de Surco', '150140', -12.1092, -76.9853,
   'available', 'published', 'unverified', now() - interval '15 days'),

  -- Barranco, alquiler en dólares
  ('c0000005-0000-4000-8000-000000000005',
   '33333333-3333-4333-8333-333333333333', null,
   'Loft de 55 m² en Barranco, a una cuadra del malecón',
   'Loft de techos altos en una casona restaurada, ideal para una persona o una pareja. Ambiente único con dormitorio en mezanine, baño completo y cocina abierta. Muy iluminado durante todo el día. Zona con cafés, galerías y transporte a la mano. No incluye cochera.',
   'rent', 'apartment', 'USD', 750, 90,
   55, 55, 1, 1, 0, 40,
   'partial', 'negotiable', 'exact',
   'Lima', 'Lima', 'Barranco', '150104', -12.1467, -77.0219,
   'available', 'published', 'unverified', now() - interval '1 day'),

  -- Terreno en Cieneguilla
  ('c0000006-0000-4000-8000-000000000006',
   '22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Terreno de 500 m² en Cieneguilla con acceso asfaltado',
   'Terreno plano y cercado, en una zona de casas de campo con vigilancia particular. Cuenta con agua y luz en la puerta, y acceso por vía asfaltada hasta el ingreso. Partida registral limpia, sin cargas ni gravámenes. Se acepta pago en dos partes.',
   'sale', 'land', 'USD', 88000, null,
   500, null, null, null, null, null,
   'none', null, 'district_only',
   'Lima', 'Lima', 'Cieneguilla', '150109', -12.0908, -76.7826,
   'available', 'published', 'unverified', now() - interval '22 days'),

  -- Arequipa, para que no todo sea Lima
  ('c0000007-0000-4000-8000-000000000007',
   '33333333-3333-4333-8333-333333333333', null,
   'Departamento de 78 m² en Yanahuara con vista al Misti',
   'Departamento en el cuarto piso de un edificio de sillar y concreto, en una de las calles más tranquilas de Yanahuara. Dos dormitorios, dos baños, sala comedor con ventanal y cocina independiente. Desde la sala se ve el Misti los días despejados. Incluye una cochera.',
   'sale', 'apartment', 'USD', 96000, 120,
   78, 78, 2, 2, 1, 8,
   'none', 'allowed', 'approximate',
   'Arequipa', 'Arequipa', 'Yanahuara', '040129', -16.3898, -71.5537,
   'available', 'published', 'unverified', now() - interval '30 days'),

  -- Un borrador, para probar que NO se vea desde afuera
  ('c0000008-0000-4000-8000-000000000008',
   '11111111-1111-4111-8111-111111111111', null,
   'Departamento en borrador que no debe verse en el listado',
   'Este aviso existe solamente para comprobar que la seguridad a nivel de fila funciona: al no estar publicado, ninguna consulta anónima puede devolverlo. Si aparece en el listado público, hay una política mal escrita.',
   'sale', 'apartment', 'USD', 150000, null,
   80, 80, 2, 2, 1, 5,
   'none', null, 'approximate',
   'Lima', 'Lima', 'Magdalena del Mar', '150120', -12.0930, -77.0730,
   'available', 'draft', 'unverified', null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Direcciones exactas (dato sensible: tabla aparte, RLS más estricta)
-- ---------------------------------------------------------------------
insert into public.property_locations
  (property_id, address_line, urbanization, floor, reference, exact_lat, exact_lon)
values
  ('c0000001-0000-4000-8000-000000000001', 'Calle Berlín 245', 'Miraflores', '7',
   'A dos cuadras del parque Kennedy', -12.1223, -77.0281),
  ('c0000002-0000-4000-8000-000000000002', 'Av. Camino Real 1180', 'El Olivar', '9',
   'Frente al bosque El Olivar', -12.0968, -77.0401),
  ('c0000003-0000-4000-8000-000000000003', 'Jr. Huiracocha 1420', 'Jesús María', '4',
   'A cinco minutos del Campo de Marte', -12.0751, -77.0472),
  ('c0000004-0000-4000-8000-000000000004', 'Calle Los Cedros 318', 'Chacarilla del Estanque', null,
   'Cerca del colegio Los Álamos', -12.1085, -76.9841),
  ('c0000005-0000-4000-8000-000000000005', 'Jr. Domeyer 180', 'Barranco', '2',
   'A una cuadra del malecón', -12.1467, -77.0219),
  ('c0000006-0000-4000-8000-000000000006', 'Km 24.5 carretera a Cieneguilla', null, null,
   'Antes del puente', -12.0915, -76.7811),
  ('c0000007-0000-4000-8000-000000000007', 'Calle Misti 412', 'Yanahuara', '4',
   'A dos cuadras del mirador', -16.3905, -71.5528),
  ('c0000008-0000-4000-8000-000000000008', 'Av. Brasil 2900', 'Magdalena', '3',
   'Frente al parque', -12.0925, -77.0721)
on conflict (property_id) do nothing;

-- ---------------------------------------------------------------------
-- Características
-- ---------------------------------------------------------------------
insert into public.property_features (property_id, feature, value)
values
  ('c0000001-0000-4000-8000-000000000001', 'ascensor', null),
  ('c0000001-0000-4000-8000-000000000001', 'porteria_24h', null),
  ('c0000001-0000-4000-8000-000000000001', 'deposito', null),
  ('c0000001-0000-4000-8000-000000000001', 'area_parrillas', null),
  ('c0000002-0000-4000-8000-000000000002', 'gimnasio', null),
  ('c0000002-0000-4000-8000-000000000002', 'terraza_comun', null),
  ('c0000002-0000-4000-8000-000000000002', 'sala_reuniones', null),
  ('c0000002-0000-4000-8000-000000000002', 'piso', '9'),
  ('c0000003-0000-4000-8000-000000000003', 'amoblado', 'completo'),
  ('c0000003-0000-4000-8000-000000000003', 'lavanderia', null),
  ('c0000004-0000-4000-8000-000000000004', 'jardin', null),
  ('c0000004-0000-4000-8000-000000000004', 'parrilla', null),
  ('c0000005-0000-4000-8000-000000000005', 'techos_altos', null),
  ('c0000006-0000-4000-8000-000000000006', 'agua_luz', null),
  ('c0000006-0000-4000-8000-000000000006', 'cercado', null),
  ('c0000007-0000-4000-8000-000000000007', 'vista_montana', null)
on conflict (property_id, feature) do nothing;

-- ---------------------------------------------------------------------
-- Fotos
--
-- Son marcadores de posición hasta que se configure el almacenamiento.
-- Ninguna está editada con IA, así que ninguna lleva etiqueta: la
-- columna `ai_label` la pone la base sola cuando corresponde.
-- ---------------------------------------------------------------------
insert into public.property_media (property_id, kind, url, sort_order, is_cover, alt)
select
  p.id,
  'photo',
  'https://placehold.co/1200x800/e3e8ed/1b2733?text=' ||
    replace(p.district, ' ', '+') || '+' || n,
  n - 1,
  n = 1,
  'Foto ' || n || ' del inmueble en ' || p.district
from public.properties p
cross join generate_series(1, 3) as n
where not exists (
  select 1 from public.property_media m where m.property_id = p.id
);

-- ---------------------------------------------------------------------
-- Un cambio de precio, para que el historial tenga algo que mostrar
-- ---------------------------------------------------------------------
update public.properties
   set price = 195000
 where id = 'c0000001-0000-4000-8000-000000000001'
   and price <> 195000;

insert into public.price_history (property_id, price, currency, price_usd, price_per_m2, changed_at)
select 'c0000001-0000-4000-8000-000000000001', 208000, 'USD', 208000, 2260.87,
       now() - interval '40 days'
where not exists (
  select 1 from public.price_history
  where property_id = 'c0000001-0000-4000-8000-000000000001' and price = 208000
);

-- ---------------------------------------------------------------------
-- Favoritos y una consulta
-- ---------------------------------------------------------------------
insert into public.favorites (user_id, property_id, note)
values
  ('33333333-3333-4333-8333-333333333333', 'c0000001-0000-4000-8000-000000000001',
   'Preguntar si acepta mascotas medianas'),
  ('33333333-3333-4333-8333-333333333333', 'c0000002-0000-4000-8000-000000000002', null)
on conflict do nothing;

insert into public.inquiries
  (property_id, sender_id, sender_name, sender_email, sender_phone, message)
select
  'c0000001-0000-4000-8000-000000000001',
  '33333333-3333-4333-8333-333333333333',
  'Lucía Ferrer',
  'lucia.ferrer@ejemplo.pe',
  '976543210',
  'Buenas tardes, ¿el departamento sigue disponible? Quisiera coordinar una visita este sábado por la mañana.'
where not exists (
  select 1 from public.inquiries
  where property_id = 'c0000001-0000-4000-8000-000000000001'
    and sender_id = '33333333-3333-4333-8333-333333333333'
);

alter table public.profiles enable trigger profiles_sin_escalada;

commit;
