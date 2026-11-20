// Levantamiento topográfico: lectura de vértices pegados y medidas planas (UTM), las mismas que calcula el servidor.
export const DATUMS = { WGS84: 'WGS84 / SIRGAS', PSAD56: 'PSAD56' };
export const ZONAS = [17, 18, 19];   // UTM, hemisferio sur (Perú)
export const FILA_VACIA = { este: '', norte: '', distancia: '' };

const aNumero = (t) => {
  const s = String(t ?? '').trim().replace(/\s/g, '').replace(',', '.');
  return s !== '' && Number.isFinite(Number(s)) ? Number(s) : null;
};

// Texto pegado desde Excel, CSV o una lista: una fila por vértice con Este, Norte y, si viene, la distancia al siguiente.
// Una etiqueta inicial (V1, 1…) y la fila de títulos se ignoran. Devuelve { filas, errores }.
export function leerVertices(texto) {
  const filas = [];
  const errores = [];
  texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((linea, i) => {
    const celdas = linea.split(/[\t;]/.test(linea) ? /[\t;]+/ : /[,\s]+/).map((c) => c.trim()).filter(Boolean);
    let n = celdas.map(aNumero);
    if (n.every((x) => x === null)) return;   // fila de títulos
    if (n[0] === null || (n.length >= 3 && n[0] < 100000 && n[1] >= 100000)) n = n.slice(1);   // etiqueta del vértice
    if (n[0] === null || n[1] === null) { errores.push(`Fila ${i + 1}: se esperaban Este y Norte`); return; }
    filas.push({ este: String(n[0]), norte: String(n[1]), distancia: n[2] === null || n[2] === undefined ? '' : String(n[2]) });
  });
  return { filas, errores };
}

// Área (fórmula del topógrafo) y perímetro de las filas completas; null si faltan vértices.
export function medirLocal(filas) {
  const p = filas.map((f) => [aNumero(f.este), aNumero(f.norte)]).filter(([e, n]) => e !== null && n !== null);
  if (p.length < 3) return null;
  let doble = 0;
  let perimetro = 0;
  p.forEach(([e, n], i) => {
    const [e2, n2] = p[(i + 1) % p.length];
    doble += e * n2 - e2 * n;
    perimetro += Math.hypot(e2 - e, n2 - n);
  });
  return { area: Math.abs(doble) / 2, perimetro };
}

export const numero = aNumero;

// Zona UTM sugerida por la longitud del terreno dibujado (17, 18 o 19 Sur).
export function zonaSugerida(geometria) {
  const lng = geometria?.coordinates?.[0]?.[0]?.[0];
  if (!Number.isFinite(lng)) return 18;
  return Math.min(19, Math.max(17, Math.floor((lng + 180) / 6) + 1));
}

export const formatNum = (n, d = 2) =>
  Number(n).toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d });
