const pool = require('../config/db');

const GEOM = 'ST_SetSRID(ST_GeomFromGeoJSON($1::text), 4326)';

// Validez topológica (ST_IsValid), área y perímetro reales (geography, m) y punto del defecto si es inválido.
exports.basico = async (geojson) =>
  (await pool.query(
    `SELECT ST_IsValid(g) AS valido, ST_IsValidReason(g) AS motivo,
            ST_Area(g::geography) AS area, ST_Perimeter(g::geography) AS perimetro,
            ST_AsGeoJSON((ST_IsValidDetail(g)).location)::json AS punto_defecto
       FROM (SELECT ${GEOM} AS g) s`, [JSON.stringify(geojson)]
  )).rows[0];

// Ancho útil = diámetro del mayor círculo inscrito, calculado en metros (proyección azimutal local).
// Devuelve null si ST_MaximumInscribedCircle no está disponible (PostGIS < 3.1).
exports.anchoUtil = async (geojson) => {
  try {
    const { rows: [r] } = await pool.query(
      `WITH s AS (SELECT ${GEOM} AS g),
            p AS (SELECT ST_Transform(g, format('+proj=aeqd +lat_0=%s +lon_0=%s +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs',
                                                 ST_Y(ST_Centroid(g)), ST_X(ST_Centroid(g)))) AS m FROM s)
       SELECT 2 * (ST_MaximumInscribedCircle(m)).radius AS ancho FROM p`, [JSON.stringify(geojson)]
    );
    return r.ancho;
  } catch {
    return null;
  }
};

// Superposición con las franjas de las vías en caché (ancho por tipo) y zona problemática.
exports.superposicionVias = async (geojson, anchos, margenGrados, dias) =>
  (await pool.query(
    `WITH p AS (SELECT ${GEOM} AS g),
          franjas AS (
            SELECT ST_Buffer(v.geometria::geography, w.ancho / 2.0)::geometry AS f
              FROM vias_osm v
              JOIN p ON v.geometria && ST_Expand(p.g, $4::float8)
              JOIN unnest($2::text[], $3::float8[]) AS w(highway, ancho) ON w.highway = v.highway
             WHERE v.fecha_sincronizacion > now() - make_interval(days => $5::int)),
          inter AS (SELECT ST_CollectionExtract(ST_Intersection(p.g, ST_Union(franjas.f)), 3) AS i
                      FROM p, franjas GROUP BY p.g)
     SELECT ST_Area(i::geography) AS area_m2, ST_AsGeoJSON(i)::json AS zona FROM inter WHERE NOT ST_IsEmpty(i)`,
    [JSON.stringify(geojson), Object.keys(anchos), Object.values(anchos), margenGrados, dias]
  )).rows[0] || { area_m2: 0, zona: null };

// Superposición con terrenos ya registrados: % respecto del menor de los dos (cubre "queda dentro").
exports.traslapes = async (geojson) =>
  (await pool.query(
    `WITH p AS (SELECT ${GEOM} AS g)
     SELECT t.id_terreno,
            ST_Area(ST_Intersection(p.g, t.geometria)::geography) AS area_m2,
            ST_Area(ST_Intersection(p.g, t.geometria)::geography)
              / NULLIF(LEAST(ST_Area(p.g::geography), ST_Area(t.geometria::geography)), 0) * 100 AS pct,
            ST_AsGeoJSON(ST_CollectionExtract(ST_Intersection(p.g, t.geometria), 3))::json AS zona
       FROM terrenos_candidatos t, p
      WHERE t.geometria IS NOT NULL AND t.geometria && p.g AND ST_Intersects(t.geometria, p.g)
      ORDER BY pct DESC NULLS LAST`, [JSON.stringify(geojson)]
  )).rows;
