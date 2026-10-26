-- Contorno de los lugares que son una zona (parques) para dibujarlos completos en el mapa.
ALTER TABLE puntos_interes ADD COLUMN IF NOT EXISTS area GEOMETRY(Polygon,4326);
-- Solo es caché: se vacía para que los lugares se vuelvan a consultar con su contorno.
DELETE FROM puntos_interes;
