-- Vías de OpenStreetMap en caché (validación de polígonos: un terreno no debe invadir una vía).
CREATE TABLE IF NOT EXISTS vias_osm (
  id                   SERIAL PRIMARY KEY,
  id_osm               VARCHAR(30)  NOT NULL UNIQUE,   -- "way/123"
  highway              VARCHAR(30)  NOT NULL,          -- primary, secondary, tertiary, residential, ...
  nombre               VARCHAR(200),
  geometria            GEOMETRY(LineString,4326) NOT NULL,
  fecha_sincronizacion TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vias_osm_geom ON vias_osm USING GIST (geometria);
