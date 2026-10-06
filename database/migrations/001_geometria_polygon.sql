-- terrenos_candidatos.geometria: POINT -> POLYGON (4326).
-- Los puntos previos (si los hubiera) se convierten en un cuadrado aprox. de 20 m de radio.
ALTER TABLE terrenos_candidatos
  ALTER COLUMN geometria TYPE geometry(Polygon, 4326)
  USING CASE
    WHEN geometria IS NULL THEN NULL
    WHEN GeometryType(geometria) = 'POINT'
      THEN ST_Envelope(ST_Buffer(geometria::geography, 20)::geometry)
    ELSE geometria
  END;
