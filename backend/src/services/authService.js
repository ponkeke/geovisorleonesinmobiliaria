const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const usuarioModel = require('../models/usuarioModel');

exports.login = async (correo, password) => {
  if (!correo || !password) throw { status: 400, message: 'Correo y contraseña requeridos' };
  const user = await usuarioModel.findByCorreo(correo);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw { status: 401, message: 'Credenciales inválidas' };
  }
  const token = jwt.sign(
    { id: user.id_usuario, rol: user.rol, nombre: user.nombre },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
  return { token, usuario: { id: user.id_usuario, nombre: user.nombre, correo: user.correo, rol: user.rol } };
};
