-- Situación legal ampliada (solo informativa: NO interviene en el puntaje, que sigue saliendo de ruta_legal).
-- Todo opcional: los registros anteriores siguen siendo válidos.
ALTER TABLE situaciones_legales
  ADD COLUMN IF NOT EXISTS numero_partida                   VARCHAR(40),
  ADD COLUMN IF NOT EXISTS oficina_registral                VARCHAR(100),
  ADD COLUMN IF NOT EXISTS titular_registral                VARCHAR(200),
  ADD COLUMN IF NOT EXISTS titular_coincide                 BOOLEAN,            -- NULL = sin verificar
  ADD COLUMN IF NOT EXISTS hay_copropietarios               BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requiere_consentimiento_conyuge  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hay_representante_poder          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS carga_hipoteca                   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS carga_embargo                    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS carga_anotacion_preventiva       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS carga_litigio                    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS carga_servidumbre                BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS detalle_cargas                   TEXT,
  ADD COLUMN IF NOT EXISTS fecha_estado_tramite             DATE,
  ADD COLUMN IF NOT EXISTS doc_partida                      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS doc_gravamenes                   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS doc_predial                      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS doc_parametros                   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS doc_catastral                    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fecha_revision                   DATE,
  ADD COLUMN IF NOT EXISTS observaciones                    TEXT;

-- Los documentos legales usan el mismo almacén de archivos que la revisión técnica; `area` dice de quién es cada uno.
ALTER TABLE archivos_tecnicos
  ADD COLUMN IF NOT EXISTS area VARCHAR(20) NOT NULL DEFAULT 'tecnica' CHECK (area IN ('tecnica','legal'));
