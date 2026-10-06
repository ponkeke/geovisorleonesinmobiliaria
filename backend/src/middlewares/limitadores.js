const crear = require('./rateLimit');

// Limitadores compartidos (exportados para poder reiniciarlos en pruebas).
exports.validarPoligono = crear();
