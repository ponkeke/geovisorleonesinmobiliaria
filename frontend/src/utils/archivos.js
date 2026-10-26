import { subirArchivo, errorMessage } from '../services/api.js';

// Archivos de la revisión técnica: fotos de la visita y reportes adicionales.
export const EXT_FOTO = ['.jpg', '.jpeg', '.png', '.webp'];
export const EXT_REPORTE = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'];
export const ACCEPT_FOTOS = 'image/jpeg,image/png,image/webp';
export const ACCEPT_REPORTES = '.pdf,.doc,.docx,.xls,.xlsx';
export const REPORTE_MAX_MB = 15;
const FOTO_LADO_MAX = 1600;   // las fotos del celular se reducen antes de subir (pesan ~0,3 MB en vez de 5-10 MB)

const extension = (nombre) => (nombre.lastIndexOf('.') >= 0 ? nombre.slice(nombre.lastIndexOf('.')).toLowerCase() : '');

export function formatoTamano(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Clasifica por extensión (el servidor vuelve a comprobar el contenido real). Devuelve 'foto' | 'reporte' | null.
export const tipoPorNombre = (nombre) => {
  const e = extension(nombre);
  if (EXT_FOTO.includes(e)) return 'foto';
  if (EXT_REPORTE.includes(e)) return 'reporte';
  return null;
};

// Reduce una foto a JPEG de hasta FOTO_LADO_MAX px por lado. Si el navegador no puede leerla (p. ej. HEIC) se devuelve igual.
export async function reducirFoto(file) {
  try {
    const bmp = await createImageBitmap(file);
    const escala = Math.min(1, FOTO_LADO_MAX / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;   // ya era pequeña: se deja como está
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/**
 * Valida (tipo y tamaño) los archivos elegidos. Devuelve { validos: File[], errores: string[] }.
 * `permitidos`: ['foto'] | ['reporte'] | ['foto', 'reporte'].
 */
export function validarSeleccion(files, permitidos) {
  const validos = [];
  const errores = [];
  for (const f of files) {
    const tipo = tipoPorNombre(f.name);
    if (!tipo || !permitidos.includes(tipo)) {
      errores.push(`«${f.name}»: formato no permitido`);
    } else if (tipo === 'reporte' && f.size > REPORTE_MAX_MB * 1024 * 1024) {
      errores.push(`«${f.name}»: supera ${REPORTE_MAX_MB} MB`);
    } else {
      validos.push(f);
    }
  }
  return { validos, errores };
}

/**
 * Sube los archivos de uno en uno (las fotos se reducen antes). `onProgreso(n, total)` informa cuántos van.
 * Devuelve los que fallaron: [{ nombre, motivo }]; nunca lanza.
 */
export async function subirTodos(idTerreno, files, onProgreso) {
  const fallidos = [];
  for (let i = 0; i < files.length; i++) {
    onProgreso?.(i + 1, files.length);
    const original = files[i];
    try {
      const file = tipoPorNombre(original.name) === 'foto' ? await reducirFoto(original) : original;
      await subirArchivo(idTerreno, file);
    } catch (e) {
      fallidos.push({ nombre: original.name, motivo: errorMessage(e) });
    }
  }
  return fallidos;
}
