-- =====================================================================
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
