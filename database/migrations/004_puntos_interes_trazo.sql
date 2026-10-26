-- Trazo de las vías principales (línea completa de OpenStreetMap) para dibujar un tramo en el mapa.
ALTER TABLE puntos_interes ADD COLUMN IF NOT EXISTS trazo GEOMETRY(LineString,4326);
-- Solo es caché: se vacía entera para que todo se vuelva a consultar (las vías con su trazo).
DELETE FROM puntos_interes;
