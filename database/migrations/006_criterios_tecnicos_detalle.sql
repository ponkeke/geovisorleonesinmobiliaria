-- Criterio técnico ampliado (acceso, servicios básicos, visita) y superficie de las vías de OSM.
-- Todo opcional: los registros anteriores siguen siendo válidos.
ALTER TABLE criterios_tecnicos
  ADD COLUMN IF NOT EXISTS tipo_via_acceso   VARCHAR(20) CHECK (tipo_via_acceso IN ('avenida','jiron','calle','pasaje','trocha')),
  ADD COLUMN IF NOT EXISTS nombre_via_acceso VARCHAR(200),
  ADD COLUMN IF NOT EXISTS superficie_via    VARCHAR(20) CHECK (superficie_via IN ('asfaltada','afirmada','trocha')),
  ADD COLUMN IF NOT EXISTS servicio_agua     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS servicio_desague  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS servicio_luz      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS servicio_internet BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS servicio_gas      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fecha_visita      DATE,
  ADD COLUMN IF NOT EXISTS observaciones     TEXT;

ALTER TABLE vias_osm ADD COLUMN IF NOT EXISTS superficie VARCHAR(30);

-- Se agregaron categorías de lugares cercanos (salud, mercados, bancos, paraderos): los lugares ya guardados
-- se marcan como vencidos para que cada terreno se vuelva a consultar una vez y las incluya (es solo caché).
UPDATE puntos_interes SET fecha_sincronizacion = now() - interval '30 days';
