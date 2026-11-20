-- Levantamiento topográfico del ingeniero: vértices UTM del plano, datum/zona y área/perímetro declarados.
-- Es aparte de terrenos_candidatos.geometria (lo que dibujó el propietario): no la reemplaza, se compara con ella.
CREATE TABLE IF NOT EXISTS levantamientos_topograficos (
  id_levantamiento    SERIAL PRIMARY KEY,
  id_terreno          INTEGER NOT NULL REFERENCES terrenos_candidatos(id_terreno),
  datum               VARCHAR(10) NOT NULL CHECK (datum IN ('WGS84','PSAD56')),
  zona_utm            SMALLINT    NOT NULL CHECK (zona_utm IN (17,18,19)),   -- hemisferio sur
  epsg                INTEGER     NOT NULL,
  vertices            JSONB       NOT NULL,   -- [{ este, norte, distancia_plano, distancia_calculada }] en el orden del plano
  geometria           GEOMETRY(Polygon,4326) NOT NULL,
  area_utm            NUMERIC(12,2) NOT NULL,   -- plana, en la proyección del plano (como la calcula el ingeniero)
  perimetro_utm       NUMERIC(12,2) NOT NULL,
  area_geodesica      NUMERIC(12,2) NOT NULL,   -- sobre el elipsoide (la que usa el resto del sistema)
  area_declarada      NUMERIC(12,2) CHECK (area_declarada > 0),
  perimetro_declarado NUMERIC(12,2) CHECK (perimetro_declarado > 0),
  tolerancia_pct      NUMERIC(5,2) NOT NULL DEFAULT 0.5 CHECK (tolerancia_pct >= 0 AND tolerancia_pct <= 100),
  desplazamiento_m    NUMERIC(10,1),            -- distancia entre el centro medido y el del dibujo del propietario
  fecha_levantamiento DATE,
  ingeniero           VARCHAR(200),
  cip                 VARCHAR(30),
  observaciones       TEXT,
  registrado_por      INTEGER NOT NULL REFERENCES usuarios(id_usuario),
  fecha_registro      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_levantamientos_terreno ON levantamientos_topograficos (id_terreno);
