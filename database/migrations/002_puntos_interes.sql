-- Lugares cercanos (OpenStreetMap / Overpass), cacheados por id_osm ("node/123", "way/456").
CREATE TABLE IF NOT EXISTS puntos_interes (
  id                   SERIAL PRIMARY KEY,
  id_osm               VARCHAR(30)  NOT NULL UNIQUE,
  categoria            VARCHAR(30)  NOT NULL,
  nombre               VARCHAR(200),
  geometria            GEOMETRY(Point,4326) NOT NULL,
  fecha_sincronizacion TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_puntos_interes_geom ON puntos_interes USING GIST (geometria);
