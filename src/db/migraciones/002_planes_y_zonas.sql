-- =====================================================================
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
