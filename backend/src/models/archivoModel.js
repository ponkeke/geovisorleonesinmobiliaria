const pool = require('../config/db');

// Datos públicos de un archivo (nunca `ruta`).
const PUBLICO = `a.id_archivo, a.id_terreno, a.area, a.tipo, a.nombre_original, a.mime, a.tamano, a.fecha_subida, u.nombre AS subido_por_nombre`;

exports.insertar = async (d) => {
  const { rows: [r] } = await pool.query(
    `INSERT INTO archivos_tecnicos (id_terreno, area, tipo, nombre_original, mime, tamano, ruta, subido_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id_archivo`,
    [d.id_terreno, d.area, d.tipo, d.nombre_original, d.mime, d.tamano, d.ruta, d.subido_por]
  );
  return exports.publico(r.id_archivo);
};

exports.publico = async (idArchivo) =>
  (await pool.query(
    `SELECT ${PUBLICO} FROM archivos_tecnicos a JOIN usuarios u ON u.id_usuario = a.subido_por WHERE a.id_archivo = $1`, [idArchivo]
  )).rows[0];

exports.listar = async (idTerreno) =>
  (await pool.query(
    `SELECT ${PUBLICO} FROM archivos_tecnicos a JOIN usuarios u ON u.id_usuario = a.subido_por
      WHERE a.id_terreno = $1 ORDER BY a.fecha_subida, a.id_archivo`, [idTerreno]
  )).rows;

// Cuántos archivos tiene el terreno de esa área (el tope se aplica por área).
exports.contar = async (idTerreno, area) =>
  Number((await pool.query('SELECT count(*) AS n FROM archivos_tecnicos WHERE id_terreno = $1 AND area = $2', [idTerreno, area])).rows[0].n);

// Incluye `ruta` (solo para uso interno del servidor).
exports.obtener = async (idTerreno, idArchivo) =>
  (await pool.query('SELECT * FROM archivos_tecnicos WHERE id_terreno = $1 AND id_archivo = $2', [idTerreno, idArchivo])).rows[0] || null;

exports.eliminar = (idArchivo) => pool.query('DELETE FROM archivos_tecnicos WHERE id_archivo = $1', [idArchivo]);
