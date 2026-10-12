const pool = require('../config/db');

// Último registro de una tabla de criterios para un terreno.
const latest = async (table, id) =>
  (await pool.query(
    `SELECT * FROM ${table} WHERE id_terreno = $1 ORDER BY fecha_registro DESC, 1 DESC LIMIT 1`, [id]
  )).rows[0] || null;

exports.latestCriterios = (id) => latest('criterios_tecnicos', id);
exports.latestLegal = (id) => latest('situaciones_legales', id);
exports.latestFinanciera = (id) => latest('informacion_financiera', id);

exports.listOrdered = async () =>
  (await pool.query(
    `SELECT t.id_terreno, t.estado, t.area, t.fecha_registro,
            o.nombre_propietario, o.ubicacion_referencial, o.precio_ofertado,
            ST_AsGeoJSON(t.geometria)::json AS geometria,
            ST_AsGeoJSON(ST_PointOnSurface(t.geometria))::json AS punto,
            p.puntaje_total
       FROM terrenos_candidatos t
       JOIN ofertas_terreno o ON o.id_oferta = t.id_oferta
       LEFT JOIN LATERAL (
         SELECT puntaje_total FROM puntajes_viabilidad
          WHERE id_terreno = t.id_terreno ORDER BY fecha_calculo DESC, id_puntaje DESC LIMIT 1
       ) p ON true
      ORDER BY p.puntaje_total DESC NULLS LAST, t.fecha_registro DESC`
  )).rows;

// Solo la forma de los terrenos registrados (sin ids ni datos de la oferta): se muestra en el mapa público.
exports.contornos = async () =>
  (await pool.query(
    `SELECT ST_AsGeoJSON(geometria)::json AS geometry FROM terrenos_candidatos WHERE geometria IS NOT NULL`
  )).rows;

exports.findById = async (id) =>
  (await pool.query(
    `SELECT t.id_terreno, t.estado, t.area, t.fecha_registro,
            ST_AsGeoJSON(t.geometria)::json AS geometria,
            row_to_json(o) AS oferta
       FROM terrenos_candidatos t
       JOIN ofertas_terreno o ON o.id_oferta = t.id_oferta
      WHERE t.id_terreno = $1`, [id]
  )).rows[0];

exports.insertCriterios = async (id, d, userId) =>
  (await pool.query(
    `INSERT INTO criterios_tecnicos (id_terreno, distancia_via_principal, compatibilidad_normativa, registrado_por)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [id, d.distancia_via_principal, d.compatibilidad_normativa, userId]
  )).rows[0];

exports.insertLegal = async (id, d, userId) =>
  (await pool.query(
    `INSERT INTO situaciones_legales (id_terreno, ruta_legal, estado_tramite, registrado_por)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [id, d.ruta_legal, d.estado_tramite || null, userId]
  )).rows[0];

exports.insertFinanciera = async (id, d, userId) =>
  (await pool.query(
    `INSERT INTO informacion_financiera (id_terreno, precio_ofertado, costos_adquisicion, registrado_por)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [id, d.precio_ofertado, d.costos_adquisicion || 0, userId]
  )).rows[0];

exports.insertPuntaje = async (id, total, detalle) =>
  (await pool.query(
    `INSERT INTO puntajes_viabilidad (id_terreno, puntaje_total, detalle_criterios)
     VALUES ($1,$2,$3) RETURNING *`,
    [id, total, JSON.stringify(detalle)]
  )).rows[0];

exports.latestPuntaje = async (id) =>
  (await pool.query(
    'SELECT * FROM puntajes_viabilidad WHERE id_terreno=$1 ORDER BY fecha_calculo DESC, id_puntaje DESC LIMIT 1', [id]
  )).rows[0] || null;

exports.latestDecision = async (id) =>
  (await pool.query(
    `SELECT d.*, u.nombre AS decidido_por_nombre FROM decisiones_adquisicion d
       JOIN usuarios u ON u.id_usuario = d.decidido_por
      WHERE d.id_terreno=$1 ORDER BY fecha_decision DESC, id_decision DESC LIMIT 1`, [id]
  )).rows[0] || null;

// Registra la decisión y actualiza el estado del terreno atómicamente.
exports.insertDecision = async (id, resultado, observaciones, userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [dec] } = await client.query(
      `INSERT INTO decisiones_adquisicion (id_terreno, decidido_por, resultado, observaciones)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [id, userId, resultado, observaciones || null]
    );
    await client.query('UPDATE terrenos_candidatos SET estado=$1 WHERE id_terreno=$2', [resultado, id]);
    await client.query('COMMIT');
    return dec;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};
