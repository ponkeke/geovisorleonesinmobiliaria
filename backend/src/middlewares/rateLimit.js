const { opciones } = require('../config/validacionPoligono');

// Límite básico en memoria por IP (ventana fija). Suficiente para un único proceso; con varias
// instancias haría falta un almacén compartido. Los valores se leen del entorno en cada petición.
module.exports = () => {
  const golpes = new Map(); // ip -> { desde, n }
  const mw = (req, res, next) => {
    const { rateMax, rateVentanaMs } = opciones();
    const ahora = Date.now();
    for (const [ip, g] of golpes) if (ahora - g.desde >= rateVentanaMs) golpes.delete(ip);
    const g = golpes.get(req.ip) || { desde: ahora, n: 0 };
    g.n += 1;
    golpes.set(req.ip, g);
    if (g.n > rateMax) {
      res.set('Retry-After', String(Math.ceil((g.desde + rateVentanaMs - ahora) / 1000)));
      return res.status(429).json({ error: 'Demasiadas solicitudes. Espere un momento e intente de nuevo.' });
    }
    return next();
  };
  mw.reset = () => golpes.clear();
  return mw;
};
