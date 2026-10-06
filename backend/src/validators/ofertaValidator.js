// Validación oficial de formato para POST /api/ofertas.
// Cada validador devuelve el valor normalizado o lanza { status: 400, campo, message }.
// Las mismas reglas están replicadas en frontend/src/utils/validators.js (solo para guiar al usuario).

const PRECIO_MAX = 999999999;
const DESCRIPCION_MAX = 500;

const fail = (campo, message) => ({ status: 400, campo, message });
const compactar = (s) => String(s).trim().replace(/\s+/g, ' ');

// Primera letra de cada palabra (también tras guion o apóstrofe) en mayúscula: "juan pérez" -> "Juan Pérez".
const capitalizar = (s) => s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_m, sep, l) => sep + l.toUpperCase());

exports.nombre = (v) => {
  if (typeof v !== 'string' || compactar(v) === '') throw fail('nombre_propietario', 'El nombre es obligatorio');
  const n = compactar(v);
  if (!/^[\p{L}\s'’-]+$/u.test(n)) throw fail('nombre_propietario', 'El nombre solo puede contener letras');
  if (n.length < 3) throw fail('nombre_propietario', 'El nombre debe tener al menos 3 caracteres');
  if (n.length > 80) throw fail('nombre_propietario', 'El nombre no puede superar los 80 caracteres');
  const palabras = n.split(' ');
  if (palabras.length < 2 || !palabras.every((p) => /\p{L}/u.test(p))) {
    throw fail('nombre_propietario', 'Ingrese nombre y apellido');
  }
  return capitalizar(n);
};

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/;

// Celular peruano (9 dígitos, empieza con 9) o correo. Devuelve solo dígitos o el correo en minúsculas.
exports.contacto = (v) => {
  if (typeof v !== 'string' || v.trim() === '') throw fail('contacto', 'El teléfono o correo es obligatorio');
  const c = v.trim();
  if (c.includes('@')) {
    const mail = c.toLowerCase();
    if (mail.length > 100) throw fail('contacto', 'El correo no puede superar los 100 caracteres');
    if (!EMAIL.test(mail) || /\.\./.test(mail) || /^\.|\.@/.test(mail)) {
      throw fail('contacto', 'Ingrese un correo válido (ej. nombre@dominio.com)');
    }
    return mail;
  }
  if (!/^[\d\s-]+$/.test(c)) {
    throw fail('contacto', /\p{L}/u.test(c)
      ? 'El teléfono solo puede contener números (para un correo, incluya @)'
      : 'El teléfono solo puede contener números, espacios o guiones');
  }
  const digitos = c.replace(/[\s-]/g, '');
  if (!/^9\d{8}$/.test(digitos)) throw fail('contacto', 'El celular debe tener 9 dígitos y empezar con 9');
  return digitos;
};

// Acepta número o texto numérico: > 0, máximo 2 decimales, hasta PRECIO_MAX.
exports.precio = (v) => {
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  if (s === '') throw fail('precio_ofertado', 'El precio es obligatorio');
  if (!/^\d+(\.\d+)?$/.test(s)) throw fail('precio_ofertado', 'El precio debe ser un número positivo, sin letras ni signos');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw fail('precio_ofertado', 'El precio admite como máximo 2 decimales');
  const n = Number(s);
  if (!(n > 0)) throw fail('precio_ofertado', 'El precio debe ser mayor que 0');
  if (n > PRECIO_MAX) throw fail('precio_ofertado', 'El precio no puede superar S/ 999,999,999');
  return n;
};

// Opcional: máximo 500 caracteres, sin < ni >.
exports.descripcion = (v) => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw fail('descripcion', 'La descripción debe ser texto');
  const d = v.trim();
  if (d === '') return null;
  if (/[<>]/.test(d)) throw fail('descripcion', 'La descripción no puede contener los símbolos < o >');
  if (d.length > DESCRIPCION_MAX) throw fail('descripcion', 'La descripción no puede superar los 500 caracteres');
  return d;
};

exports.ubicacion = (v) => {
  if (typeof v !== 'string' || v.trim() === '') throw fail('ubicacion_referencial', 'La ubicación es obligatoria');
  return v.trim();
};
