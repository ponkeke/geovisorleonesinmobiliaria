// Parámetros de validación de polígonos (reglas R1-R4). Todo se lee del entorno en cada llamada;
// los valores por defecto están aquí y documentados en .env.example.
const num = (v, def) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : def);

// Franja (ancho total, en metros) que ocupa cada tipo de vía alrededor de su eje OSM.
// Los tipos no listados (footway, path, steps, ...) no se consideran. Formato: "tipo:metros,tipo:metros".
const ANCHOS_POR_DEFECTO = 'primary:12,secondary:10,tertiary:8,residential:6,unclassified:5,service:4';

function anchosVias(texto) {
  const out = {};
  for (const par of String(texto || ANCHOS_POR_DEFECTO).split(',')) {
    const [tipo, m] = par.split(':').map((x) => x.trim());
    if (tipo && Number(m) > 0) out[tipo] = Number(m);
  }
  return Object.keys(out).length ? out : anchosVias(ANCHOS_POR_DEFECTO);
}

const opciones = () => ({
  minAreaM2: num(process.env.MIN_AREA_M2, 30),
  minAnchoM: num(process.env.MIN_ANCHO_M, 3),
  compacidadMin: num(process.env.COMPACIDAD_MIN, 0.1),          // 4πA/P², alternativa si no hay ST_MaximumInscribedCircle
  colinealEpsilon: num(process.env.COLINEAL_EPSILON_GRADOS2, 1e-14), // área plana (grados²) bajo la cual la figura es una línea
  viaSuperposicionMaxPct: num(process.env.VIA_SUPERPOSICION_MAX_PCT, 10),
  traslapeMaxPct: num(process.env.TRASLAPE_MAX_PCT, 20),
  validarVias: String(process.env.VALIDAR_VIAS ?? 'true').toLowerCase() !== 'false',
  anchosVias: anchosVias(process.env.VIAS_ANCHOS_M),
  viasDiasCache: num(process.env.VIAS_DIAS_CACHE, 30),
  viasMargenM: num(process.env.VIAS_MARGEN_M, 100),             // zona alrededor del polígono para cargar vías
  maxBytes: num(process.env.VALIDAR_MAX_BYTES, 51200),
  maxVertices: num(process.env.VALIDAR_MAX_VERTICES, 500),
  rateMax: num(process.env.VALIDAR_RATE_MAX, 30),
  rateVentanaMs: num(process.env.VALIDAR_RATE_VENTANA_MS, 60000),
});

module.exports = { opciones };
