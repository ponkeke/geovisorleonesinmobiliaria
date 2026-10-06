const pool = require('../config/db');

// Inserta o actualiza vías por id_osm (LineString en GeoJSON).
exports.upsert = async (vias) => {
  if (!vias.length) return 0;
  const { rowCount } = await pool.query(
    `INSERT INTO vias_osm (id_osm, highway, nombre, geometria, fecha_sincronizacion)
     SELECT v.id_osm, v.highway, v.nombre, ST_SetSRID(ST_GeomFromGeoJSON(v.geom_json), 4326), now()
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) AS v(id_osm, highway, nombre, geom_json)
     ON CONFLICT (id_osm) DO UPDATE
       SET highway = EXCLUDED.highway, nombre = EXCLUDED.nombre,
           geometria = EXCLUDED.geometria, fecha_sincronizacion = now()`,
    [vias.map((v) => v.id_osm), vias.map((v) => v.highway), vias.map((v) => v.nombre),
      vias.map((v) => JSON.stringify(v.geom))]
  );
  return rowCount;
};

// ¿Hay vías sincronizadas hace menos de `dias` días en la zona (polígono + margen en grados)?
exports.hayRecientes = async (geojson, margenGrados, dias) =>
  (await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM vias_osm v
        WHERE v.geometria && ST_Expand(ST_SetSRID(ST_GeomFromGeoJSON($1::text), 4326), $2::float8)
          AND v.fecha_sincronizacion > now() - make_interval(days => $3::int)) AS hay`,
    [JSON.stringify(geojson), margenGrados, dias]
  )).rows[0].hay;
