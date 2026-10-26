-- Información financiera ampliada: desglose de los costos de adquisición, observaciones y fecha de revisión.
-- `costos_adquisicion` sigue siendo el total (la suma del desglose cuando se informa), así que el puntaje no cambia.
ALTER TABLE informacion_financiera
  ADD COLUMN IF NOT EXISTS costo_notaria       NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (costo_notaria >= 0),
  ADD COLUMN IF NOT EXISTS costo_registral     NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (costo_registral >= 0),
  ADD COLUMN IF NOT EXISTS costo_impuestos     NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (costo_impuestos >= 0),
  ADD COLUMN IF NOT EXISTS costo_tasacion      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (costo_tasacion >= 0),
  ADD COLUMN IF NOT EXISTS costo_saneamiento   NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (costo_saneamiento >= 0),
  ADD COLUMN IF NOT EXISTS costo_comision      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (costo_comision >= 0),
  ADD COLUMN IF NOT EXISTS costo_otros         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (costo_otros >= 0),
  ADD COLUMN IF NOT EXISTS fecha_revision      DATE,
  ADD COLUMN IF NOT EXISTS observaciones       TEXT;

-- El Área Administrativa también adjunta documentos (proformas, cotizaciones, tasación, comprobantes).
ALTER TABLE archivos_tecnicos ALTER COLUMN area TYPE VARCHAR(20);   -- 'administrativa' no cabía en VARCHAR(10)
ALTER TABLE archivos_tecnicos DROP CONSTRAINT IF EXISTS archivos_tecnicos_area_check;
ALTER TABLE archivos_tecnicos
  ADD CONSTRAINT archivos_tecnicos_area_check CHECK (area IN ('tecnica','legal','administrativa'));
