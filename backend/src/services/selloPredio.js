const crypto = require('crypto');

// «Sello» de un predio del catastro: firma (HMAC) del contorno que el servidor entregó al oferente. Al enviar la oferta se
// comprueba, así el contorno solo puede ser un predio real elegido en el mapa y no uno inventado o modificado.
// Vence a los SELLO_MINUTOS (por defecto 120) para que no se reutilicen indefinidamente.
const minutos = () => {
  const n = Number(process.env.SELLO_MINUTOS);
  return Number.isFinite(n) && n > 0 ? n : 120;
};
const clave = () => process.env.SELLO_SECRETO || process.env.JWT_SECRET || '';

const firmar = (t, coordenadas) =>
  crypto.createHmac('sha256', clave()).update(`${t}|${JSON.stringify(coordenadas)}`).digest('hex');

exports.sellar = (poligono) => {
  const t = Date.now();
  return `${t}.${firmar(t, poligono.coordinates)}`;
};

// true si el sello corresponde exactamente a estas coordenadas y no ha vencido.
exports.verificar = (poligono, sello) => {
  if (!clave() || typeof sello !== 'string' || !Array.isArray(poligono?.coordinates)) return false;
  const [tTxt, hex] = sello.split('.');
  const t = Number(tTxt);
  if (!Number.isFinite(t) || !/^[0-9a-f]{64}$/.test(hex || '')) return false;
  const edad = Date.now() - t;
  if (edad < 0 || edad > minutos() * 60000) return false;
  const esperado = Buffer.from(firmar(t, poligono.coordinates), 'hex');
  const recibido = Buffer.from(hex, 'hex');
  return esperado.length === recibido.length && crypto.timingSafeEqual(esperado, recibido);
};
