const levantamientoModel = require('../models/levantamientoModel');
const { getAbiertoOr409, fechaOpcional } = require('./terrenoService');
const { verificar } = require('./verificacionLevantamiento');

// EPSG = base del datum + zona (hemisferio sur): WGS84 / UTM 17S = 32717, PSAD56 / UTM 17S = 24877.
const EPSG_BASE = { WGS84: 32700, PSAD56: 24860 };
const ZONAS = [17, 18, 19];
const MIN_VERTICES = 3;
const MAX_VERTICES = 200;
const DESPLAZAMIENTO_AVISO_M = 150;    // más que un dibujo a mano: suele ser datum o zona equivocados
const DESPLAZAMIENTO_MAX_M = 1000;     // no puede ser el terreno que se ubicó en el mapa
const MONTO_MAX = 1e9;
const OBSERVACIONES_MAX = 1000;

const bad = (message, campo = 'levantamiento') => ({ status: 400, campo, message });
const r2 = (n) => Math.round(n * 100) / 100;

const numero = (v) => ((typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v)) ? Number(v) : null);

function texto(v, max, nombre) {
  const t = v === undefined || v === null ? '' : String(v).trim();
  if (t.length > max) throw bad(`${nombre} es demasiado largo (máximo ${max} caracteres)`);
  return t || null;
}

function positivo(v, nombre) {
  if (v === undefined || v === null || v === '') return null;
  const n = numero(v);
  if (n === null || n <= 0 || n > MONTO_MAX) throw bad(`${nombre} debe ser un número mayor que 0`);
  return r2(n);
}

// Vértices en el orden del plano. Si el último repite al primero (anillo cerrado) se descarta.
// Devuelve [{ este, norte, distancia_plano }] (distancia_plano = lado hasta el vértice siguiente, si el plano la trae).
function leerVertices(entrada) {
  if (!Array.isArray(entrada)) throw bad('Ingrese los vértices del plano (Este y Norte de cada uno)');
  const v = entrada.map((p, i) => {
    const este = numero(p?.este);
    const norte = numero(p?.norte);
    if (este === null || norte === null) throw bad(`El vértice V${i + 1} necesita Este y Norte numéricos`);
    if (este < 100000 || este > 900000 || norte <= 0 || norte >= 10000000) {
      throw bad(`El vértice V${i + 1} está fuera del rango UTM (Este 100 000–900 000, Norte 0–10 000 000)`);
    }
    const traeDistancia = p.distancia_plano !== undefined && p.distancia_plano !== null && p.distancia_plano !== '';
    const dist = traeDistancia ? numero(p.distancia_plano) : null;
    if (traeDistancia && (dist === null || dist <= 0)) throw bad(`La distancia del lado V${i + 1} debe ser un número mayor que 0`);
    return { este, norte, distancia_plano: dist === null ? null : r2(dist) };
  });
  const a = v[0];
  const z = v[v.length - 1];
  if (v.length > 1 && a.este === z.este && a.norte === z.norte) v.pop();
  if (v.length < MIN_VERTICES) throw bad(`Se necesitan al menos ${MIN_VERTICES} vértices distintos`);
  if (v.length > MAX_VERTICES) throw bad(`Demasiados vértices (máximo ${MAX_VERTICES})`);
  v.forEach((p, i) => {
    const s = v[(i + 1) % v.length];
    if (p.este === s.este && p.norte === s.norte) throw bad(`Los vértices V${i + 1} y V${(i + 1) % v.length + 1} tienen las mismas coordenadas`);
  });
  return v;
}

exports.registrar = async (id, b, user) => {
  await getAbiertoOr409(id);
  const datum = b.datum === undefined ? 'WGS84' : b.datum;
  if (!Object.hasOwn(EPSG_BASE, datum)) throw bad(`El datum debe ser uno de: ${Object.keys(EPSG_BASE).join(', ')}`, 'datum');
  const zona = numero(b.zona_utm);
  if (!ZONAS.includes(zona)) throw bad(`La zona UTM debe ser una de: ${ZONAS.join(', ')} (hemisferio sur)`, 'zona_utm');
  const epsg = EPSG_BASE[datum] + zona;

  const tolerancia = b.tolerancia_pct === undefined || b.tolerancia_pct === null || b.tolerancia_pct === '' ? 0.5 : numero(b.tolerancia_pct);
  if (tolerancia === null || tolerancia < 0 || tolerancia > 100) throw bad('La tolerancia debe estar entre 0 y 100 %', 'tolerancia_pct');

  const sinCalcular = leerVertices(b.vertices);
  const wkt = `POLYGON((${[...sinCalcular, sinCalcular[0]].map((p) => `${p.este} ${p.norte}`).join(',')}))`;
  const m = await levantamientoModel.medir(wkt, epsg, id);
  if (!m.valido) {
    throw bad(/Self-intersection/.test(m.motivo)
      ? 'Los lados del polígono se cruzan. Revise que los vértices sigan el contorno del terreno, en orden.'
      : `El polígono no es válido (${m.motivo}). Revise los vértices.`, 'vertices');
  }
  if (!(m.area_utm > 0)) throw bad('El polígono no tiene área', 'vertices');
  if (m.desplazamiento_m !== null && m.desplazamiento_m > DESPLAZAMIENTO_MAX_M) {
    throw bad(`Las coordenadas quedan a ${r2(m.desplazamiento_m / 1000)} km del terreno ubicado en el mapa. Revise el datum y la zona UTM.`, 'zona_utm');
  }
  const avisos = [];
  if (m.desplazamiento_m !== null && m.desplazamiento_m > DESPLAZAMIENTO_AVISO_M) {
    avisos.push(`El levantamiento queda a ${Math.round(m.desplazamiento_m)} m del dibujo del propietario. Confirme que el datum y la zona UTM sean los del plano.`);
  }

  const vertices = sinCalcular.map((p, i) => {
    const s = sinCalcular[(i + 1) % sinCalcular.length];
    return { ...p, distancia_calculada: r2(Math.hypot(s.este - p.este, s.norte - p.norte)) };
  });
  await levantamientoModel.insert(id, {
    datum, zona_utm: zona, epsg, vertices, wkt,
    area_utm: m.area_utm, perimetro_utm: m.perimetro_utm, area_geodesica: m.area_geodesica,
    area_declarada: positivo(b.area_declarada, 'El área declarada'),
    perimetro_declarado: positivo(b.perimetro_declarado, 'El perímetro declarado'),
    tolerancia_pct: r2(tolerancia),
    desplazamiento_m: m.desplazamiento_m === null ? null : Math.round(m.desplazamiento_m * 10) / 10,
    fecha_levantamiento: fechaOpcional(b.fecha_levantamiento, 'La fecha del levantamiento'),
    ingeniero: texto(b.ingeniero, 200, 'El nombre del ingeniero'),
    cip: texto(b.cip, 30, 'El número de colegiatura'),
    observaciones: texto(b.observaciones, OBSERVACIONES_MAX, 'Las observaciones'),
  }, user.id);
  return { registro: verificar(await levantamientoModel.latest(id)), avisos };
};
