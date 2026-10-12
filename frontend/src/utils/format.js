// Moneda: la maqueta usa soles (S/).
export const formatSoles = (n) => `S/ ${Number(n).toLocaleString('es-PE', { maximumFractionDigits: 0 })}`;

// Versión corta para tarjetas: S/ 1.48 M
export const formatSolesCorto = (n) => {
  const v = Number(n);
  return v >= 1e6 ? `S/ ${(v / 1e6).toFixed(2)} M` : formatSoles(v);
};

// Código visible del terreno, derivado del id: 248 -> TR-0248
export const codigoTerreno = (id) => `TR-${String(id).padStart(4, '0')}`;

// Código visible de la oferta, derivado del id: 12 -> OF-0012
export const codigoOferta = (id) => `OF-${String(id).padStart(4, '0')}`;

export const ESTADOS = { en_evaluacion: 'En evaluación', aprobado: 'Aprobado', descartado: 'Descartado' };

export const ROLES = {
  tecnica: 'Área Técnica', legal: 'Área Legal', administrativa: 'Área Administrativa', gerencia: 'Gerencia',
};

export const iniciales = (nombre = '') =>
  nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

export const capitalizar = (s = '') => s.charAt(0).toUpperCase() + s.slice(1);
