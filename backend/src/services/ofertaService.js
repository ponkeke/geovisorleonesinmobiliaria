const ofertaModel = require('../models/ofertaModel');
const v = require('../validators/ofertaValidator');
const validacionPoligono = require('./validacionPoligonoService');

const bad = (message) => ({ status: 400, campo: 'poligono', message });

// Acepta un Feature o una geometría GeoJSON y devuelve la geometría Polygon.
// Revisa forma y rangos antes de pasar a PostGIS (que valida topología con ST_IsValid).
function extraerPoligono(input) {
  if (!input || typeof input !== 'object') throw bad('Debe dibujar el polígono del terreno');
  const g = input.type === 'Feature' ? input.geometry : input;
  if (!g || g.type !== 'Polygon' || !Array.isArray(g.coordinates)) {
    throw bad('La geometría debe ser un único polígono');
  }
  for (const ring of g.coordinates) {
    if (!Array.isArray(ring) || ring.length < 4) throw bad('El polígono necesita al menos 3 vértices');
    for (const p of ring) {
      const [lng, lat] = Array.isArray(p) ? p : [];
      if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) {
        throw bad('El polígono tiene coordenadas fuera de rango');
      }
    }
    const [a, b] = [ring[0], ring[ring.length - 1]];
    if (a[0] !== b[0] || a[1] !== b[1]) throw bad('El anillo del polígono no está cerrado');
  }
  return { type: 'Polygon', coordinates: g.coordinates };
}

exports.registrar = async (b) => {
  // Validación y normalización de formato (el cliente solo guía; esta es la oficial).
  const datos = {
    nombre_propietario: v.nombre(b.nombre_propietario),
    contacto: v.contacto(b.contacto),
    ubicacion_referencial: v.ubicacion(b.ubicacion_referencial),
    precio_ofertado: v.precio(b.precio_ofertado),
    descripcion: v.descripcion(b.descripcion),
  };

  // R1-R4 (el servidor es la autoridad); el aviso de vías no verificadas no bloquea el envío.
  const val = await validacionPoligono.validar(b.poligono);
  if (!val.valido) {
    throw { status: 400, campo: 'poligono', message: val.errores[0].mensaje, errores: val.errores, avisos: val.avisos };
  }
  const poligono = extraerPoligono(b.poligono);
  // El área oficial la calcula el servidor; la que muestre el cliente es solo informativa.
  const area = await ofertaModel.validarPoligono(poligono);

  const { oferta } = await ofertaModel.createWithTerreno(datos, poligono, area);
  return { id_oferta: oferta.id_oferta, area, ...(val.avisos.length && { avisos: val.avisos }) };
};
