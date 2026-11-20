const { opciones, ROLES_ADJUDICATARIO } = require('../config/catastro');
const selloPredio = require('./selloPredio');
const fs = require('fs');
const path = require('path');
const tls = require('tls');
const { Agent } = require('undici');

// El servidor de MIDAGRI (georural.midagri.gob.pe) no envía su certificado intermedio (Thawte TLS RSA CA G1, firmado por
// DigiCert Global Root G2): navegadores y curl lo completan solos, pero Node falla con «unable to verify the first certificate».
// Se agrega ese intermedio público (config/certs) a las raíces habituales SOLO para las consultas a ese servicio; la
// verificación del certificado sigue activa. Vence el 2 de noviembre de 2027: si MIDAGRI cambia de emisor, reemplazar el archivo.
let agenteRural;
const agenteMidagri = () => {
  if (!agenteRural) {
    const intermedio = fs.readFileSync(path.join(__dirname, '../config/certs/thawte-tls-rsa-ca-g1.pem'), 'utf8');
    agenteRural = new Agent({ connect: { ca: [...tls.rootCertificates, intermedio] } });
  }
  return agenteRural;
};

const bad = (message, status = 400) => ({ status, message });

// Perú continental: evita consultas absurdas al servicio externo.
const LNG = [-82, -68];
const LAT = [-19, 0.5];

const coordenada = (v, [min, max], nombre) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) throw bad(`${nombre} no es válida`);
  return n;
};

const texto = (v) => {
  const t = v === undefined || v === null ? '' : String(v).replace(/\s+/g, ' ').trim();
  return t === '' ? null : t;
};
// El servicio usa marcadores como «-» o «.» cuando no hay adjudicatario: sin letras no es un nombre.
const nombre = (v) => {
  const t = texto(v);
  return t && /\p{L}/u.test(t) ? t : null;
};
const numero = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
};

// Consulta una capa del servicio por un punto (WGS84) y devuelve el primer elemento { attributes, geometry } o null.
// COFOPRI convierte de PSAD56 por su cuenta. `where` filtra (p. ej. solo Junín); con `geometria` trae también el contorno.
async function consultarElemento(base, capa, lng, lat, campos, timeoutMs, { geometria = false, where, dispatcher } = {}) {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: campos.join(','), returnGeometry: String(geometria), f: 'json',
    ...(geometria && { outSR: '4326', geometryPrecision: '7' }),
    ...(where && { where }),
  });
  const res = await fetch(`${base}/${capa}/query?${params}`, { signal: AbortSignal.timeout(timeoutMs), ...(dispatcher && { dispatcher }) });
  if (!res.ok) throw new Error(`El catastro respondió ${res.status}`);
  const json = await res.json();
  if (json?.error || !Array.isArray(json?.features)) throw new Error('Respuesta del catastro inválida');
  return json.features[0] || null;
}
// Todos los elementos de una capa cerca de un punto (WGS84); `distanciaM` > 0 sirve para líneas (calles).
async function consultarLista(base, capa, lng, lat, campos, timeoutMs, { distanciaM, where, dispatcher } = {}) {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: campos.join(','), returnGeometry: 'false', f: 'json',
    ...(distanciaM && { distance: String(distanciaM), units: 'esriSRUnit_Meter' }),
    ...(where && { where }),
  });
  const res = await fetch(`${base}/${capa}/query?${params}`, { signal: AbortSignal.timeout(timeoutMs), ...(dispatcher && { dispatcher }) });
  if (!res.ok) throw new Error(`El catastro respondió ${res.status}`);
  const json = await res.json();
  if (json?.error || !Array.isArray(json?.features)) throw new Error('Respuesta del catastro inválida');
  return json.features.map((f) => f.attributes || {});
}
const consultarCapa = async (capa, lng, lat, campos, { url, timeoutMs }) =>
  (await consultarLista(url, capa, lng, lat, campos, timeoutMs))[0] || null;

const positivo = (v) => { const n = numero(v); return n !== null && n > 0 ? n : null; };
// Fechas del servicio: milisegundos desde 1970 -> AAAA-MM-DD.
const fecha = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? new Date(Number(v)).toISOString().slice(0, 10) : null);
// Nombres de calle como vienen en COFOPRI («JR__GONZALES_PRADA») -> «JR GONZALES PRADA».
const calle = (v) => texto(String(v ?? '').replace(/_+/g, ' '));

const CAMPOS_LOTE = ['NRO_MZNA', 'NRO_LOTE', 'AREA_GRAFI', 'AREA_INSCR', 'ID_LOTE', 'ID_PLANO', 'ID_DIST', 'TIP_USO', 'DETALLE_US',
  'TIP_CONTIG', 'DETALLE_CO', 'TIP_PREDIO', 'EDIFICACIO', 'FECH_TRAN', 'TIP_FUENTE', 'CUC'];
const CAMPOS_SECTOR = ['NOM_PUEBLO', 'DISTRITO', 'TOT_LOTES', 'TIP_POSESI', 'TIP_FORMAL', 'AREA_GRAFI', 'AREA_INSCR', 'ID_HAB_URB', 'ID_DIST'];
const CAMPOS_PREDIO_RURAL = ['cod_predio', 'num_predio', 'hoja', 'area_ha', 'perimetro', 'origen', 'datum', 'calculo', 'observacion', 'cod_proy', 'id_dist', 'id_plano'];
const CAMPOS_COMUNIDAD = ['nom_comunidad', 'nom_dpto', 'nom_prov', 'nom_dist', 'estado', 'fuente'];
const CAMPOS_COMUNIDAD_NATIVA = [...CAMPOS_COMUNIDAD, 'federacion', 'etnia', 'nro_titulo', 'anio_titulo', 'area_titulo', 'perimetro_titulo'];

// Si el punto no cae en un lote urbano: predio rural de Junín (MIDAGRI) y comunidades que lo contienen. Todo tolerante a fallos.
async function datosRurales(lng, lat, o) {
  const where = `id_dist LIKE '${o.ubigeoRural.replace(/\D/g, '')}%'`;
  const dispatcher = agenteMidagri();
  const intentar = (p) => p.then((l) => l[0] || null, () => null);
  const [p, cc, cn] = await Promise.all([
    intentar(consultarLista(o.urlRural, 0, lng, lat, CAMPOS_PREDIO_RURAL, o.timeoutRuralMs, { where, dispatcher })),
    intentar(consultarLista(o.urlRural, 1, lng, lat, CAMPOS_COMUNIDAD, o.timeoutRuralMs, { where, dispatcher })),
    intentar(consultarLista(o.urlRural, 2, lng, lat, CAMPOS_COMUNIDAD_NATIVA, o.timeoutRuralMs, { where, dispatcher })),
  ]);
  const comunidad = (c, extra = {}) => c && { nombre: texto(c.nom_comunidad), departamento: texto(c.nom_dpto), provincia: texto(c.nom_prov), distrito: texto(c.nom_dist), estado: texto(c.estado), ...extra };
  const rural = {
    predio: p && {
      codigo: texto(p.cod_predio), numero: texto(p.num_predio), hoja: texto(p.hoja), area_ha: Number(p.area_ha) > 0 ? Math.round(Number(p.area_ha) * 10000) / 10000 : null,
      perimetro_m: positivo(p.perimetro), origen: texto(p.origen), datum: texto(p.datum), calculo: texto(p.calculo),
      observacion: texto(p.observacion), proyecto: texto(p.cod_proy), ubigeo: texto(p.id_dist), plano: texto(p.id_plano),
    },
    comunidad_campesina: comunidad(cc),
    comunidad_nativa: comunidad(cn, cn && {
      federacion: texto(cn.federacion), etnia: texto(cn.etnia), titulo: texto(cn.nro_titulo), anio_titulo: texto(cn.anio_titulo),
      area_titulo_ha: positivo(cn.area_titulo), perimetro_titulo_m: positivo(cn.perimetro_titulo),
    }),
  };
  return rural.predio || rural.comunidad_campesina || rural.comunidad_nativa ? rural : null;
}

// Medidas del contorno de un lote (geometría de ArcGIS en WGS84): perímetro y longitud de cada lado, en metros.
// COFOPRI no publica medidas por lado; se calculan del dibujo, así que son aproximadas (catastro referencial).
// Los tramos casi alineados (giro < GIRO_MIN_GRADOS) forman un solo lado. Los lados se listan en sentido horario
// empezando por el que mira más al norte, como se suelen enumerar los linderos.
const GIRO_MIN_GRADOS = 8;
const RUMBOS = ['Norte', 'Noreste', 'Este', 'Sureste', 'Sur', 'Suroeste', 'Oeste', 'Noroeste'];
function medidasDelContorno(geometry) {
  const anillos = Array.isArray(geometry?.rings) ? geometry.rings.filter((r) => Array.isArray(r) && r.length >= 4) : [];
  if (!anillos.length) return null;
  const exterior = anillos.reduce((a, b) => (Math.abs(areaFirmada(b)) > Math.abs(areaFirmada(a)) ? b : a));
  // A metros en un plano local (a escala de un lote el error es despreciable).
  const lat0 = exterior[0][1];
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  let pts = exterior.map(([x, y]) => [x * kx, y * 110540]);
  const [p0, pN] = [pts[0], pts[pts.length - 1]];
  if (p0[0] === pN[0] && p0[1] === pN[1]) pts = pts.slice(0, -1);
  pts = pts.filter((p, i) => Math.hypot(p[0] - pts[(i + 1) % pts.length][0], p[1] - pts[(i + 1) % pts.length][1]) > 0.01);
  if (pts.length < 3) return null;
  if (areaFirmada(pts) > 0) pts.reverse();   // sentido horario
  const n = pts.length;
  const seg = (i) => [pts[(i + 1) % n][0] - pts[i][0], pts[(i + 1) % n][1] - pts[i][1]];
  const largo = (i) => Math.hypot(...seg(i));
  const perimetro = pts.reduce((a, _p, i) => a + largo(i), 0);

  // Esquinas: vértices donde el contorno gira lo suficiente.
  const giro = (i) => {
    const [ax, ay] = seg((i - 1 + n) % n);
    const [bx, by] = seg(i);
    return Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by)) * (180 / Math.PI);
  };
  let esquinas = pts.map((_p, i) => i).filter((i) => giro(i) >= GIRO_MIN_GRADOS);
  if (esquinas.length < 3) esquinas = pts.map((_p, i) => i);

  const lados = esquinas.map((ini, k) => {
    const fin = esquinas[(k + 1) % esquinas.length];
    let m = 0;
    for (let i = ini; i !== fin; i = (i + 1) % n) m += largo(i);
    // En sentido horario el exterior queda a la izquierda del avance: normal (-dy, dx).
    const dx = pts[fin][0] - pts[ini][0];
    const dy = pts[fin][1] - pts[ini][1];
    const acimut = (Math.atan2(-dy, dx) * (180 / Math.PI) + 360) % 360;   // de la normal exterior: 0 = norte, 90 = este
    return { orientacion: RUMBOS[Math.round(acimut / 45) % 8], acimut, longitud_m: Math.round(m * 100) / 100 };
  });
  const distNorte = (a) => Math.min(a, 360 - a);
  const primero = lados.reduce((b, l, i) => (distNorte(l.acimut) < distNorte(lados[b].acimut) ? i : b), 0);
  return {
    perimetro_m: Math.round(perimetro * 100) / 100,
    lados: [...lados.slice(primero), ...lados.slice(0, primero)].map(({ orientacion, longitud_m }) => ({ orientacion, longitud_m })),
  };
}

// Datos del lote bajo un punto del mapa (todo lo que publica COFOPRI: lote, manzana, sector y calles cercanas; si no hay lote
// urbano, el predio rural y las comunidades de MIDAGRI). El adjudicatario solo se entrega a los roles autorizados.
exports.lote = async (lngTxt, latTxt, user) => {
  const o = opciones();
  const lngClic = coordenada(lngTxt, LNG, 'La longitud');
  const latClic = coordenada(latTxt, LAT, 'La latitud');
  // El mapa muestra la capa desplazada para que encaje con las calles; la consulta vuelve a la posición original.
  const lng = lngClic - o.desfaseEsteM / (111320 * Math.cos((latClic * Math.PI) / 180));
  const lat = latClic - o.desfaseNorteM / 110540;
  const veAdjudicatario = ROLES_ADJUDICATARIO.includes(user?.rol);

  let lote; let elementoLote; let sector; let manzana; let calles;
  try {
    [elementoLote, sector, manzana, calles] = await Promise.all([
      // Con el contorno: de él salen el perímetro y la medida de cada lado (COFOPRI solo publica el área).
      consultarElemento(o.url, 2, lng, lat, [...CAMPOS_LOTE, ...(veAdjudicatario ? ['ADJUDICATA'] : [])], o.timeoutMs, { geometria: true }),
      consultarCapa(3, lng, lat, CAMPOS_SECTOR, o).catch(() => null),
      consultarCapa(1, lng, lat, ['NRO_MZNA', 'SITUACION', 'AREA_GRAFI'], o).catch(() => null),
      consultarLista(o.url, 0, lng, lat, ['NOM_CALLE'], o.timeoutMs, { distanciaM: 25 }).catch(() => []),
    ]);
  } catch (e) {
    console.error('Catastro COFOPRI:', e.message);
    throw bad('No se pudo consultar el catastro de COFOPRI. Intente de nuevo.', 502);
  }
  lote = elementoLote?.attributes || (elementoLote ? {} : null);
  const medidas = lote && medidasDelContorno(elementoLote.geometry);

  const respuesta = {
    lote: lote && {
      manzana: texto(lote.NRO_MZNA), numero: texto(lote.NRO_LOTE), area_m2: numero(lote.AREA_GRAFI), area_inscrita_m2: positivo(lote.AREA_INSCR),
      id_lote: texto(lote.ID_LOTE), plano: texto(lote.ID_PLANO), ubigeo: texto(lote.ID_DIST),
      tipo_uso: texto(lote.TIP_USO), detalle_uso: texto(lote.DETALLE_US), tipo_colindancia: texto(lote.TIP_CONTIG), detalle_colindancia: texto(lote.DETALLE_CO),
      tipo_predio: texto(lote.TIP_PREDIO), edificacion: texto(lote.EDIFICACIO), fecha_transferencia: fecha(lote.FECH_TRAN),
      fuente_dato: texto(lote.TIP_FUENTE), cuc: texto(lote.CUC),
      perimetro_m: medidas?.perimetro_m ?? null, lados: medidas?.lados ?? [],
      // COFOPRI no publica nombres: este campo solo trae un indicador (0/1). Se entrega el nombre si algún día lo trae.
      ...(veAdjudicatario && { adjudicatario: nombre(lote.ADJUDICATA), indicador_adjudicacion: texto(lote.ADJUDICATA) }),
    },
    sector: sector && {
      nombre: texto(String(sector.NOM_PUEBLO || '').split('\n')[0]), distrito: texto(sector.DISTRITO), ubigeo: texto(sector.ID_DIST),
      total_lotes: positivo(sector.TOT_LOTES), tipo_posesion: texto(sector.TIP_POSESI), tipo_formalizacion: texto(sector.TIP_FORMAL),
      area_m2: positivo(sector.AREA_GRAFI), area_inscrita_m2: positivo(sector.AREA_INSCR), habilitacion_urbana: texto(sector.ID_HAB_URB),
    },
    manzana: manzana && { numero: texto(manzana.NRO_MZNA), situacion: texto(manzana.SITUACION), area_m2: positivo(manzana.AREA_GRAFI) },
    calles: [...new Set((calles || []).map((c) => calle(c.NOM_CALLE)).filter(Boolean))].slice(0, 6),
    rural: lote || !o.rural ? null : await datosRurales(lngClic, latClic, o),
    fuente: 'COFOPRI (urbano) y MIDAGRI (rural), referencial',
  };
  // Bitácora de accesos a datos personales (sin guardar el nombre).
  if (veAdjudicatario && lote && process.env.NODE_ENV !== 'test') {
    console.info(`Catastro: usuario ${user.id} (${user.rol}) consultó un lote con adjudicatario`);
  }
  return respuesta;
};

// Área con signo de un anillo [lng, lat]: positiva si va en sentido antihorario.
const areaFirmada = (anillo) => anillo.reduce((a, [x1, y1], i) => {
  const [x2, y2] = anillo[(i + 1) % anillo.length];
  return a + (x1 * y2 - x2 * y1);
}, 0) / 2;

// Geometría de ArcGIS ({ rings }, exteriores en sentido horario) -> Polygon de GeoJSON desplazado (dx, dy en grados).
// Un predio de varias partes no se puede elegir como un solo terreno.
function aPoligono(geometry, dx = 0, dy = 0) {
  const anillos = Array.isArray(geometry?.rings) ? geometry.rings.filter((r) => Array.isArray(r) && r.length >= 4) : [];
  if (!anillos.length) return null;
  const mover = (r) => r.map(([x, y]) => [Math.round((x + dx) * 1e7) / 1e7, Math.round((y + dy) * 1e7) / 1e7]);
  const exteriores = anillos.filter((r) => areaFirmada(r) < 0);
  const huecos = anillos.filter((r) => areaFirmada(r) > 0);
  if (exteriores.length !== 1) {
    throw bad('Este predio está formado por varias partes y no se puede elegir como un solo terreno.', 422);
  }
  // GeoJSON: exterior antihorario, huecos horarios.
  return { type: 'Polygon', coordinates: [mover(exteriores[0]).reverse(), ...huecos.map((h) => mover(h).reverse())] };
}

// Predio del catastro bajo un punto del mapa, con su contorno, para que el oferente lo elija como su terreno.
// Es público: NO incluye el adjudicatario. Prueba lotes urbanos (COFOPRI) y predios rurales de Junín (MIDAGRI).
exports.predio = async (lngTxt, latTxt) => {
  const o = opciones();
  const lngClic = coordenada(lngTxt, LNG, 'La longitud');
  const latClic = coordenada(latTxt, LAT, 'La latitud');
  // Mismo desfase que se aplica al dibujar la capa urbana (la rural no lo lleva).
  const dxGrados = o.desfaseEsteM / (111320 * Math.cos((latClic * Math.PI) / 180));
  const dyGrados = o.desfaseNorteM / 110540;

  // Las dos consultas salen a la vez (el servicio rural es lento), pero si hay lote urbano no se espera a la rural.
  const intentar = (p) => p.then((value) => ({ status: 'fulfilled', value }), (reason) => ({ status: 'rejected', reason }));
  const consultaRural = !o.rural ? Promise.resolve({ status: 'fulfilled', value: null }) : intentar(consultarElemento(o.urlRural, 0, lngClic, latClic, ['cod_predio', 'area_ha'], o.timeoutRuralMs,
    { geometria: true, where: `id_dist LIKE '${o.ubigeoRural.replace(/\D/g, '')}%'`, dispatcher: agenteMidagri() }));
  const urbano = await intentar(consultarElemento(o.url, 2, lngClic - dxGrados, latClic - dyGrados,
    ['NRO_MZNA', 'NRO_LOTE', 'AREA_GRAFI'], o.timeoutMs, { geometria: true }));
  const rural = urbano.status === 'fulfilled' && urbano.value ? { status: 'fulfilled', value: null } : await consultaRural;

  let predio = null;
  if (urbano.status === 'fulfilled' && urbano.value) {
    const a = urbano.value.attributes || {};
    const poligono = aPoligono(urbano.value.geometry, dxGrados, dyGrados);
    if (poligono) {
      const partes = [texto(a.NRO_MZNA) && `Mz. ${texto(a.NRO_MZNA)}`, texto(a.NRO_LOTE) && `Lote ${texto(a.NRO_LOTE)}`].filter(Boolean);
      predio = { fuente: 'urbano', etiqueta: partes.join(' · ') || 'Lote urbano', area_m2: numero(a.AREA_GRAFI), poligono };
    }
  }
  if (!predio && rural.status === 'fulfilled' && rural.value) {
    const a = rural.value.attributes || {};
    const poligono = aPoligono(rural.value.geometry);
    if (poligono) {
      const ha = Number(a.area_ha);
      predio = {
        fuente: 'rural', etiqueta: texto(a.cod_predio) ? `Predio rural ${texto(a.cod_predio)}` : 'Predio rural',
        area_m2: Number.isFinite(ha) ? Math.round(ha * 10000 * 10) / 10 : null, poligono,
      };
    }
  }
  if (!predio && (urbano.status === 'rejected' || rural.status === 'rejected')) {
    console.error('Catastro (predio):', (urbano.status === 'rejected' ? urbano : rural).reason?.message);
    throw bad('No se pudo consultar el catastro. Intente de nuevo en unos segundos.', 502);
  }
  // El sello permite a la oferta comprobar después que el contorno vino de aquí (ver selloPredio.js).
  return { predio: predio && { ...predio, sello: selloPredio.sellar(predio.poligono) }, fuente: 'COFOPRI (urbano) y MIDAGRI (rural), referencial' };
};

exports.aPoligono = aPoligono;
