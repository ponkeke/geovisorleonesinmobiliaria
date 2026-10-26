const pool = require('../config/db');

// Último registro de una tabla de criterios para un terreno.
const latest = async (table, id) =>
  (await pool.query(
    `SELECT * FROM ${table} WHERE id_terreno = $1 ORDER BY fecha_registro DESC, 1 DESC LIMIT 1`, [id]
  )).rows[0] || null;

// Incluye el nombre de quien registró la revisión técnica (visita).
exports.latestCriterios = async (id) =>
  (await pool.query(
    `SELECT c.*, u.nombre AS registrado_por_nombre
       FROM criterios_tecnicos c JOIN usuarios u ON u.id_usuario = c.registrado_por
      WHERE c.id_terreno = $1 ORDER BY c.fecha_registro DESC, c.id_criterio DESC LIMIT 1`, [id]
  )).rows[0] || null;
exports.latestLegal = async (id) =>
  (await pool.query(
    `SELECT l.*, u.nombre AS registrado_por_nombre
       FROM situaciones_legales l JOIN usuarios u ON u.id_usuario = l.registrado_por
      WHERE l.id_terreno = $1 ORDER BY l.fecha_registro DESC, l.id_situacion DESC LIMIT 1`, [id]
  )).rows[0] || null;
exports.latestFinanciera = async (id) =>
  (await pool.query(
    `SELECT f.*, u.nombre AS registrado_por_nombre
       FROM informacion_financiera f JOIN usuarios u ON u.id_usuario = f.registrado_por
      WHERE f.id_terreno = $1 ORDER BY f.fecha_registro DESC, f.id_info DESC LIMIT 1`, [id]
  )).rows[0] || null;

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
    `INSERT INTO criterios_tecnicos (id_terreno, distancia_via_principal, compatibilidad_normativa,
        tipo_via_acceso, nombre_via_acceso, superficie_via,
        servicio_agua, servicio_desague, servicio_luz, servicio_internet, servicio_gas,
        fecha_visita, observaciones, registrado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [id, d.distancia_via_principal, d.compatibilidad_normativa,
      d.tipo_via_acceso, d.nombre_via_acceso, d.superficie_via,
      d.servicio_agua, d.servicio_desague, d.servicio_luz, d.servicio_internet, d.servicio_gas,
      d.fecha_visita, d.observaciones, userId]
  )).rows[0];

exports.insertLegal = async (id, d, userId) =>
  (await pool.query(
    `INSERT INTO situaciones_legales (id_terreno, ruta_legal, estado_tramite, fecha_estado_tramite,
        numero_partida, oficina_registral, titular_registral, titular_coincide,
        hay_copropietarios, requiere_consentimiento_conyuge, hay_representante_poder,
        carga_hipoteca, carga_embargo, carga_anotacion_preventiva, carga_litigio, carga_servidumbre, detalle_cargas,
        doc_partida, doc_gravamenes, doc_predial, doc_parametros, doc_catastral,
        fecha_revision, observaciones, registrado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) RETURNING *`,
    [id, d.ruta_legal, d.estado_tramite || null, d.fecha_estado_tramite,
      d.numero_partida, d.oficina_registral, d.titular_registral, d.titular_coincide,
      d.hay_copropietarios, d.requiere_consentimiento_conyuge, d.hay_representante_poder,
      d.carga_hipoteca, d.carga_embargo, d.carga_anotacion_preventiva, d.carga_litigio, d.carga_servidumbre, d.detalle_cargas,
      d.doc_partida, d.doc_gravamenes, d.doc_predial, d.doc_parametros, d.doc_catastral,
      d.fecha_revision, d.observaciones, userId]
  )).rows[0];

exports.insertFinanciera = async (id, d, userId) =>
  (await pool.query(
    `INSERT INTO informacion_financiera (id_terreno, precio_ofertado, costos_adquisicion,
        costo_notaria, costo_registral, costo_impuestos, costo_tasacion, costo_saneamiento, costo_comision, costo_otros,
        fecha_revision, observaciones, registrado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [id, d.precio_ofertado, d.costos_adquisicion || 0,
      d.costo_notaria || 0, d.costo_registral || 0, d.costo_impuestos || 0, d.costo_tasacion || 0,
      d.costo_saneamiento || 0, d.costo_comision || 0, d.costo_otros || 0,
      d.fecha_revision || null, d.observaciones || null, userId]
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
