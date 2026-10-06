const pool = require('../config/db');

// Caja delimitadora del polígono del terreno (grados).
exports.cajaTerreno = async (idTerreno) =>
  (await pool.query(
    `SELECT ST_YMin(geometria) AS sur, ST_XMin(geometria) AS oeste,
            ST_YMax(geometria) AS norte, ST_XMax(geometria) AS este
       FROM terrenos_candidatos WHERE id_terreno = $1 AND geometria IS NOT NULL`, [idTerreno]
  )).rows[0] || null;

// Inserta o actualiza por id_osm. `geom` es GeoJSON (Point, o LineString para vías:
// en ese caso se guarda el punto de la vía más cercano al terreno).
exports.upsert = async (idTerreno, items) => {
  if (!items.length) return 0;
  const { rowCount } = await pool.query(
    `INSERT INTO puntos_interes (id_osm, categoria, nombre, geometria, fecha_sincronizacion)
     SELECT i.id_osm, i.categoria, i.nombre,
            CASE WHEN g.type = 'LINESTRING' THEN ST_ClosestPoint(g.geom, t.geometria) ELSE g.geom END,
            now()
       FROM unnest($2::text[], $3::text[], $4::text[], $5::text[]) AS i(id_osm, categoria, nombre, geom_json)
       CROSS JOIN LATERAL (SELECT ST_GeomFromGeoJSON(i.geom_json) AS geom,
                                  GeometryType(ST_GeomFromGeoJSON(i.geom_json)) AS type) g
       CROSS JOIN (SELECT geometria FROM terrenos_candidatos WHERE id_terreno = $1) t
     ON CONFLICT (id_osm) DO UPDATE
       SET categoria = EXCLUDED.categoria, nombre = EXCLUDED.nombre,
           geometria = EXCLUDED.geometria, fecha_sincronizacion = now()`,
    [idTerreno, items.map((i) => i.id_osm), items.map((i) => i.categoria),
      items.map((i) => i.nombre), items.map((i) => JSON.stringify(i.geom))]
  );
  return rowCount;
};

// Lugares sincronizados en los últimos `dias` días dentro de `radio` m del BORDE del polígono,
// con la distancia exacta (geography, metros) ordenada por cercanía.
exports.cercanos = async (idTerreno, radio, claves, dias) =>
  (await pool.query(
    `SELECT p.categoria, p.nombre, p.id_osm,
            ST_Distance(p.geometria::geography, t.geometria::geography) AS distancia_m,
            ST_Y(p.geometria) AS lat, ST_X(p.geometria) AS lng
       FROM puntos_interes p
       JOIN terrenos_candidatos t ON t.id_terreno = $1
      WHERE p.categoria = ANY($3::text[])
        AND p.fecha_sincronizacion > now() - make_interval(days => $4)
        AND ST_DWithin(p.geometria::geography, t.geometria::geography, $2)
      ORDER BY distancia_m, p.id`,
    [idTerreno, radio, claves, dias]
  )).rows;
