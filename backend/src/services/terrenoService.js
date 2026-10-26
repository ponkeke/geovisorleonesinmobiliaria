const terrenoModel = require('../models/terrenoModel');
const viabilidad = require('./viabilidadService');
const archivoModel = require('../models/archivoModel');

const RUTAS = ['partida registral', 'desmembramiento', 'prescripción adquisitiva'];
const TIPOS_VIA = ['avenida', 'jiron', 'calle', 'pasaje', 'trocha'];
const SUPERFICIES = ['asfaltada', 'afirmada', 'trocha'];
const SERVICIOS = ['agua', 'desague', 'luz', 'internet', 'gas'];
const OBSERVACIONES_MAX = 1000;
const ESTADOS_TRAMITE = ['no iniciado', 'en trámite', 'observado', 'inscrito'];
const CARGAS = ['hipoteca', 'embargo', 'anotacion_preventiva', 'litigio', 'servidumbre'];
const DOCUMENTOS = ['partida', 'gravamenes', 'predial', 'parametros', 'catastral'];
const COSTOS = ['notaria', 'registral', 'impuestos', 'tasacion', 'saneamiento', 'comision', 'otros'];
const MONTO_MAX = 1e12;   // cabe en NUMERIC(14,2)
const bad = (message) => ({ status: 400, message });
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

// FeatureCollection pública con el contorno de cada terreno registrado, sin propiedades.
exports.contornosPublicos = async () => ({
  type: 'FeatureCollection',
  features: (await terrenoModel.contornos()).map((r) => ({ type: 'Feature', properties: {}, geometry: r.geometry })),
});

exports.detalle = async (id) => {
  const terreno = await getTerrenoOr404(id);
  const [criterios_tecnicos, situacion_legal, informacion_financiera, puntaje, decision, archivos] = await Promise.all([
    terrenoModel.latestCriterios(id),
    terrenoModel.latestLegal(id),
    terrenoModel.latestFinanciera(id),
    terrenoModel.latestPuntaje(id),
    terrenoModel.latestDecision(id),
    archivoModel.listar(id),
  ]);
  return { ...terreno, criterios_tecnicos, situacion_legal, informacion_financiera, puntaje, decision, archivos, referencia_precio_m2: viabilidad.referenciaPrecioM2() };
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

// Datos opcionales de la revisión técnica (acceso, servicios, visita). Devuelve las columnas listas para guardar.
function detalleTecnico(b) {
  const texto = (v) => (v === undefined || v === null ? '' : String(v).trim());
  const lista = (campo, valores, nombre) => {
    const v = texto(b[campo]);
    if (v && !valores.includes(v)) throw bad(`${nombre} no válido`);
    return v || null;
  };
  const nombreVia = texto(b.nombre_via_acceso);
  if (nombreVia.length > 200) throw bad('El nombre de la vía es demasiado largo (máximo 200 caracteres)');
  const observaciones = texto(b.observaciones);
  if (observaciones.length > OBSERVACIONES_MAX) throw bad(`Las observaciones superan ${OBSERVACIONES_MAX} caracteres`);
  const fecha = texto(b.fecha_visita);
  if (fecha) {
    const d = new Date(`${fecha}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== fecha) {
      throw bad('La fecha de visita no es válida (AAAA-MM-DD)');
    }
    if (d.getTime() > Date.now() + 24 * 3600 * 1000) throw bad('La fecha de visita no puede ser futura');
  }
  const servicios = b.servicios && typeof b.servicios === 'object' ? b.servicios : {};
  const out = {
    tipo_via_acceso: lista('tipo_via_acceso', TIPOS_VIA, 'El tipo de vía'),
    nombre_via_acceso: nombreVia || null,
    superficie_via: lista('superficie_via', SUPERFICIES, 'La superficie de la vía'),
    fecha_visita: fecha || null,
    observaciones: observaciones || null,
  };
  for (const s of SERVICIOS) out[`servicio_${s}`] = servicios[s] === true;
  return out;
}

exports.getAbiertoOr409 = getAbiertoOr409;

// Fecha AAAA-MM-DD válida y no futura (con un día de margen por la zona horaria); devuelve el texto o null.
function fechaOpcional(valor, nombre) {
  const fecha = valor === undefined || valor === null ? '' : String(valor).trim();
  if (!fecha) return null;
  const d = new Date(`${fecha}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== fecha) {
    throw bad(`${nombre} no es válida (AAAA-MM-DD)`);
  }
  if (d.getTime() > Date.now() + 24 * 3600 * 1000) throw bad(`${nombre} no puede ser futura`);
  return fecha;
}

// Datos opcionales de la situación legal (partida, titularidad, cargas, trámite, documentos, revisión). Solo informativos.
function detalleLegal(b) {
  const texto = (v, max, nombre) => {
    const t = v === undefined || v === null ? '' : String(v).trim();
    if (t.length > max) throw bad(`${nombre} es demasiado largo (máximo ${max} caracteres)`);
    return t || null;
  };
  const estado = texto(b.estado_tramite, 60, 'El estado del trámite');
  if (estado && !ESTADOS_TRAMITE.includes(estado)) throw bad(`El estado del trámite debe ser uno de: ${ESTADOS_TRAMITE.join(', ')}`);
  const titularCoincide = b.titular_coincide === true || b.titular_coincide === false ? b.titular_coincide : null;
  const cargas = b.cargas && typeof b.cargas === 'object' ? b.cargas : {};
  const docs = b.documentos && typeof b.documentos === 'object' ? b.documentos : {};
  const out = {
    estado_tramite: estado,
    fecha_estado_tramite: fechaOpcional(b.fecha_estado_tramite, 'La fecha del trámite'),
    numero_partida: texto(b.numero_partida, 40, 'El número de partida'),
    oficina_registral: texto(b.oficina_registral, 100, 'La oficina registral'),
    titular_registral: texto(b.titular_registral, 200, 'El titular registral'),
    titular_coincide: titularCoincide,
    hay_copropietarios: b.hay_copropietarios === true,
    requiere_consentimiento_conyuge: b.requiere_consentimiento_conyuge === true,
    hay_representante_poder: b.hay_representante_poder === true,
    detalle_cargas: texto(b.detalle_cargas, OBSERVACIONES_MAX, 'El detalle de cargas'),
    fecha_revision: fechaOpcional(b.fecha_revision, 'La fecha de revisión'),
    observaciones: texto(b.observaciones, OBSERVACIONES_MAX, 'Las observaciones'),
  };
  for (const c of CARGAS) out[`carga_${c}`] = cargas[c] === true;
  for (const d of DOCUMENTOS) out[`doc_${d}`] = docs[d] === true;
  return out;
}

exports.registrarCriteriosTecnicos = async (id, b, user) => {
  await getAbiertoOr409(id);
  if (!num(b.distancia_via_principal) || typeof b.compatibilidad_normativa !== 'boolean') {
    throw { status: 400, message: 'distancia_via_principal (número ≥ 0) y compatibilidad_normativa (booleano) requeridos' };
  }
  const registro = await terrenoModel.insertCriterios(id, { ...b, ...detalleTecnico(b) }, user.id);
  return { registro, puntaje: await autoCalcular(id) };
};

exports.registrarSituacionLegal = async (id, b, user) => {
  await getAbiertoOr409(id);
  if (!RUTAS.includes(b.ruta_legal)) {
    throw { status: 400, message: `ruta_legal debe ser una de: ${RUTAS.join(', ')}` };
  }
  const registro = await terrenoModel.insertLegal(id, { ruta_legal: b.ruta_legal, ...detalleLegal(b) }, user.id);
  return { registro, puntaje: await autoCalcular(id) };
};

// Costos de adquisición: si llega el desglose (desglose_costos), el total es su suma; si no, se usa costos_adquisicion.
// Observaciones y fecha de revisión son opcionales.
function detalleFinanciero(b) {
  const monto = (v, nombre) => {
    if (v === undefined || v === null || v === '') return 0;
    if (!num(v) || Number(v) > MONTO_MAX) throw bad(`${nombre} debe ser un número ≥ 0`);
    return Math.round(Number(v) * 100) / 100;
  };
  const out = {};
  if (b.desglose_costos && typeof b.desglose_costos === 'object') {
    let total = 0;
    for (const c of COSTOS) { out[`costo_${c}`] = monto(b.desglose_costos[c], `El costo de ${c}`); total += out[`costo_${c}`]; }
    out.costos_adquisicion = Math.round(total * 100) / 100;
  } else {
    out.costos_adquisicion = monto(b.costos_adquisicion, 'costos_adquisicion');
  }
  const observaciones = b.observaciones === undefined || b.observaciones === null ? '' : String(b.observaciones).trim();
  if (observaciones.length > OBSERVACIONES_MAX) throw bad(`Las observaciones superan ${OBSERVACIONES_MAX} caracteres`);
  out.observaciones = observaciones || null;
  out.fecha_revision = fechaOpcional(b.fecha_revision, 'La fecha de revisión');
  return out;
}

exports.registrarInformacionFinanciera = async (id, b, user) => {
  await getAbiertoOr409(id);
  if (!num(b.precio_ofertado) || Number(b.precio_ofertado) > MONTO_MAX || (b.costos_adquisicion !== undefined && !num(b.costos_adquisicion))) {
    throw { status: 400, message: 'precio_ofertado y costos_adquisicion deben ser números ≥ 0' };
  }
  const registro = await terrenoModel.insertFinanciera(id, { precio_ofertado: b.precio_ofertado, ...detalleFinanciero(b) }, user.id);
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
