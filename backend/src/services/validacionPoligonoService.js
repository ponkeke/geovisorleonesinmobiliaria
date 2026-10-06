const { opciones } = require('../config/validacionPoligono');
const poligonoModel = require('../models/poligonoModel');
const viaModel = require('../models/viaOsmModel');
const overpass = require('./overpassService');

const bad = (message) => ({ status: 400, campo: 'poligono', message });
const r1 = (n) => Math.round(n * 10) / 10;
const GRADOS_POR_METRO = 1 / 110000;

// Estructura del GeoJSON (lo que no es un polígono utilizable es un 400, no un error de regla).
function extraer(input, maxVertices) {
  if (!input || typeof input !== 'object') throw bad('Debe dibujar el polígono del terreno');
  const g = input.type === 'Feature' ? input.geometry : input;
  if (!g || g.type !== 'Polygon' || !Array.isArray(g.coordinates) || !Array.isArray(g.coordinates[0])) {
    throw bad('La geometría debe ser un único polígono');
  }
  let total = 0;
  for (const ring of g.coordinates) {
    if (!Array.isArray(ring)) throw bad('La geometría debe ser un único polígono');
    total += ring.length;
    for (const p of ring) {
      const [lng, lat] = Array.isArray(p) ? p : [];
      if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) {
        throw bad('El polígono tiene coordenadas fuera de rango');
      }
    }
  }
  if (total > maxVertices) throw bad(`El polígono tiene demasiados vértices (máximo ${maxVertices})`);
  return { type: 'Polygon', coordinates: g.coordinates };
}

// Vértices distintos del anillo exterior y mayor "área" del triángulo que forman con los dos primeros
// (grados²): ~0 si todos los puntos son colineales. No usa el área con signo (un lazo cruzado la anula).
function formaPlana(ring) {
  const unicos = [...new Map(ring.map((p) => [`${p[0]},${p[1]}`, p])).values()];
  let maxArea = 0;
  if (unicos.length >= 3) {
    const [p0, p1] = unicos;
    for (const p of unicos.slice(2)) {
      const cruz = (p1[0] - p0[0]) * (p[1] - p0[1]) - (p1[1] - p0[1]) * (p[0] - p0[0]);
      maxArea = Math.max(maxArea, Math.abs(cruz) / 2);
    }
  }
  return { distintos: unicos.length, areaPlana: maxArea };
}

const caja = (g) => {
  const xs = g.coordinates[0].map((p) => p[0]);
  const ys = g.coordinates[0].map((p) => p[1]);
  return [Math.min(...ys), Math.min(...xs), Math.max(...ys), Math.max(...xs)]; // sur, oeste, norte, este
};

// Garantiza vías recientes en caché para la zona; devuelve true si hay datos utilizables.
// Si Overpass falla no lanza: registra y devuelve false (no se bloquea al usuario).
async function asegurarVias(geom, o) {
  const margen = o.viasMargenM * GRADOS_POR_METRO;
  try {
    if (!(await viaModel.hayRecientes(geom, margen, o.viasDiasCache))) {
      const [sur, oeste, norte, este] = caja(geom);
      const c = overpass.cajaConRadio({ sur, oeste, norte, este }, o.viasMargenM);
      await viaModel.upsert(await overpass.buscarVias(c, Object.keys(o.anchosVias)));
    }
    return await viaModel.hayRecientes(geom, margen, o.viasDiasCache);
  } catch (e) {
    console.error('Validación de vías omitida (no se pudo consultar OpenStreetMap):', e.message);
    return false;
  }
}

// Reglas R1-R4. Devuelve { valido, errores:[{regla, mensaje}], avisos:[string], geometriaProblema? }.
// R1 degenerado/pequeño/angosto, R2 auto-intersección, R3 invade una vía, R4 se superpone con otro terreno.
exports.validar = async (input) => {
  const o = opciones();
  const geom = extraer(input, o.maxVertices);
  const errores = [];
  const avisos = [];
  const problemas = [];
  const resultado = () => ({
    valido: errores.length === 0,
    errores,
    avisos,
    ...(problemas.length && { geometriaProblema: problemas.length === 1 ? problemas[0] : { type: 'GeometryCollection', geometries: problemas } }),
  });

  // R1 (forma): menos de 3 vértices distintos o puntos colineales (el contorno es una línea).
  const { distintos, areaPlana } = formaPlana(geom.coordinates[0]);
  if (distintos < 3 || areaPlana <= o.colinealEpsilon) {
    errores.push({ regla: 'R1', mensaje: 'El contorno es una línea o tiene muy pocas esquinas. Dibuje un terreno con al menos 3 esquinas que formen una superficie.' });
    problemas.push(geom);
    return resultado();
  }
  const [a, b] = [geom.coordinates[0][0], geom.coordinates[0][geom.coordinates[0].length - 1]];
  if (a[0] !== b[0] || a[1] !== b[1]) throw bad('El anillo del polígono no está cerrado');

  // R2: topología (ST_IsValid).
  const base = await poligonoModel.basico(geom);
  if (!base.valido) {
    const cruce = /Self-intersection/.test(base.motivo);
    errores.push({ regla: 'R2', mensaje: cruce
      ? 'Los lados del contorno se cruzan entre sí. Redibújelo sin cruzar líneas.'
      : `El contorno no es válido (${base.motivo}). Redibújelo.` });
    if (base.punto_defecto) problemas.push(base.punto_defecto);
    return resultado();
  }

  // R1 (tamaño): área mínima y ancho útil mínimo.
  if (base.area < o.minAreaM2) {
    errores.push({ regla: 'R1', mensaje: `El terreno es demasiado pequeño (${r1(base.area)} m²). El mínimo es ${o.minAreaM2} m².` });
  } else {
    const ancho = await poligonoModel.anchoUtil(geom);
    if (ancho !== null && ancho < o.minAnchoM) {
      errores.push({ regla: 'R1', mensaje: `El terreno es demasiado angosto (ancho útil ${r1(ancho)} m). El mínimo es ${o.minAnchoM} m.` });
    } else if (ancho === null && (4 * Math.PI * base.area) / (base.perimetro ** 2) < o.compacidadMin) {
      errores.push({ regla: 'R1', mensaje: 'El terreno es demasiado alargado y angosto. Revise el contorno.' });
    }
  }
  if (errores.length) { problemas.push(geom); return resultado(); }

  // R3: superposición con vías de OpenStreetMap (si no se puede verificar, se acepta con aviso).
  if (o.validarVias) {
    if (await asegurarVias(geom, o)) {
      const sup = await poligonoModel.superposicionVias(geom, o.anchosVias, o.viasMargenM * GRADOS_POR_METRO, o.viasDiasCache);
      const pct = (sup.area_m2 / base.area) * 100;
      if (pct > o.viaSuperposicionMaxPct) {
        errores.push({ regla: 'R3', mensaje: `El terreno invade una vía (pista o calle) en un ${r1(pct)} % de su área. Ajuste el contorno para que solo toque la calle de frente.` });
        if (sup.zona) problemas.push(sup.zona);
      }
    } else {
      avisos.push('No se pudo verificar si el terreno invade alguna vía.');
    }
  }

  // R4: superposición con otro terreno ya registrado.
  const traslapes = await poligonoModel.traslapes(geom);
  const grave = traslapes.filter((t) => t.pct > o.traslapeMaxPct);
  if (grave.length) {
    errores.push({ regla: 'R4', mensaje: 'Este terreno se superpone con otro ya registrado.' });
    for (const t of grave) if (t.zona) problemas.push(t.zona);
  }
  return resultado();
};

exports.extraer = extraer;
