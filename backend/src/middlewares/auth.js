const jwt = require('jsonwebtoken');

// Exige un JWT válido en "Authorization: Bearer <token>".
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// Exige que el rol del usuario esté entre los permitidos.
const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.rol)
    ? next()
    : res.status(403).json({ error: 'Rol sin permiso para esta acción' });

module.exports = { requireAuth, requireRole };
