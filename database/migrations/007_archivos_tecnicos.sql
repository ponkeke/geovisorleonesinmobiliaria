-- Fotos de las visitas y reportes técnicos adicionales de cada terreno. El archivo vive en disco (UPLOADS_DIR);
-- aquí solo quedan sus datos. `ruta` es relativa a UPLOADS_DIR y nunca se envía al navegador.
CREATE TABLE IF NOT EXISTS archivos_tecnicos (
  id_archivo      SERIAL PRIMARY KEY,
  id_terreno      INTEGER NOT NULL REFERENCES terrenos_candidatos(id_terreno),
  tipo            VARCHAR(10) NOT NULL CHECK (tipo IN ('foto','reporte')),
  nombre_original VARCHAR(200) NOT NULL,
  mime            VARCHAR(100) NOT NULL,
  tamano          INTEGER NOT NULL CHECK (tamano > 0),
  ruta            VARCHAR(300) NOT NULL,
  subido_por      INTEGER NOT NULL REFERENCES usuarios(id_usuario),
  fecha_subida    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_archivos_tecnicos_terreno ON archivos_tecnicos (id_terreno);
