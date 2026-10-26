const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const { opciones, detectar, MB } = require('../config/archivos');
const archivoModel = require('../models/archivoModel');
const { getTerrenoOr404, getAbiertoOr409 } = require('./terrenoService');

const bad = (message, status = 400) => ({ status, message });
// Cada área solo sube y elimina lo suyo (técnica: fotos y reportes; legal y administrativa: sus documentos).
const areaDe = (user) => (user.rol === 'legal' ? 'legal' : user.rol === 'administrativa' ? 'administrativa' : 'tecnica');
const idValido = (v) => /^\d+$/.test(String(v)) && Number(v) <= 2147483647;

// Nombre mostrado: sin carpetas, sin caracteres de control ni reservados. Llega codificado (encodeURIComponent).
function limpiarNombre(codificado) {
  let n = String(codificado || '');
  try { n = decodeURIComponent(n); } catch { /* se usa tal cual */ }
  n = path.basename(n.replace(/\\/g, '/'))
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')   // eslint-disable-line no-control-regex
    .trim();
  if (n.length > 150) n = n.slice(-150);
  return n || 'archivo';
}

exports.listar = (idTerreno) => archivoModel.listar(idTerreno);

// `cuerpo` es el archivo en bruto (Buffer). El tipo se decide por su contenido; el nombre solo es informativo.
exports.subir = async (id, cuerpo, nombreCodificado, user) => {
  const terreno = await getAbiertoOr409(id);
  if (!Buffer.isBuffer(cuerpo) || cuerpo.length === 0) throw bad('No se recibió ningún archivo');
  const nombre = limpiarNombre(nombreCodificado);
  const det = detectar(cuerpo, nombre);
  if (!det) throw bad('Formato no permitido. Fotos: JPG, PNG o WebP. Reportes: PDF, Word (.doc/.docx) o Excel (.xls/.xlsx)');

  const o = opciones();
  const limite = det.tipo === 'foto' ? o.fotoMaxBytes : o.reporteMaxBytes;
  if (cuerpo.length > limite) {
    throw bad(`"${nombre}" supera el máximo de ${Math.round(limite / MB)} MB para ${det.tipo === 'foto' ? 'fotos' : 'reportes'}`, 413);
  }
  const area = areaDe(user);
  if (await archivoModel.contar(terreno.id_terreno, area) >= o.maxPorTerreno) {
    throw bad(`Se alcanzó el máximo de ${o.maxPorTerreno} archivos por terreno`, 409);
  }

  const ruta = path.join(String(terreno.id_terreno), `${randomUUID()}${det.ext}`);
  const abs = path.join(o.dir, ruta);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, cuerpo, { flag: 'wx' });
  try {
    return await archivoModel.insertar({
      id_terreno: terreno.id_terreno, area, tipo: det.tipo, nombre_original: nombre, mime: det.mime,
      tamano: cuerpo.length, ruta, subido_por: user.id,
    });
  } catch (e) {
    await fs.unlink(abs).catch(() => {});
    throw e;
  }
};

// Datos y ruta absoluta del archivo para enviarlo al navegador (cualquier rol con sesión).
exports.abrir = async (id, idArchivo) => {
  await getTerrenoOr404(id);
  if (!idValido(idArchivo)) throw bad('Identificador de archivo inválido');
  const fila = await archivoModel.obtener(id, idArchivo);
  if (!fila) throw { status: 404, message: 'Archivo no encontrado' };
  const abs = path.join(opciones().dir, fila.ruta);
  try { await fs.access(abs); } catch { throw { status: 404, message: 'El archivo ya no está disponible' }; }
  return { fila, abs };
};

exports.eliminar = async (id, idArchivo, user) => {
  await getAbiertoOr409(id);
  if (!idValido(idArchivo)) throw bad('Identificador de archivo inválido');
  const fila = await archivoModel.obtener(id, idArchivo);
  if (!fila) throw { status: 404, message: 'Archivo no encontrado' };
  if (fila.area !== areaDe(user)) throw { status: 403, message: 'Solo el área que subió el archivo puede eliminarlo' };
  await archivoModel.eliminar(fila.id_archivo);
  await fs.unlink(path.join(opciones().dir, fila.ruta)).catch(() => {});
};
