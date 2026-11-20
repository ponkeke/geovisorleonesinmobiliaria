const pool = require('../config/db');

// Polígono de los vértices en su proyección UTM: validez, área y perímetro planos (como en el plano del ingeniero),
// área sobre el elipsoide, contorno en WGS84 y distancia entre su centro y el del dibujo del propietario (si lo hay).
exports.medir = async (wkt, epsg, idTerreno) =>
  (await pool.query(
    `WITH s AS (SELECT ST_SetSRID(ST_GeomFromText($1), $2::int) AS g),
          w AS (SELECT g, ST_Transform(g, 4326) AS gw FROM s)
     SELECT ST_IsValid(g) AS valido, ST_IsValidReason(g) AS motivo,
            ST_Area(g) AS area_utm, ST_Perimeter(g) AS perimetro_utm,
            ST_Area(gw::geography) AS area_geodesica,
            (SELECT ST_Distance(ST_Centroid(gw)::geography, ST_Centroid(t.geometria)::geography)
               FROM terrenos_candidatos t WHERE t.id_terreno = $3 AND t.geometria IS NOT NULL) AS desplazamiento_m
       FROM w`, [wkt, epsg, idTerreno]
  )).rows[0];

exports.insert = async (id, d, userId) =>
  (await pool.query(
    `INSERT INTO levantamientos_topograficos (id_terreno, datum, zona_utm, epsg, vertices, geometria,
        area_utm, perimetro_utm, area_geodesica, area_declarada, perimetro_declarado, tolerancia_pct, desplazamiento_m,
        fecha_levantamiento, ingeniero, cip, observaciones, registrado_por)
     VALUES ($1,$2,$3,$4,$5, ST_Transform(ST_SetSRID(ST_GeomFromText($6), $4::int), 4326),
        $7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id_levantamiento`,
    [id, d.datum, d.zona_utm, d.epsg, JSON.stringify(d.vertices), d.wkt,
      d.area_utm, d.perimetro_utm, d.area_geodesica, d.area_declarada, d.perimetro_declarado, d.tolerancia_pct, d.desplazamiento_m,
      d.fecha_levantamiento, d.ingeniero, d.cip, d.observaciones, userId]
  )).rows[0];

// Último levantamiento del terreno (el contorno ya en GeoJSON) con el nombre de quien lo registró.
exports.latest = async (id) =>
  (await pool.query(
    `SELECT l.id_levantamiento, l.id_terreno, l.datum, l.zona_utm, l.epsg, l.vertices,
            ST_AsGeoJSON(l.geometria)::json AS geometria,
            l.area_utm, l.perimetro_utm, l.area_geodesica, l.area_declarada, l.perimetro_declarado, l.tolerancia_pct,
            l.desplazamiento_m, l.fecha_levantamiento, l.ingeniero, l.cip, l.observaciones, l.fecha_registro,
            u.nombre AS registrado_por_nombre
       FROM levantamientos_topograficos l JOIN usuarios u ON u.id_usuario = l.registrado_por
      WHERE l.id_terreno = $1 ORDER BY l.fecha_registro DESC, l.id_levantamiento DESC LIMIT 1`, [id]
  )).rows[0] || null;
