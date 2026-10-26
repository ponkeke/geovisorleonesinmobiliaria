const path = require('path');

// Archivos de la revisión técnica (fotos de visita y reportes). Se leen del entorno en cada llamada.
const MB = 1024 * 1024;
const num = (v, def) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : def);

const opciones = () => ({
  dir: process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads'),
  fotoMaxBytes: num(process.env.FOTO_MAX_MB, 10) * MB,
  reporteMaxBytes: num(process.env.REPORTE_MAX_MB, 15) * MB,
  maxPorTerreno: num(process.env.ARCHIVOS_MAX_POR_TERRENO, 40),
});

// Tipos admitidos. El tipo REAL se decide por los primeros bytes del archivo, no por el nombre ni por el Content-Type.
const detectar = (buf, nombre) => {
  const ext = path.extname(nombre).toLowerCase();
  const empieza = (...bytes) => bytes.every((b, i) => buf[i] === b);
  if (empieza(0xff, 0xd8, 0xff)) return { tipo: 'foto', mime: 'image/jpeg', ext: '.jpg' };
  if (empieza(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { tipo: 'foto', mime: 'image/png', ext: '.png' };
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    return { tipo: 'foto', mime: 'image/webp', ext: '.webp' };
  }
  if (buf.toString('latin1', 0, 5) === '%PDF-') return { tipo: 'reporte', mime: 'application/pdf', ext: '.pdf' };
  // Word/Excel antiguos (contenedor OLE): el contenedor es igual para ambos, se distingue por la extensión.
  if (empieza(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) {
    if (ext === '.doc') return { tipo: 'reporte', mime: 'application/msword', ext };
    if (ext === '.xls') return { tipo: 'reporte', mime: 'application/vnd.ms-excel', ext };
  }
  // Word/Excel modernos (ZIP).
  if (empieza(0x50, 0x4b, 0x03, 0x04)) {
    if (ext === '.docx') return { tipo: 'reporte', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext };
    if (ext === '.xlsx') return { tipo: 'reporte', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext };
  }
  return null;
};

module.exports = { opciones, detectar, MB };
