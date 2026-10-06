// Reglas de formato del formulario público. Replican backend/src/validators/ofertaValidator.js
// (la validación oficial es la del servidor; esta solo guía al usuario).
// Cada validador devuelve { valor, error } con el valor ya normalizado.

export const PRECIO_MAX = 999999999;
export const DESCRIPCION_MAX = 500;

const compactar = (s) => String(s).trim().replace(/\s+/g, ' ');

// Primera letra de cada palabra (también tras guion o apóstrofe) en mayúscula.
export const capitalizar = (s) =>
  s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_m, sep, l) => sep + l.toUpperCase());

// Mientras se escribe: elimina dígitos y símbolos del nombre.
export const filtrarNombre = (s) => s.replace(/[^\p{L}\s'’-]/gu, '');

// Al salir del campo: sin espacios sobrantes y con mayúscula inicial por palabra.
export const normalizarNombre = (s) => capitalizar(compactar(s));

export function validarNombre(v) {
  const n = compactar(v || '');
  if (n === '') return { error: 'El nombre es obligatorio' };
  if (!/^[\p{L}\s'’-]+$/u.test(n)) return { error: 'El nombre solo puede contener letras' };
  if (n.length < 3) return { error: 'El nombre debe tener al menos 3 caracteres' };
  if (n.length > 80) return { error: 'El nombre no puede superar los 80 caracteres' };
  const palabras = n.split(' ');
  if (palabras.length < 2 || !palabras.every((p) => /\p{L}/u.test(p))) return { error: 'Ingrese nombre y apellido' };
  return { valor: capitalizar(n) };
}

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/;

export function validarContacto(v) {
  const c = (v || '').trim();
  if (c === '') return { error: 'El teléfono o correo es obligatorio' };
  if (c.includes('@')) {
    const mail = c.toLowerCase();
    if (mail.length > 100) return { error: 'El correo no puede superar los 100 caracteres' };
    if (!EMAIL.test(mail) || /\.\./.test(mail) || /^\.|\.@/.test(mail)) {
      return { error: 'Ingrese un correo válido (ej. nombre@dominio.com)' };
    }
    return { valor: mail };
  }
  if (!/^[\d\s-]+$/.test(c)) {
    return { error: /\p{L}/u.test(c)
      ? 'El teléfono solo puede contener números (para un correo, incluya @)'
      : 'El teléfono solo puede contener números, espacios o guiones' };
  }
  const digitos = c.replace(/[\s-]/g, '');
  if (!/^9\d{8}$/.test(digitos)) return { error: 'El celular debe tener 9 dígitos y empezar con 9' };
  return { valor: digitos };
}

// Celular para mostrar: 999123456 -> 999 123 456
export const formatearCelular = (d) => d.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');

// Mientras se escribe: solo dígitos y un punto, con máximo 2 decimales (sin letras ni signo negativo).
export function filtrarPrecio(s) {
  const limpio = s.replace(/[^\d.]/g, '');
  const [entero, ...resto] = limpio.split('.');
  return resto.length ? `${entero}.${resto.join('').slice(0, 2)}` : entero;
}

export function validarPrecio(v) {
  const s = (v || '').trim();
  if (s === '') return { error: 'El precio es obligatorio' };
  if (!/^\d+(\.\d+)?$/.test(s)) return { error: 'El precio debe ser un número positivo, sin letras ni signos' };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { error: 'El precio admite como máximo 2 decimales' };
  const n = Number(s);
  if (!(n > 0)) return { error: 'El precio debe ser mayor que 0' };
  if (n > PRECIO_MAX) return { error: 'El precio no puede superar S/ 999,999,999' };
  return { valor: n };
}

export const formatearPrecio = (n) =>
  Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function validarDescripcion(v) {
  const d = (v || '').trim();
  if (/[<>]/.test(d)) return { error: 'La descripción no puede contener los símbolos < o >' };
  if (d.length > DESCRIPCION_MAX) return { error: 'La descripción no puede superar los 500 caracteres' };
  return { valor: d };
}

export function validarUbicacion(v) {
  const u = (v || '').trim();
  return u === '' ? { error: 'La ubicación es obligatoria' } : { valor: u };
}
