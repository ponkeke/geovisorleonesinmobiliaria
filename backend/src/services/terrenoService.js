const terrenoModel = require('../models/terrenoModel');
const viabilidad = require('./viabilidadService');

const RUTAS = ['partida registral', 'desmembramiento', 'prescripción adquisitiva'];
const num = (v) => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0;

async function getTerrenoOr404(id) {
  if (!/^\d+$/.test(String(id)) || Number(id) > 2147483647) {
    throw { status: 400, message: 'Identificador de terreno inválido' };
  }
  const t = await terrenoModel.findById(id);
  if (!t) throw { status: 404, message: 'Terreno no encontrado' };
  return t;
}

exports.getTerrenoOr404 = getTerrenoOr404;

exports.listar = () => terrenoModel.listOrdered();

exports.detalle = async (id) => {
  const terreno = await getTerrenoOr404(id);
  const [criterios_tecnicos, situacion_legal, informacion_financiera, puntaje, decision] = await Promise.all([
    terrenoModel.latestCriterios(id),
    terrenoModel.latestLegal(id),
    terrenoModel.latestFinanciera(id),
    terrenoModel.latestPuntaje(id),
    terrenoModel.latestDecision(id),
  ]);
  return { ...terreno, criterios_tecnicos, situacion_legal, informacion_financiera, puntaje, decision };
};

// Calcula y guarda el puntaje. Falla (400) si falta alguno de los 3 criterios.
async function calcularViabilidad(id) {
  const terreno = await getTerrenoOr404(id);
  const [criterios, legal, financiera] = await Promise.all([
    terrenoModel.latestCriterios(id),
    terrenoModel.latestLegal(id),
    terrenoModel.latestFinanciera(id),
  ]);
  const faltan = [];
  if (!criterios) faltan.push('criterios técnicos');
  if (!legal) faltan.push('situación legal');
  if (!financiera) faltan.push('información financiera');
  if (faltan.length) throw { status: 400, message: `Faltan: ${faltan.join(', ')}` };

  const { total, detalle } = viabilidad.calcular({ criterios, legal, financiera, area: terreno.area });
  return terrenoModel.insertPuntaje(id, total, detalle);
}
exports.calcularViabilidad = calcularViabilidad;

// Tras registrar un criterio, si ya están los 3 se calcula automáticamente.
async function autoCalcular(id) {
  const [c, l, f] = await Promise.all([
    terrenoModel.latestCriterios(id), terrenoModel.latestLegal(id), terrenoModel.latestFinanciera(id),
  ]);
  return c && l && f ? calcularViabilidad(id) : null;
}

// Un terreno con decisión registrada queda cerrado: no admite más criterios.
async function getAbiertoOr409(id) {
  const t = await getTerrenoOr404(id);
  if (t.estado !== 'en_evaluacion') {
    throw { status: 409, message: 'Este terreno ya tiene una decisión registrada' };
  }
  return t;
}

exports.registrarCriteriosTecnicos = async (id, b, user) => {
  await getAbiertoOr409(id);
  if (!num(b.distancia_via_principal) || typeof b.compatibilidad_normativa !== 'boolean') {
    throw { status: 400, message: 'distancia_via_principal (número ≥ 0) y compatibilidad_normativa (booleano) requeridos' };
  }
  const registro = await terrenoModel.insertCriterios(id, b, user.id);
  return { registro, puntaje: await autoCalcular(id) };
};

exports.registrarSituacionLegal = async (id, b, user) => {
  await getAbiertoOr409(id);
  if (!RUTAS.includes(b.ruta_legal)) {
    throw { status: 400, message: `ruta_legal debe ser una de: ${RUTAS.join(', ')}` };
  }
  const registro = await terrenoModel.insertLegal(id, b, user.id);
  return { registro, puntaje: await autoCalcular(id) };
};

exports.registrarInformacionFinanciera = async (id, b, user) => {
  await getAbiertoOr409(id);
  if (!num(b.precio_ofertado) || (b.costos_adquisicion !== undefined && !num(b.costos_adquisicion))) {
    throw { status: 400, message: 'precio_ofertado y costos_adquisicion deben ser números ≥ 0' };
  }
  const registro = await terrenoModel.insertFinanciera(id, b, user.id);
  return { registro, puntaje: await autoCalcular(id) };
};

exports.registrarDecision = async (id, b, user) => {
  const terreno = await getTerrenoOr404(id);
  if (!['aprobado', 'descartado'].includes(b.resultado)) {
    throw { status: 400, message: 'resultado debe ser "aprobado" o "descartado"' };
  }
  if (terreno.estado !== 'en_evaluacion') {
    throw { status: 409, message: 'Este terreno ya tiene una decisión registrada' };
  }
  if (!(await terrenoModel.latestPuntaje(id))) {
    throw { status: 400, message: 'Calcule la viabilidad antes de decidir' };
  }
  return terrenoModel.insertDecision(id, b.resultado, b.observaciones, user.id);
};
