// Servicio público de COFOPRI (capas LOTES_PSAD56 y PUEBLOS_PSAD56). Se lee del entorno en cada llamada.
const num = (v, def) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : def);

const cualquiera = (v, def) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : def);   // admite negativos

const opciones = () => ({
  url: (process.env.CATASTRO_URL
    || 'https://geo.serfor.gob.pe/geoservicios/rest/services/Integracion/Int_IDE_COFOPRI_PSAD56/MapServer').replace(/\/+$/, ''),
  // Predios rurales de Junín (MIDAGRI, capa 0 «Predio Rural»; ya en WGS84, sin desfase). Ubigeo 12 = Junín.
  urlRural: (process.env.CATASTRO_RURAL_URL
    || 'https://georural.midagri.gob.pe/geoservicios/rest/services/servicios_ogc/Catastro_Rural/MapServer').replace(/\/+$/, ''),
  // Desactivado por ahora: solo con CATASTRO_RURAL=true se consultan los predios rurales de MIDAGRI.
  rural: String(process.env.CATASTRO_RURAL ?? '').toLowerCase() === 'true',
  ubigeoRural: process.env.CATASTRO_RURAL_UBIGEO || '12',
  timeoutMs: num(process.env.CATASTRO_TIMEOUT_MS, 15000),
  timeoutRuralMs: num(process.env.CATASTRO_RURAL_TIMEOUT_MS, 40000),   // el servicio rural suele tardar decenas de segundos
  // Desfase medio (m) de la capa de COFOPRI frente a OpenStreetMap en Junín: la consulta por punto desplaza el clic
  // de vuelta a la posición original. Debe coincidir con DESFASE_CATASTRO_M del frontend (catastroCapa.js).
  desfaseEsteM: cualquiera(process.env.CATASTRO_DESFASE_ESTE_M, 11.5),
  desfaseNorteM: cualquiera(process.env.CATASTRO_DESFASE_NORTE_M, -1),
});

// Roles que pueden ver el nombre del adjudicatario (dato personal): Técnica revisa el lote en campo, Legal la titularidad y
// Gerencia decide. Administrativa (finanzas) no lo necesita.
const ROLES_ADJUDICATARIO = ['tecnica', 'legal', 'gerencia'];

// ¿La oferta pública solo admite un predio elegido del catastro? Por defecto no: el oferente puede elegir su lote del
// catastro o dibujar su terreno a mano. OFERTAS_SOLO_PREDIOS=true obliga a elegir un predio del catastro.
const soloPredios = () => String(process.env.OFERTAS_SOLO_PREDIOS ?? '').toLowerCase() === 'true';

module.exports = { opciones, ROLES_ADJUDICATARIO, soloPredios };
