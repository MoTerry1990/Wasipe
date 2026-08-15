// GENERADO por scripts/generar-migraciones-embebidas.js — no editar a mano.
// Fuente: src/db/migraciones/*.sql

export const MIGRACIONES = [
  { nombre: "001_inicial.sql", sql: `-- =====================================================================
-- Wasipe · Esquema inicial
-- PostgreSQL 15+ (Neon)
--
-- Convenciones:
--   · Claves primarias UUID  (gen_random_uuid(), nativo desde PG13)
--   · Dinero SIEMPRE NUMERIC — nunca DOUBLE PRECISION
--   · Fechas SIEMPRE TIMESTAMPTZ
--   · Estados: TEXT + CHECK (no ENUM nativo — ver ESQUEMA.md §5)
--   · Nombres en español, coherentes con el código existente
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------
-- unaccent() es STABLE, no IMMUTABLE, así que no se puede usar dentro de
-- una columna generada ni de un índice. Este envoltorio lo arregla.
-- Sin esto, el CREATE TABLE de propiedades falla.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sin_tildes(texto text)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS
$$ SELECT public.unaccent('public.unaccent'::regdictionary, texto) $$;

-- Trigger genérico para mantener actualizado_en
CREATE OR REPLACE FUNCTION tocar_actualizado_en()
RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN NEW.actualizado_en := now(); RETURN NEW; END $$;


-- =====================================================================
-- 1. CATÁLOGOS Y REFERENCIA
-- =====================================================================

-- Ubicaciones normalizadas.
-- Sin esto, "Surco" y "Santiago de Surco" fragmentan la búsqueda.
CREATE TABLE ubicaciones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  departamento  TEXT NOT NULL,
  provincia     TEXT NOT NULL,
  distrito      TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,          -- 'miraflores', 'santiago-de-surco'
  alias         TEXT[] NOT NULL DEFAULT '{}',  -- {'Surco','Santiago de Surco'}
  ubigeo        TEXT,                          -- código INEI oficial (6 dígitos)
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  descripcion   TEXT,                          -- texto SEO por distrito
  destacado     BOOLEAN NOT NULL DEFAULT false,
  activo        BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (departamento, provincia, distrito)
);

-- Tipo de cambio: sin esto no se puede buscar por rango de precio
-- cuando hay avisos en USD y en PEN mezclados.
CREATE TABLE tipo_cambio (
  fecha       DATE PRIMARY KEY,
  usd_a_pen   NUMERIC(8,4) NOT NULL CHECK (usd_a_pen > 0),
  fuente      TEXT NOT NULL DEFAULT 'sbs'
);

-- Catálogo de características. Tabla y no lista fija: la UI se arma
-- desde acá y se agregan sin deploy.
CREATE TABLE caracteristicas (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug     TEXT NOT NULL UNIQUE,               -- 'ascensor', 'acepta-mascotas'
  nombre   TEXT NOT NULL,
  grupo    TEXT NOT NULL CHECK (grupo IN
             ('edificio','interior','exterior','servicios','seguridad','entorno')),
  aplica_a TEXT[] NOT NULL DEFAULT '{}',       -- {'departamento','casa'}
  icono    TEXT,
  orden    INTEGER NOT NULL DEFAULT 0,
  activo   BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE config (
  clave  TEXT PRIMARY KEY,
  valor  TEXT NOT NULL
);


-- =====================================================================
-- 2. IDENTIDAD: usuarios, roles, perfiles, agencias
-- =====================================================================

CREATE TABLE usuarios (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT NOT NULL,
  password_hash       TEXT NOT NULL,
  rol                 TEXT NOT NULL DEFAULT 'comprador' CHECK (rol IN
                        ('comprador','propietario','agente','inmobiliaria','moderador','admin')),
  nombre              TEXT NOT NULL,
  telefono            TEXT,
  email_verificado_en TIMESTAMPTZ,
  verificado          BOOLEAN NOT NULL DEFAULT false,  -- identidad/RUC validado por admin
  estado              TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN
                        ('activo','suspendido','baja')),
  motivo_suspension   TEXT,
  version_token       INTEGER NOT NULL DEFAULT 0,      -- invalida JWTs emitidos
  ultimo_acceso       TIMESTAMPTZ,
  origen              TEXT,                            -- utm / campaña de registro
  creado_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  eliminado_en        TIMESTAMPTZ                      -- baja lógica (Ley 29733)
);
-- Email único sin importar mayúsculas, ignorando cuentas dadas de baja
CREATE UNIQUE INDEX ux_usuarios_email ON usuarios (lower(email)) WHERE eliminado_en IS NULL;
CREATE INDEX ix_usuarios_rol         ON usuarios (rol) WHERE eliminado_en IS NULL;
CREATE TRIGGER t_usuarios_upd BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION tocar_actualizado_en();

-- Perfil común a todos los roles (comprador incluido)
CREATE TABLE perfiles (
  usuario_id      UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  foto_url        TEXT,
  bio             TEXT CHECK (length(bio) <= 600),
  ubicacion_id    UUID REFERENCES ubicaciones(id) ON DELETE SET NULL,
  whatsapp        TEXT,
  sitio_web       TEXT,
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER t_perfiles_upd BEFORE UPDATE ON perfiles
  FOR EACH ROW EXECUTE FUNCTION tocar_actualizado_en();

CREATE TABLE agencias (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  ruc             TEXT UNIQUE CHECK (ruc ~ '^\\d{11}$'),
  logo_url        TEXT,
  descripcion     TEXT,
  sitio_web       TEXT,
  telefono        TEXT,
  whatsapp        TEXT,
  ubicacion_id    UUID REFERENCES ubicaciones(id) ON DELETE SET NULL,
  direccion       TEXT,
  verificada      BOOLEAN NOT NULL DEFAULT false,
  verificada_en   TIMESTAMPTZ,
  verificada_por  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  estado          TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN
                    ('activa','suspendida','baja')),
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER t_agencias_upd BEFORE UPDATE ON agencias
  FOR EACH ROW EXECUTE FUNCTION tocar_actualizado_en();

-- Un usuario puede pertenecer a varias agencias (poco común, pero pasa)
CREATE TABLE agencia_miembros (
  agencia_id   UUID NOT NULL REFERENCES agencias(id) ON DELETE CASCADE,
  usuario_id   UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  rol          TEXT NOT NULL CHECK (rol IN ('dueno','admin','agente')),
  invitado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  aceptado_en  TIMESTAMPTZ,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agencia_id, usuario_id)
);
CREATE INDEX ix_miembros_usuario ON agencia_miembros (usuario_id);
-- Toda agencia debe tener exactamente un dueño
CREATE UNIQUE INDEX ux_agencia_dueno ON agencia_miembros (agencia_id) WHERE rol = 'dueno';

-- Datos que solo aplican a quien vende profesionalmente
CREATE TABLE perfiles_agente (
  usuario_id       UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  slug             TEXT NOT NULL UNIQUE,        -- /agente/juan-perez
  agencia_id       UUID REFERENCES agencias(id) ON DELETE SET NULL,
  colegiatura      TEXT,
  anios_experiencia INTEGER CHECK (anios_experiencia BETWEEN 0 AND 70),
  zonas            UUID[] NOT NULL DEFAULT '{}',  -- ubicaciones donde trabaja
  especialidades   TEXT[] NOT NULL DEFAULT '{}',  -- {'residencial','comercial'}
  idiomas          TEXT[] NOT NULL DEFAULT '{}',
  acepta_leads     BOOLEAN NOT NULL DEFAULT true,
  actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_agente_agencia ON perfiles_agente (agencia_id);

-- Tokens de un solo uso: verificar email y recuperar contraseña.
-- Se guarda el hash, nunca el token en claro.
CREATE TABLE tokens_cuenta (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('verificar_email','recuperar_password','invitacion')),
  token_hash  TEXT NOT NULL UNIQUE,
  expira_en   TIMESTAMPTZ NOT NULL,
  usado_en    TIMESTAMPTZ,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_tokens_usuario ON tokens_cuenta (usuario_id, tipo) WHERE usado_en IS NULL;

-- Rate limiting (ya existía en el esquema actual)
CREATE TABLE intentos_auth (
  clave    TEXT PRIMARY KEY,        -- 'login:correo@x.com', 'contacto:ip:prop_id'
  conteo   INTEGER NOT NULL DEFAULT 0,
  ventana  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- =====================================================================
-- 3. AVISOS
-- =====================================================================

CREATE TABLE propiedades (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo           TEXT NOT NULL UNIQUE,        -- 'WSP-10428', referencia pública
  slug             TEXT NOT NULL UNIQUE,        -- 'depa-3-dorm-miraflores-wsp10428'

  -- Quién publica: un usuario siempre; una agencia opcionalmente
  usuario_id       UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  agencia_id       UUID REFERENCES agencias(id) ON DELETE SET NULL,
  proyecto_id      UUID,                        -- FK añadida al final (dependencia circular)

  operacion        TEXT NOT NULL CHECK (operacion IN ('venta','alquiler','traspaso')),
  tipo             TEXT NOT NULL CHECK (tipo IN
                     ('departamento','casa','terreno','oficina','local','almacen','cochera')),

  titulo           TEXT NOT NULL CHECK (length(titulo) BETWEEN 10 AND 140),
  descripcion      TEXT CHECK (length(descripcion) <= 5000),

  -- Ubicación
  ubicacion_id     UUID NOT NULL REFERENCES ubicaciones(id) ON DELETE RESTRICT,
  direccion        TEXT,                        -- interna, no se muestra completa
  referencia       TEXT,                        -- "a media cuadra del parque"
  lat              DOUBLE PRECISION CHECK (lat BETWEEN -90 AND 90),
  lng              DOUBLE PRECISION CHECK (lng BETWEEN -180 AND 180),
  ocultar_mapa     BOOLEAN NOT NULL DEFAULT false,

  -- Metraje y distribución
  area_m2          NUMERIC(10,2) CHECK (area_m2 > 0 AND area_m2 < 1000000),
  area_techada_m2  NUMERIC(10,2) CHECK (area_techada_m2 > 0),
  dormitorios      SMALLINT CHECK (dormitorios BETWEEN 0 AND 30),
  banos            SMALLINT CHECK (banos BETWEEN 0 AND 30),
  medio_bano       SMALLINT CHECK (medio_bano BETWEEN 0 AND 10),
  cocheras         SMALLINT CHECK (cocheras BETWEEN 0 AND 30),
  piso             SMALLINT CHECK (piso BETWEEN -5 AND 120),
  pisos_edificio   SMALLINT,
  antiguedad       SMALLINT CHECK (antiguedad BETWEEN 0 AND 200),
  estado_inmueble  TEXT CHECK (estado_inmueble IN
                     ('estreno','buen-estado','a-refaccionar','en-construccion','en-planos')),
  amoblado         TEXT CHECK (amoblado IN ('si','no','semi')),

  -- Precio.  NUMERIC, jamás float: con DOUBLE PRECISION los montos
  -- acumulan error de redondeo y los cobros no cuadran.
  precio           NUMERIC(14,2) CHECK (precio > 0),
  moneda           TEXT NOT NULL DEFAULT 'USD' CHECK (moneda IN ('USD','PEN')),
  -- Normalizado a USD por trigger. Permite buscar por rango de precio
  -- mezclando avisos en soles y en dólares — imposible sin esta columna.
  precio_ref_usd   NUMERIC(14,2),
  mantenimiento    NUMERIC(10,2) CHECK (mantenimiento >= 0),
  moneda_mant      TEXT NOT NULL DEFAULT 'PEN' CHECK (moneda_mant IN ('USD','PEN')),
  precio_negociable BOOLEAN NOT NULL DEFAULT false,

  -- Características desnormalizadas desde propiedad_caracteristicas
  -- (mantenidas por trigger). Filtrar por array con GIN es mucho más
  -- rápido que hacer JOIN + HAVING contra la tabla puente.
  caracteristicas  TEXT[] NOT NULL DEFAULT '{}',

  estado           TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN
                     ('borrador','revision','activo','pausado','vencido','cerrado','rechazado','archivado')),
  motivo_rechazo   TEXT,
  moderado_por     UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  moderado_en      TIMESTAMPTZ,
  riesgo           SMALLINT NOT NULL DEFAULT 0 CHECK (riesgo BETWEEN 0 AND 100),

  destacado_hasta  TIMESTAMPTZ,
  vistas           INTEGER NOT NULL DEFAULT 0,   -- contador rápido; el detalle va en vistas_propiedad

  publicado_en     TIMESTAMPTZ,
  renovado_en      TIMESTAMPTZ,
  vence_en         DATE,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  eliminado_en     TIMESTAMPTZ,

  -- Búsqueda de texto sin tildes (usa el envoltorio inmutable de arriba)
  busqueda_tsv     tsvector GENERATED ALWAYS AS (
                     to_tsvector('spanish',
                       sin_tildes(coalesce(titulo,'') || ' ' || coalesce(descripcion,'')))
                   ) STORED,

  -- Nota: no se valida area_techada <= area_m2. Una casa de 3 pisos sobre
  -- 100 m² de terreno tiene 250 m² techados y sería rechazada. Esa
  -- comprobación va en la app como advertencia, no como error duro.
  CONSTRAINT ck_publicado    CHECK (estado <> 'activo' OR publicado_en IS NOT NULL),
  CONSTRAINT ck_precio_activo CHECK (estado <> 'activo' OR precio IS NOT NULL)
);
CREATE TRIGGER t_propiedades_upd BEFORE UPDATE ON propiedades
  FOR EACH ROW EXECUTE FUNCTION tocar_actualizado_en();

-- Historial de slugs: si cambia el título cambia el slug, y sin esto
-- se rompen los enlaces ya indexados en Google.
CREATE TABLE slugs_historicos (
  slug          TEXT PRIMARY KEY,
  propiedad_id  UUID NOT NULL REFERENCES propiedades(id) ON DELETE CASCADE,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Media: fotos, planos, videos y tours. Generalizado desde la tabla 'fotos'.
CREATE TABLE medios (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  propiedad_id   UUID NOT NULL REFERENCES propiedades(id) ON DELETE CASCADE,
  tipo           TEXT NOT NULL DEFAULT 'foto' CHECK (tipo IN ('foto','plano','video','tour360')),
  proveedor      TEXT NOT NULL DEFAULT 'cloudinary',
  public_id      TEXT NOT NULL,                -- id en Cloudinary
  url            TEXT NOT NULL,
  ancho          INTEGER,
  alto           INTEGER,
  bytes          INTEGER,
  phash          TEXT,                         -- hash perceptual: detecta fotos robadas
  ambiente       TEXT,                         -- 'sala','cocina','dormitorio'
  texto_alt      TEXT,
  orden          SMALLINT NOT NULL DEFAULT 0,
  es_portada     BOOLEAN NOT NULL DEFAULT false,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (proveedor, public_id)
);
CREATE INDEX ix_medios_prop ON medios (propiedad_id, orden);
-- Una sola portada por aviso, garantizado por la base
CREATE UNIQUE INDEX ux_medios_portada ON medios (propiedad_id) WHERE es_portada;
CREATE INDEX ix_medios_phash ON medios (phash) WHERE phash IS NOT NULL;

-- Tabla puente: la verdad sobre qué características tiene cada aviso
CREATE TABLE propiedad_caracteristicas (
  propiedad_id      UUID NOT NULL REFERENCES propiedades(id) ON DELETE CASCADE,
  caracteristica_id UUID NOT NULL REFERENCES caracteristicas(id) ON DELETE CASCADE,
  PRIMARY KEY (propiedad_id, caracteristica_id)
);

-- Mantiene sincronizada la columna desnormalizada propiedades.caracteristicas
CREATE OR REPLACE FUNCTION sincronizar_caracteristicas()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pid UUID := COALESCE(NEW.propiedad_id, OLD.propiedad_id);
BEGIN
  UPDATE propiedades SET caracteristicas = COALESCE((
    SELECT array_agg(c.slug ORDER BY c.slug)
    FROM propiedad_caracteristicas pc
    JOIN caracteristicas c ON c.id = pc.caracteristica_id
    WHERE pc.propiedad_id = pid), '{}')
  WHERE id = pid;
  RETURN NULL;
END $$;
CREATE TRIGGER t_sync_caract
  AFTER INSERT OR DELETE ON propiedad_caracteristicas
  FOR EACH ROW EXECUTE FUNCTION sincronizar_caracteristicas();

-- Normaliza el precio a USD para poder ordenar y filtrar entre monedas
CREATE OR REPLACE FUNCTION normalizar_precio()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tc NUMERIC(8,4);
BEGIN
  IF NEW.precio IS NULL THEN NEW.precio_ref_usd := NULL; RETURN NEW; END IF;
  IF NEW.moneda = 'USD' THEN
    NEW.precio_ref_usd := NEW.precio;
  ELSE
    SELECT usd_a_pen INTO tc FROM tipo_cambio ORDER BY fecha DESC LIMIT 1;
    NEW.precio_ref_usd := ROUND(NEW.precio / COALESCE(tc, 3.75), 2);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER t_precio_ref BEFORE INSERT OR UPDATE OF precio, moneda ON propiedades
  FOR EACH ROW EXECUTE FUNCTION normalizar_precio();

-- Proyectos de inmobiliaria: un proyecto no es una unidad, tiene tipologías
CREATE TABLE proyectos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agencia_id     UUID NOT NULL REFERENCES agencias(id) ON DELETE CASCADE,
  nombre         TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,
  descripcion    TEXT,
  ubicacion_id   UUID NOT NULL REFERENCES ubicaciones(id) ON DELETE RESTRICT,
  direccion      TEXT,
  lat            DOUBLE PRECISION,
  lng            DOUBLE PRECISION,
  entrega        DATE,
  avance_obra    SMALLINT CHECK (avance_obra BETWEEN 0 AND 100),
  estado         TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN
                   ('borrador','revision','activo','pausado','entregado','archivado')),
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tipologias (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id          UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  nombre               TEXT NOT NULL,            -- '2 dorm · Flat B'
  dormitorios          SMALLINT,
  banos                SMALLINT,
  area_m2              NUMERIC(10,2),
  area_techada_m2      NUMERIC(10,2),
  precio_desde         NUMERIC(14,2) CHECK (precio_desde > 0),
  moneda               TEXT NOT NULL DEFAULT 'USD' CHECK (moneda IN ('USD','PEN')),
  unidades_totales     SMALLINT,
  unidades_disponibles SMALLINT,
  plano_url            TEXT,
  CHECK (unidades_disponibles IS NULL OR unidades_totales IS NULL
         OR unidades_disponibles <= unidades_totales)
);

ALTER TABLE propiedades
  ADD CONSTRAINT fk_prop_proyecto
  FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE SET NULL;


-- =====================================================================
-- 4. DEMANDA: favoritos, búsquedas guardadas, leads
-- =====================================================================

CREATE TABLE favoritos (
  usuario_id   UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  propiedad_id UUID NOT NULL REFERENCES propiedades(id) ON DELETE CASCADE,
  nota         TEXT,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, propiedad_id)
);
CREATE INDEX ix_favoritos_prop ON favoritos (propiedad_id);

CREATE TABLE busquedas_guardadas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL,
  filtros       JSONB NOT NULL,
  frecuencia    TEXT NOT NULL DEFAULT 'diaria' CHECK (frecuencia IN ('nunca','diaria','semanal')),
  ultimo_envio  TIMESTAMPTZ,
  ultimo_visto  TIMESTAMPTZ,      -- para contar "12 avisos nuevos desde tu última visita"
  activa        BOOLEAN NOT NULL DEFAULT true,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_busq_alertas ON busquedas_guardadas (frecuencia, ultimo_envio)
  WHERE activa AND frecuencia <> 'nunca';

CREATE TABLE leads (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  propiedad_id   UUID NOT NULL REFERENCES propiedades(id) ON DELETE CASCADE,
  -- A quién le llega. Se copia al crear: si el aviso cambia de dueño,
  -- el lead sigue perteneciendo a quien lo recibió.
  destinatario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  de_usuario_id  UUID REFERENCES usuarios(id) ON DELETE SET NULL,  -- null si no tenía cuenta

  nombre         TEXT NOT NULL,
  telefono       TEXT,
  email          TEXT,
  mensaje        TEXT,
  canal          TEXT NOT NULL DEFAULT 'web' CHECK (canal IN ('web','whatsapp','telefono','email')),

  estado         TEXT NOT NULL DEFAULT 'nuevo' CHECK (estado IN
                   ('nuevo','visto','contactado','visita','negociando','cerrado','descartado','spam')),
  puntaje        SMALLINT CHECK (puntaje BETWEEN 0 AND 100),
  nota_interna   TEXT,
  respondido_en  TIMESTAMPTZ,
  ip             INET,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_leads_prop    ON leads (propiedad_id);
CREATE INDEX ix_leads_bandeja ON leads (destinatario_id, estado, creado_en DESC);
CREATE TRIGGER t_leads_upd BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION tocar_actualizado_en();

-- Conversación sobre un lead (hoy el contacto es de un solo disparo)
CREATE TABLE mensajes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  de_usuario_id  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  cuerpo         TEXT NOT NULL,
  leido_en       TIMESTAMPTZ,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_mensajes_lead ON mensajes (lead_id, creado_en);


-- =====================================================================
-- 5. MONETIZACIÓN: planes, suscripciones, pagos, comprobantes
-- =====================================================================

CREATE TABLE planes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                 TEXT NOT NULL UNIQUE,     -- 'gratis','agente','inmobiliaria'
  nombre               TEXT NOT NULL,
  descripcion          TEXT,
  precio               NUMERIC(10,2) NOT NULL CHECK (precio >= 0),
  moneda               TEXT NOT NULL DEFAULT 'PEN' CHECK (moneda IN ('PEN','USD')),
  periodo              TEXT NOT NULL CHECK (periodo IN ('mensual','anual','unico','gratis')),
  dias_vigencia        INTEGER,                  -- para periodo='unico'

  -- Límites. Null = sin tope.
  tope_avisos          INTEGER,
  tope_fotos           SMALLINT NOT NULL DEFAULT 8,
  tope_asientos        SMALLINT NOT NULL DEFAULT 1,
  destacados_mes       SMALLINT NOT NULL DEFAULT 0,
  cuota_indice_mes     INTEGER,                  -- null = ilimitado
  dias_vigencia_aviso  SMALLINT NOT NULL DEFAULT 90,
  prioridad_orden      SMALLINT NOT NULL DEFAULT 0,

  para_rol             TEXT[] NOT NULL DEFAULT '{}',
  beneficios           JSONB NOT NULL DEFAULT '[]',
  visible              BOOLEAN NOT NULL DEFAULT true,
  activo               BOOLEAN NOT NULL DEFAULT true,
  orden                SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE suscripciones (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id            UUID REFERENCES usuarios(id) ON DELETE CASCADE,
  agencia_id            UUID REFERENCES agencias(id) ON DELETE CASCADE,
  plan_id               UUID NOT NULL REFERENCES planes(id) ON DELETE RESTRICT,

  estado                TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN
                          ('prueba','activa','morosa','cancelada','vencida')),
  inicio                TIMESTAMPTZ NOT NULL DEFAULT now(),
  fin                   TIMESTAMPTZ NOT NULL,
  gracia_hasta          TIMESTAMPTZ,             -- 7 días tras pago fallido
  renovacion_automatica BOOLEAN NOT NULL DEFAULT true,
  cancelada_en          TIMESTAMPTZ,
  motivo_cancelacion    TEXT,

  proveedor             TEXT,                    -- 'culqi'
  proveedor_ref         TEXT,                    -- id de suscripción/tarjeta
  creado_en             TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ck_titular CHECK (num_nonnulls(usuario_id, agencia_id) = 1),
  CONSTRAINT ck_fechas  CHECK (fin > inicio)
);
-- Una sola suscripción vigente por titular
CREATE UNIQUE INDEX ux_susc_usuario_activa ON suscripciones (usuario_id)
  WHERE estado IN ('activa','prueba','morosa') AND usuario_id IS NOT NULL;
CREATE UNIQUE INDEX ux_susc_agencia_activa ON suscripciones (agencia_id)
  WHERE estado IN ('activa','prueba','morosa') AND agencia_id IS NOT NULL;
CREATE INDEX ix_susc_vencer ON suscripciones (fin) WHERE estado = 'activa';
CREATE TRIGGER t_susc_upd BEFORE UPDATE ON suscripciones
  FOR EACH ROW EXECUTE FUNCTION tocar_actualizado_en();

CREATE TABLE pagos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id       UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  agencia_id       UUID REFERENCES agencias(id) ON DELETE SET NULL,
  suscripcion_id   UUID REFERENCES suscripciones(id) ON DELETE SET NULL,

  concepto         TEXT NOT NULL CHECK (concepto IN
                     ('plan','renovacion','destacado','avisos-extra','certificacion')),
  detalle          TEXT,
  monto            NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
  moneda           TEXT NOT NULL DEFAULT 'PEN' CHECK (moneda IN ('PEN','USD')),
  igv              NUMERIC(12,2) NOT NULL DEFAULT 0,   -- 18% en Perú

  estado           TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN
                     ('pendiente','pagado','fallido','reembolsado','contracargo')),
  proveedor        TEXT NOT NULL DEFAULT 'culqi',
  proveedor_ref    TEXT,                          -- id del cargo en Culqi
  metodo           TEXT,                          -- 'tarjeta','yape','transferencia'
  ultimos4         TEXT,
  respuesta        JSONB,                         -- payload crudo del proveedor
  clave_idempotencia TEXT,
  error_mensaje    TEXT,
  pagado_en        TIMESTAMPTZ,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Los webhooks de Culqi llegan repetidos: esto los vuelve idempotentes
CREATE UNIQUE INDEX ux_pagos_proveedor ON pagos (proveedor, proveedor_ref)
  WHERE proveedor_ref IS NOT NULL;
CREATE UNIQUE INDEX ux_pagos_idem ON pagos (clave_idempotencia)
  WHERE clave_idempotencia IS NOT NULL;
CREATE INDEX ix_pagos_usuario ON pagos (usuario_id, creado_en DESC);
CREATE INDEX ix_pagos_pendientes ON pagos (creado_en) WHERE estado = 'pendiente';

-- Boleta / factura electrónica (obligatorio en Perú, vía Nubefact u otro OSE)
CREATE TABLE comprobantes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pago_id         UUID NOT NULL UNIQUE REFERENCES pagos(id) ON DELETE RESTRICT,
  tipo            TEXT NOT NULL CHECK (tipo IN ('boleta','factura','nota-credito')),
  serie           TEXT NOT NULL,
  numero          INTEGER NOT NULL,
  ruc_receptor    TEXT,
  dni_receptor    TEXT,
  razon_social    TEXT,
  direccion       TEXT,
  subtotal        NUMERIC(12,2) NOT NULL,
  igv             NUMERIC(12,2) NOT NULL,
  total           NUMERIC(12,2) NOT NULL,
  estado_sunat    TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado_sunat IN
                    ('pendiente','aceptado','rechazado','anulado')),
  hash_sunat      TEXT,
  pdf_url         TEXT,
  xml_url         TEXT,
  emitido_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tipo, serie, numero)
);

CREATE TABLE destaques (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  propiedad_id UUID NOT NULL REFERENCES propiedades(id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL CHECK (tipo IN ('destacado','super','portada')),
  inicio       TIMESTAMPTZ NOT NULL DEFAULT now(),
  fin          TIMESTAMPTZ NOT NULL,
  pago_id      UUID REFERENCES pagos(id) ON DELETE SET NULL,
  origen       TEXT NOT NULL DEFAULT 'compra' CHECK (origen IN ('compra','plan','cortesia')),
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fin > inicio),
  -- Impide vender dos veces el mismo destaque solapado
  EXCLUDE USING gist (propiedad_id WITH =, tipo WITH =, tstzrange(inicio, fin) WITH &&)
);
-- Sin predicado WHERE fin > now(): los índices parciales exigen predicados
-- IMMUTABLE y now() es STABLE. Postgres rechaza el CREATE INDEX.
CREATE INDEX ix_destaques_vigentes ON destaques (fin);

-- Cuota del índice de precios (ya existía)
CREATE TABLE consultas_indice (
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  periodo    TEXT NOT NULL,            -- '2026-08'
  conteo     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (usuario_id, periodo)
);

CREATE TABLE indice_precios (
  id              BIGSERIAL PRIMARY KEY,
  ubicacion_id    UUID NOT NULL REFERENCES ubicaciones(id) ON DELETE CASCADE,
  periodo         TEXT NOT NULL,        -- '2026-08'
  precio_m2_usd   NUMERIC(10,2) NOT NULL CHECK (precio_m2_usd > 0),
  alquiler_2d_pen NUMERIC(10,2),
  var_12m         NUMERIC(6,2),
  muestras        INTEGER NOT NULL DEFAULT 0,
  publicado       BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (ubicacion_id, periodo)
);
CREATE INDEX ix_indice_periodo ON indice_precios (periodo) WHERE publicado;


-- =====================================================================
-- 6. MODERACIÓN, AUDITORÍA Y OPERACIÓN
-- =====================================================================

-- Reportes de usuarios ("ya se vendió", "es una estafa")
CREATE TABLE reportes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  propiedad_id  UUID NOT NULL REFERENCES propiedades(id) ON DELETE CASCADE,
  reportado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  motivo        TEXT NOT NULL CHECK (motivo IN
                  ('vendida','alquilada','precio-falso','duplicada','estafa',
                   'fotos-ajenas','datos-falsos','discriminacion','otro')),
  detalle       TEXT,
  estado        TEXT NOT NULL DEFAULT 'nuevo' CHECK (estado IN
                  ('nuevo','revisando','resuelto','descartado')),
  resuelto_por  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  resuelto_en   TIMESTAMPTZ,
  nota_interna  TEXT,
  ip            INET,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_reportes_cola ON reportes (estado, creado_en) WHERE estado IN ('nuevo','revisando');
CREATE INDEX ix_reportes_prop ON reportes (propiedad_id);

-- Marcas automáticas del sistema. Distinto de 'reportes': esto lo genera
-- el motor de reglas, no una persona.
CREATE TABLE marcas_moderacion (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  propiedad_id UUID NOT NULL REFERENCES propiedades(id) ON DELETE CASCADE,
  regla        TEXT NOT NULL,           -- 'precio-fuera-de-indice','telefono-en-descripcion'
  severidad    SMALLINT NOT NULL CHECK (severidad BETWEEN 1 AND 5),
  detalle      JSONB,
  resuelta     BOOLEAN NOT NULL DEFAULT false,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (propiedad_id, regla)
);
CREATE INDEX ix_marcas_abiertas ON marcas_moderacion (severidad DESC, creado_en)
  WHERE NOT resuelta;

-- Bitácora de acciones sensibles. Append-only.
CREATE TABLE auditoria (
  id         BIGSERIAL PRIMARY KEY,
  actor_id   UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  actor_rol  TEXT,                      -- copiado: el rol puede cambiar después
  accion     TEXT NOT NULL,             -- 'aviso.aprobado','usuario.suspendido','pago.reembolsado'
  entidad    TEXT NOT NULL,
  entidad_id UUID,
  antes      JSONB,
  despues    JSONB,
  motivo     TEXT,
  ip         INET,
  user_agent TEXT,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_entidad ON auditoria (entidad, entidad_id, creado_en DESC);
CREATE INDEX ix_audit_actor   ON auditoria (actor_id, creado_en DESC);

CREATE TABLE notificaciones (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo       TEXT NOT NULL,
  titulo     TEXT NOT NULL,
  cuerpo     TEXT,
  enlace     TEXT,
  canal      TEXT NOT NULL DEFAULT 'app' CHECK (canal IN ('app','email','whatsapp','push')),
  enviada_en TIMESTAMPTZ,
  leida_en   TIMESTAMPTZ,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_notif_pendientes ON notificaciones (usuario_id, creado_en DESC)
  WHERE leida_en IS NULL;

-- Métricas diarias agregadas. Una fila por aviso por día, NO una por visita:
-- 10.000 avisos × 365 días = 3,6 M filas al año, perfectamente manejable.
CREATE TABLE vistas_propiedad (
  propiedad_id UUID NOT NULL REFERENCES propiedades(id) ON DELETE CASCADE,
  dia          DATE NOT NULL,
  vistas       INTEGER NOT NULL DEFAULT 0,
  vistas_unicas INTEGER NOT NULL DEFAULT 0,
  contactos    INTEGER NOT NULL DEFAULT 0,
  favoritos    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (propiedad_id, dia)
);
CREATE INDEX ix_vistas_dia ON vistas_propiedad (dia);


-- =====================================================================
-- 7. ÍNDICES DE BÚSQUEDA
-- Los parciales (WHERE estado='activo') son los que más rinden: el 95%
-- de las consultas solo tocan avisos activos, y el índice queda chico.
-- =====================================================================

CREATE INDEX ix_busq_principal ON propiedades
  (operacion, tipo, ubicacion_id, precio_ref_usd)
  WHERE estado = 'activo' AND eliminado_en IS NULL;

CREATE INDEX ix_busq_recientes ON propiedades (publicado_en DESC)
  WHERE estado = 'activo' AND eliminado_en IS NULL;

CREATE INDEX ix_busq_precio ON propiedades (precio_ref_usd)
  WHERE estado = 'activo' AND eliminado_en IS NULL;

CREATE INDEX ix_busq_dormitorios ON propiedades (ubicacion_id, dormitorios, precio_ref_usd)
  WHERE estado = 'activo' AND eliminado_en IS NULL;

CREATE INDEX ix_busq_caract ON propiedades USING GIN (caracteristicas)
  WHERE estado = 'activo';

CREATE INDEX ix_busq_texto ON propiedades USING GIN (busqueda_tsv);

-- Idem: el predicado no puede llevar now(). Se filtra por IS NOT NULL y la
-- comparación con now() la hace la consulta, no el índice.
CREATE INDEX ix_busq_destacados ON propiedades (destacado_hasta DESC)
  WHERE estado = 'activo' AND destacado_hasta IS NOT NULL;

CREATE INDEX ix_prop_usuario ON propiedades (usuario_id, estado, actualizado_en DESC)
  WHERE eliminado_en IS NULL;

CREATE INDEX ix_prop_agencia ON propiedades (agencia_id, estado)
  WHERE agencia_id IS NOT NULL AND eliminado_en IS NULL;

-- Cola de moderación, ordenada por riesgo
CREATE INDEX ix_prop_moderacion ON propiedades (riesgo DESC, creado_en)
  WHERE estado = 'revision';

-- Cron de vencimientos
CREATE INDEX ix_prop_vencer ON propiedades (vence_en)
  WHERE estado = 'activo';

-- Autocompletado de distritos tolerante a typos y sin tildes
CREATE INDEX ix_ubic_trgm ON ubicaciones USING GIN (distrito gin_trgm_ops);
CREATE INDEX ix_ubic_alias ON ubicaciones USING GIN (alias);

-- Geo (sin PostGIS todavía; con PostGIS pasar a GIST sobre geography)
CREATE INDEX ix_prop_geo ON propiedades (lat, lng)
  WHERE estado = 'activo' AND lat IS NOT NULL;
` },
  { nombre: "002_planes_y_zonas.sql", sql: `-- =====================================================================
-- 002 · Cambios que salen del análisis competitivo (COMPETENCIA.md)
-- =====================================================================

-- El teléfono visible pasa de castigo a beneficio de pago.
-- Urbania lo bloquea para capturar el lead y es una de las cosas que
-- más resienten los corredores. Acá: oculto en gratis, visible en pago.
ALTER TABLE planes
  ADD COLUMN IF NOT EXISTS telefono_visible BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS creditos_mes     SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contacto_ventas  BOOLEAN NOT NULL DEFAULT false;

-- Un nivel más de ubicación: la zona o urbanización dentro del distrito.
-- Urbania no subdivide por barrio y en distritos con miles de avisos
-- resulta inusable. Es una de las quejas más repetidas.
ALTER TABLE ubicaciones
  ADD COLUMN IF NOT EXISTS zona          TEXT,
  ADD COLUMN IF NOT EXISTS padre_id      UUID REFERENCES ubicaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ix_ubic_padre ON ubicaciones (padre_id) WHERE padre_id IS NOT NULL;

-- Las zonas comparten distrito con su padre, así que la unicidad
-- (departamento, provincia, distrito) ya no puede ser global.
ALTER TABLE ubicaciones DROP CONSTRAINT IF EXISTS ubicaciones_departamento_provincia_distrito_key;
CREATE UNIQUE INDEX IF NOT EXISTS ux_ubic_distrito
  ON ubicaciones (departamento, provincia, distrito)
  WHERE padre_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_ubic_zona
  ON ubicaciones (padre_id, zona)
  WHERE padre_id IS NOT NULL;
` },
  { nombre: "003_avisos.sql", sql: `-- =====================================================================
-- 003 · Flujo del aviso (FLUJO-AVISOS.md §6)
-- =====================================================================

-- Códigos públicos correlativos: WSP-10001, WSP-10002...
CREATE SEQUENCE IF NOT EXISTS seq_codigo_aviso START 10001;

ALTER TABLE propiedades
  ADD COLUMN IF NOT EXISTS origen         TEXT NOT NULL DEFAULT 'wizard',
  ADD COLUMN IF NOT EXISTS duplicado_de   UUID REFERENCES propiedades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_aprobado  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS completitud    SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cerrado_motivo TEXT,
  ADD COLUMN IF NOT EXISTS precio_final   NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS moneda_final   TEXT,
  ADD COLUMN IF NOT EXISTS cerrado_en     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aviso_vencimiento_en TIMESTAMPTZ;

DO $mig$
BEGIN
  BEGIN
    ALTER TABLE propiedades ADD CONSTRAINT ck_origen
      CHECK (origen IN ('wizard','rapido','duplicado','importado','whatsapp'));
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    ALTER TABLE propiedades ADD CONSTRAINT ck_cerrado_motivo
      CHECK (cerrado_motivo IS NULL OR
             cerrado_motivo IN ('vendida','alquilada','desistio','otro'));
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    ALTER TABLE propiedades ADD CONSTRAINT ck_moneda_final
      CHECK (moneda_final IS NULL OR moneda_final IN ('USD','PEN'));
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    ALTER TABLE propiedades ADD CONSTRAINT ck_precio_final
      CHECK (precio_final IS NULL OR precio_final > 0);
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    ALTER TABLE propiedades ADD CONSTRAINT ck_completitud
      CHECK (completitud BETWEEN 0 AND 100);
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END
$mig$;

-- Contadores de confianza para la auto-aprobación (M8)
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS avisos_aprobados  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avisos_rechazados INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_rechazo_en TIMESTAMPTZ;

-- Renovación en un clic desde el correo, sin login
ALTER TABLE tokens_cuenta
  ADD COLUMN IF NOT EXISTS propiedad_id UUID REFERENCES propiedades(id) ON DELETE CASCADE;

ALTER TABLE tokens_cuenta DROP CONSTRAINT IF EXISTS tokens_cuenta_tipo_check;
ALTER TABLE tokens_cuenta ADD CONSTRAINT tokens_cuenta_tipo_check
  CHECK (tipo IN ('verificar_email','recuperar_password','invitacion','renovar_aviso'));

-- Crones
CREATE INDEX IF NOT EXISTS ix_prop_borradores ON propiedades (actualizado_en)
  WHERE estado = 'borrador';
CREATE INDEX IF NOT EXISTS ix_prop_preaviso ON propiedades (vence_en)
  WHERE estado = 'activo' AND aviso_vencimiento_en IS NULL;
` },
  { nombre: "004_datos_semilla.sql", sql: `-- =====================================================================
-- 004 · Datos iniciales
--
-- GENERADO por scripts/generar-semilla.js — no editar a mano.
--
-- Va como migración porque en un deploy manual nadie corre scripts: sin
-- ubicaciones el autocompletado queda vacío y no se puede publicar nada.
-- Todo con ON CONFLICT DO NOTHING, así que es seguro repetirlo.
-- =====================================================================

INSERT INTO ubicaciones (departamento, provincia, distrito, slug, alias, lat, lng, destacado) VALUES
  ('Lima','Lima','Ancón','ancon','{}',-11.775,-77.176,false),
  ('Lima','Lima','Ate','ate',ARRAY['Ate Vitarte','Vitarte'],-12.026,-76.918,false),
  ('Lima','Lima','Barranco','barranco','{}',-12.146,-77.021,true),
  ('Lima','Lima','Breña','brena',ARRAY['Brena'],-12.058,-77.05,false),
  ('Lima','Lima','Carabayllo','carabayllo','{}',-11.897,-77.036,false),
  ('Lima','Lima','Chaclacayo','chaclacayo','{}',-11.985,-76.767,false),
  ('Lima','Lima','Chorrillos','chorrillos','{}',-12.176,-77.016,true),
  ('Lima','Lima','Cieneguilla','cieneguilla','{}',-12.093,-76.809,false),
  ('Lima','Lima','Comas','comas','{}',-11.945,-77.048,false),
  ('Lima','Lima','El Agustino','el-agustino','{}',-12.041,-76.996,false),
  ('Lima','Lima','Independencia','independencia','{}',-11.99,-77.055,false),
  ('Lima','Lima','Jesús María','jesus-maria',ARRAY['Jesus Maria'],-12.075,-77.049,true),
  ('Lima','Lima','La Molina','la-molina','{}',-12.079,-76.943,true),
  ('Lima','Lima','La Victoria','la-victoria','{}',-12.068,-77.017,false),
  ('Lima','Lima','Lima','lima-cercado',ARRAY['Cercado de Lima','Centro de Lima','Cercado'],-12.046,-77.031,false),
  ('Lima','Lima','Lince','lince','{}',-12.084,-77.036,true),
  ('Lima','Lima','Los Olivos','los-olivos','{}',-11.958,-77.07,true),
  ('Lima','Lima','Lurigancho','lurigancho',ARRAY['Chosica','Lurigancho-Chosica'],-11.939,-76.702,false),
  ('Lima','Lima','Lurín','lurin',ARRAY['Lurin'],-12.274,-76.874,false),
  ('Lima','Lima','Magdalena del Mar','magdalena-del-mar',ARRAY['Magdalena'],-12.092,-77.07,true),
  ('Lima','Lima','Miraflores','miraflores','{}',-12.121,-77.03,true),
  ('Lima','Lima','Pachacámac','pachacamac',ARRAY['Pachacamac'],-12.229,-76.86,false),
  ('Lima','Lima','Pucusana','pucusana','{}',-12.481,-76.795,false),
  ('Lima','Lima','Pueblo Libre','pueblo-libre',ARRAY['Magdalena Vieja'],-12.074,-77.063,true),
  ('Lima','Lima','Puente Piedra','puente-piedra','{}',-11.865,-77.076,false),
  ('Lima','Lima','Punta Hermosa','punta-hermosa','{}',-12.336,-76.825,false),
  ('Lima','Lima','Punta Negra','punta-negra','{}',-12.365,-76.797,false),
  ('Lima','Lima','Rímac','rimac',ARRAY['Rimac'],-12.028,-77.029,false),
  ('Lima','Lima','San Bartolo','san-bartolo','{}',-12.389,-76.779,false),
  ('Lima','Lima','San Borja','san-borja','{}',-12.108,-76.999,true),
  ('Lima','Lima','San Isidro','san-isidro','{}',-12.097,-77.036,true),
  ('Lima','Lima','San Juan de Lurigancho','san-juan-de-lurigancho',ARRAY['SJL'],-11.977,-77.008,false),
  ('Lima','Lima','San Juan de Miraflores','san-juan-de-miraflores',ARRAY['SJM'],-12.159,-76.971,false),
  ('Lima','Lima','San Luis','san-luis','{}',-12.075,-76.996,false),
  ('Lima','Lima','San Martín de Porres','san-martin-de-porres',ARRAY['SMP','San Martin de Porres'],-12.021,-77.086,false),
  ('Lima','Lima','San Miguel','san-miguel','{}',-12.077,-77.093,true),
  ('Lima','Lima','Santa Anita','santa-anita','{}',-12.045,-76.966,false),
  ('Lima','Lima','Santa María del Mar','santa-maria-del-mar',ARRAY['Santa Maria'],-12.409,-76.771,false),
  ('Lima','Lima','Santa Rosa','santa-rosa','{}',-11.798,-77.169,false),
  ('Lima','Lima','Santiago de Surco','santiago-de-surco',ARRAY['Surco'],-12.145,-76.997,true),
  ('Lima','Lima','Surquillo','surquillo','{}',-12.112,-77.014,true),
  ('Lima','Lima','Villa El Salvador','villa-el-salvador',ARRAY['VES'],-12.213,-76.937,false),
  ('Lima','Lima','Villa María del Triunfo','villa-maria-del-triunfo',ARRAY['VMT','Villa Maria del Triunfo'],-12.163,-76.939,false),
  ('Callao','Callao','Callao','callao',ARRAY['Callao Cercado'],-12.056,-77.118,true),
  ('Callao','Callao','Bellavista','bellavista','{}',-12.061,-77.104,false),
  ('Callao','Callao','Carmen de la Legua Reynoso','carmen-de-la-legua',ARRAY['Carmen de la Legua'],-12.043,-77.093,false),
  ('Callao','Callao','La Perla','la-perla','{}',-12.07,-77.115,false),
  ('Callao','Callao','La Punta','la-punta','{}',-12.07,-77.164,false),
  ('Callao','Callao','Mi Perú','mi-peru',ARRAY['Mi Peru'],-11.859,-77.128,false),
  ('Callao','Callao','Ventanilla','ventanilla','{}',-11.874,-77.126,false),
  ('Arequipa','Arequipa','Arequipa','arequipa',ARRAY['Arequipa Cercado'],-16.409,-71.537,true),
  ('Arequipa','Arequipa','Cayma','cayma','{}',-16.376,-71.552,false),
  ('Arequipa','Arequipa','Yanahuara','yanahuara','{}',-16.391,-71.548,false),
  ('Arequipa','Arequipa','José Luis Bustamante y Rivero','jose-luis-bustamante-y-rivero',ARRAY['JLByR'],-16.427,-71.523,false),
  ('Arequipa','Arequipa','Cerro Colorado','cerro-colorado','{}',-16.373,-71.583,false),
  ('La Libertad','Trujillo','Trujillo','trujillo','{}',-8.112,-79.029,true),
  ('La Libertad','Trujillo','Víctor Larco Herrera','victor-larco-herrera',ARRAY['Victor Larco'],-8.138,-79.043,false),
  ('Lambayeque','Chiclayo','Chiclayo','chiclayo','{}',-6.772,-79.841,true),
  ('Piura','Piura','Piura','piura','{}',-5.194,-80.632,true),
  ('Piura','Piura','Castilla','castilla','{}',-5.199,-80.617,false),
  ('Cusco','Cusco','Cusco','cusco',ARRAY['Cuzco'],-13.532,-71.967,true),
  ('Cusco','Cusco','Wanchaq','wanchaq','{}',-13.527,-71.955,false),
  ('Cusco','Cusco','San Sebastián','san-sebastian',ARRAY['San Sebastian'],-13.539,-71.918,false),
  ('Junín','Huancayo','Huancayo','huancayo','{}',-12.068,-75.21,true),
  ('Junín','Huancayo','El Tambo','el-tambo','{}',-12.049,-75.216,false),
  ('Áncash','Huaraz','Huaraz','huaraz',ARRAY['Ancash'],-9.529,-77.529,false),
  ('Áncash','Santa','Chimbote','chimbote','{}',-9.075,-78.594,false),
  ('Ica','Ica','Ica','ica','{}',-14.068,-75.729,false),
  ('Tacna','Tacna','Tacna','tacna','{}',-18.014,-70.253,false),
  ('Loreto','Maynas','Iquitos','iquitos','{}',-3.749,-73.253,false),
  ('San Martín','San Martín','Tarapoto','tarapoto',ARRAY['San Martin'],-6.488,-76.365,false),
  ('Cajamarca','Cajamarca','Cajamarca','cajamarca','{}',-7.163,-78.5,false),
  ('Puno','Puno','Puno','puno','{}',-15.84,-70.022,false),
  ('Puno','San Román','Juliaca','juliaca',ARRAY['San Roman'],-15.5,-70.133,false)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO caracteristicas (slug, nombre, grupo, orden) VALUES
  ('ascensor','Ascensor','edificio',0),
  ('cochera','Cochera','edificio',1),
  ('piscina','Piscina','exterior',2),
  ('gimnasio','Gimnasio','edificio',3),
  ('acepta-mascotas','Acepta mascotas','servicios',4),
  ('amoblado','Amoblado','interior',5),
  ('seguridad-24h','Seguridad 24h','seguridad',6),
  ('areas-comunes','Áreas comunes','edificio',7),
  ('balcon','Balcón','exterior',8),
  ('deposito','Depósito','edificio',9),
  ('terraza','Terraza','exterior',10),
  ('jardin','Jardín','exterior',11),
  ('sala-de-juegos','Sala de juegos','edificio',12),
  ('vista-al-mar','Vista al mar','entorno',13),
  ('cerca-al-parque','Cerca a un parque','entorno',14),
  ('agua-caliente','Agua caliente','servicios',15),
  ('cocina-equipada','Cocina equipada','interior',16),
  ('closet-empotrado','Clósets empotrados','interior',17)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO planes (slug, nombre, precio, moneda, periodo, tope_avisos, tope_fotos,
                    tope_asientos, cuota_indice_mes, destacados_mes, dias_vigencia_aviso,
                    telefono_visible, para_rol, orden) VALUES
  ('gratis','Gratis',0,'PEN','gratis',2,8,1,5,0,90,false,ARRAY['comprador','propietario'],1),
  ('dueno-plus','Dueño Plus',39,'PEN','unico',3,30,1,NULL,1,90,true,ARRAY['propietario'],2),
  ('agente-inicial','Agente Inicial',69,'PEN','mensual',8,25,1,NULL,2,90,true,ARRAY['agente'],3),
  ('agente','Agente',139,'PEN','mensual',20,40,1,NULL,6,90,true,ARRAY['agente'],4),
  ('agente-pro','Agente Pro',249,'PEN','mensual',50,60,1,NULL,15,90,true,ARRAY['agente'],5),
  ('inmobiliaria','Inmobiliaria',449,'PEN','mensual',100,60,3,NULL,25,120,true,ARRAY['inmobiliaria'],6),
  ('inmobiliaria-plus','Inmobiliaria Plus',899,'PEN','mensual',300,80,10,NULL,60,120,true,ARRAY['inmobiliaria'],7),
  ('corporativa','Corporativa',1899,'PEN','mensual',NULL,100,30,NULL,150,120,true,ARRAY['inmobiliaria'],8)
ON CONFLICT (slug) DO NOTHING;

-- Tipo de cambio de arranque. El cron lo actualiza a diario.
INSERT INTO tipo_cambio (fecha, usd_a_pen, fuente)
VALUES (CURRENT_DATE, 3.75, 'inicial')
ON CONFLICT (fecha) DO NOTHING;
` },
  { nombre: "005_indice_semilla.sql", sql: `-- =====================================================================
-- 005 · Índice de arranque
--
-- GENERADO por scripts/generar-semilla.js — no editar a mano.
--
-- muestras = 0  =>  la API lo reporta como confianza "provisional".
-- NO son datos de mercado: existen para que el panel y el badge
-- "vs mercado" funcionen desde el primer día. Reemplazar con el CSV
-- mensual real antes de tener usuarios de verdad.
-- =====================================================================

INSERT INTO indice_precios (ubicacion_id, periodo, precio_m2_usd, alquiler_2d_pen,
                            muestras, publicado) VALUES
  ((SELECT id FROM ubicaciones WHERE slug = 'san-isidro'), to_char(now(),'YYYY-MM'), 2600, 4200, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'miraflores'), to_char(now(),'YYYY-MM'), 2300, 3900, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'barranco'), to_char(now(),'YYYY-MM'), 2150, 3500, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'san-borja'), to_char(now(),'YYYY-MM'), 1950, 3100, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'santiago-de-surco'), to_char(now(),'YYYY-MM'), 1850, 3000, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'la-molina'), to_char(now(),'YYYY-MM'), 1700, 2900, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'jesus-maria'), to_char(now(),'YYYY-MM'), 1600, 2500, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'magdalena-del-mar'), to_char(now(),'YYYY-MM'), 1600, 2450, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'lince'), to_char(now(),'YYYY-MM'), 1550, 2350, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'pueblo-libre'), to_char(now(),'YYYY-MM'), 1500, 2300, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'surquillo'), to_char(now(),'YYYY-MM'), 1500, 2250, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'san-miguel'), to_char(now(),'YYYY-MM'), 1450, 2200, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'callao'), to_char(now(),'YYYY-MM'), 1050, 1500, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'chorrillos'), to_char(now(),'YYYY-MM'), 1250, 1900, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'los-olivos'), to_char(now(),'YYYY-MM'), 1100, 1500, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'brena'), to_char(now(),'YYYY-MM'), 1200, 1750, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'ate'), to_char(now(),'YYYY-MM'), 950, 1350, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'comas'), to_char(now(),'YYYY-MM'), 900, 1200, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'san-martin-de-porres'), to_char(now(),'YYYY-MM'), 1000, 1350, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'santa-anita'), to_char(now(),'YYYY-MM'), 950, 1300, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'arequipa'), to_char(now(),'YYYY-MM'), 1100, 1500, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'trujillo'), to_char(now(),'YYYY-MM'), 1000, 1400, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'cusco'), to_char(now(),'YYYY-MM'), 1150, 1500, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'chiclayo'), to_char(now(),'YYYY-MM'), 900, 1250, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'piura'), to_char(now(),'YYYY-MM'), 900, 1200, 0, true)
ON CONFLICT (ubicacion_id, periodo) DO NOTHING;
` },
];
