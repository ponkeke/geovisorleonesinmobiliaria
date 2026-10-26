const pool = require('../config/db');

// Caja delimitadora del polígono del terreno (grados).
exports.cajaTerreno = async (idTerreno) =>
  (await pool.query(
    `SELECT ST_YMin(geometria) AS sur, ST_XMin(geometria) AS oeste,
            ST_YMax(geometria) AS norte, ST_XMax(geometria) AS este
       FROM terrenos_candidatos WHERE id_terreno = $1 AND geometria IS NOT NULL`, [idTerreno]
  )).rows[0] || null;

// Inserta o actualiza por id_osm. `geom` es GeoJSON (Point, o LineString para vías:
// en ese caso `geometria` es el punto de la vía más cercano al terreno y `trazo` la línea completa;
// Polygon para zonas: `area` es el contorno y `geometria` un punto dentro de él).
exports.upsert = async (idTerreno, items) => {
  if (!items.length) return 0;
  const { rowCount } = await pool.query(
    `INSERT INTO puntos_interes (id_osm, categoria, nombre, geometria, trazo, area, fecha_sincronizacion)
     SELECT i.id_osm, i.categoria, i.nombre,
            CASE g.type WHEN 'LINESTRING' THEN ST_ClosestPoint(g.geom, t.geometria)
                        WHEN 'POLYGON' THEN ST_PointOnSurface(g.geom)
                        ELSE g.geom END,
            CASE WHEN g.type = 'LINESTRING' THEN g.geom END,
            CASE WHEN g.type = 'POLYGON' THEN g.geom END,
            now()
       FROM unnest($2::text[], $3::text[], $4::text[], $5::text[]) AS i(id_osm, categoria, nombre, geom_json)
       CROSS JOIN LATERAL (SELECT ST_GeomFromGeoJSON(i.geom_json) AS geom,
                                  GeometryType(ST_GeomFromGeoJSON(i.geom_json)) AS type) g
       CROSS JOIN (SELECT geometria FROM terrenos_candidatos WHERE id_terreno = $1) t
     ON CONFLICT (id_osm) DO UPDATE
       SET categoria = EXCLUDED.categoria, nombre = EXCLUDED.nombre,
           geometria = EXCLUDED.geometria, trazo = EXCLUDED.trazo, area = EXCLUDED.area, fecha_sincronizacion = now()`,
    [idTerreno, items.map((i) => i.id_osm), items.map((i) => i.categoria),
      items.map((i) => i.nombre), items.map((i) => JSON.stringify(i.geom))]
  );
  return rowCount;
};

// Lugares sincronizados en los últimos `dias` días dentro de `radio` m del BORDE del polígono,
// con la distancia exacta (geography, metros) ordenada por cercanía. Las vías incluyen `trazo`: el tramo
// (GeoJSON) que cae dentro del radio, y las zonas su `area` (contorno completo); null para el resto. Se omiten los lugares sin nombre.
exports.cercanos = async (idTerreno, radio, claves, dias) =>
  (await pool.query(
    `SELECT p.categoria, p.nombre, p.id_osm,
            ST_Distance(COALESCE(p.area, p.geometria)::geography, t.geometria::geography) AS distancia_m,
            ST_Y(p.geometria) AS lat, ST_X(p.geometria) AS lng,
            CASE WHEN c.tramo IS NULL OR ST_IsEmpty(c.tramo) THEN NULL ELSE ST_AsGeoJSON(c.tramo)::json END AS trazo,
            ST_AsGeoJSON(p.area)::json AS area
       FROM puntos_interes p
       JOIN terrenos_candidatos t ON t.id_terreno = $1
       CROSS JOIN LATERAL (SELECT ST_Intersection(p.trazo, ST_Buffer(t.geometria::geography, $2)::geometry) AS tramo) c
      WHERE p.categoria = ANY($3::text[])
        AND p.nombre IS NOT NULL
        AND p.fecha_sincronizacion > now() - make_interval(days => $4)
        AND ST_DWithin(COALESCE(p.area, p.geometria)::geography, t.geometria::geography, $2)
      ORDER BY distancia_m, p.id`,
    [idTerreno, radio, claves, dias]
  )).rows;
