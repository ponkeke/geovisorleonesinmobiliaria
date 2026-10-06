const pool = require('../config/db');

exports.findByCorreo = async (correo) =>
  (await pool.query('SELECT * FROM usuarios WHERE correo = $1', [correo])).rows[0];
