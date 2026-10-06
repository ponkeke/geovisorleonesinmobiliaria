-- Geovisor de Adquisición de Terrenos - Prototipo 1
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE usuarios (
  id_usuario     SERIAL PRIMARY KEY,
  nombre         VARCHAR(120) NOT NULL,
  correo         VARCHAR(160) NOT NULL UNIQUE,
  rol            VARCHAR(20)  NOT NULL CHECK (rol IN ('tecnica','legal','administrativa','gerencia')),
  password_hash  VARCHAR(100) NOT NULL,
  fecha_creacion TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Se agregan precio_ofertado, descripcion y area_referencial (el formulario público los pide).
CREATE TABLE ofertas_terreno (
  id_oferta             SERIAL PRIMARY KEY,
  nombre_propietario    VARCHAR(120) NOT NULL,
  contacto              VARCHAR(160) NOT NULL,
  ubicacion_referencial TEXT         NOT NULL,
  precio_ofertado       NUMERIC(14,2),
  area_referencial      NUMERIC(12,2),
  descripcion           TEXT,
  fecha_envio           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  estado                VARCHAR(20)  NOT NULL DEFAULT 'recibida'
);

-- geometria: polígono dibujado en el formulario público; area la calcula el servidor (ST_Area geography, m²).
CREATE TABLE terrenos_candidatos (
  id_terreno     SERIAL PRIMARY KEY,
  id_oferta      INTEGER NOT NULL REFERENCES ofertas_terreno(id_oferta),
  geometria      GEOMETRY(Polygon,4326),
  area           NUMERIC(12,2),
  estado         VARCHAR(20) NOT NULL DEFAULT 'en_evaluacion'
                 CHECK (estado IN ('en_evaluacion','aprobado','descartado')),
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_terrenos_geom ON terrenos_candidatos USING GIST (geometria);

CREATE TABLE criterios_tecnicos (
  id_criterio             SERIAL PRIMARY KEY,
  id_terreno              INTEGER NOT NULL REFERENCES terrenos_candidatos(id_terreno),
  distancia_via_principal NUMERIC(10,2) NOT NULL CHECK (distancia_via_principal >= 0), -- metros
  compatibilidad_normativa BOOLEAN NOT NULL,
  registrado_por          INTEGER NOT NULL REFERENCES usuarios(id_usuario),
  fecha_registro          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE situaciones_legales (
  id_situacion   SERIAL PRIMARY KEY,
  id_terreno     INTEGER NOT NULL REFERENCES terrenos_candidatos(id_terreno),
  ruta_legal     VARCHAR(30) NOT NULL
                 CHECK (ruta_legal IN ('partida registral','desmembramiento','prescripción adquisitiva')),
  estado_tramite VARCHAR(60),
  registrado_por INTEGER NOT NULL REFERENCES usuarios(id_usuario),
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE informacion_financiera (
  id_info           SERIAL PRIMARY KEY,
  id_terreno        INTEGER NOT NULL REFERENCES terrenos_candidatos(id_terreno),
  precio_ofertado   NUMERIC(14,2) NOT NULL CHECK (precio_ofertado >= 0),
  costos_adquisicion NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (costos_adquisicion >= 0),
  registrado_por    INTEGER NOT NULL REFERENCES usuarios(id_usuario),
  fecha_registro    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE puntajes_viabilidad (
  id_puntaje        SERIAL PRIMARY KEY,
  id_terreno        INTEGER NOT NULL REFERENCES terrenos_candidatos(id_terreno),
  puntaje_total     NUMERIC(5,2) NOT NULL,
  detalle_criterios JSONB NOT NULL,
  fecha_calculo     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE decisiones_adquisicion (
  id_decision   SERIAL PRIMARY KEY,
  id_terreno    INTEGER NOT NULL REFERENCES terrenos_candidatos(id_terreno),
  decidido_por  INTEGER NOT NULL REFERENCES usuarios(id_usuario),
  resultado     VARCHAR(20) NOT NULL CHECK (resultado IN ('aprobado','descartado')),
  observaciones TEXT,
  fecha_decision TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lugares cercanos (OpenStreetMap / Overpass), cacheados por id_osm ("node/123", "way/456").
CREATE TABLE puntos_interes (
  id                   SERIAL PRIMARY KEY,
  id_osm               VARCHAR(30)  NOT NULL UNIQUE,
  categoria            VARCHAR(30)  NOT NULL,
  nombre               VARCHAR(200),
  geometria            GEOMETRY(Point,4326) NOT NULL,
  fecha_sincronizacion TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_puntos_interes_geom ON puntos_interes USING GIST (geometria);

-- Vías de OpenStreetMap en caché (validación de polígonos: un terreno no debe invadir una vía).
CREATE TABLE vias_osm (
  id                   SERIAL PRIMARY KEY,
  id_osm               VARCHAR(30)  NOT NULL UNIQUE,   -- "way/123"
  highway              VARCHAR(30)  NOT NULL,          -- primary, secondary, tertiary, residential, ...
  nombre               VARCHAR(200),
  geometria            GEOMETRY(LineString,4326) NOT NULL,
  fecha_sincronizacion TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_vias_osm_geom ON vias_osm USING GIST (geometria);
