const { opciones } = require('../config/validacionPoligono');
const viaModel = require('../models/viaOsmModel');
const { asegurarVias } = require('./validacionPoligonoService');
const { getTerrenoOr404 } = require('./terrenoService');

const DISTANCIA_MAX_M = 50;   // una vía más lejos que esto no es el acceso del terreno
const FUENTE = 'Datos de OpenStreetMap';

// highway de OSM -> tipo de vía de Perú. Es solo una sugerencia: el técnico la confirma o corrige.
const TIPOS = {
  motorway: 'avenida', trunk: 'avenida', primary: 'avenida', secondary: 'avenida', tertiary: 'avenida',
  residential: 'calle', unclassified: 'calle', service: 'pasaje',
};
const SUPERFICIES = {
  asfaltada: ['asphalt', 'paved', 'concrete', 'paving_stones', 'concrete:plates', 'sett'],
  afirmada: ['compacted', 'gravel', 'fine_gravel', 'pebblestone'],
  trocha: ['dirt', 'ground', 'earth', 'unpaved', 'sand', 'mud', 'grass'],
};
const superficie = (surface) => Object.keys(SUPERFICIES).find((k) => SUPERFICIES[k].includes(surface)) || null;

// Vía que da frente al terreno (la más cercana a su borde), para sugerir tipo, nombre y superficie.
// Si no hay vías guardadas de la zona se consultan a OSM; si no responde, `via` es null y se llena a mano.
exports.acceso = async (id) => {
  const terreno = await getTerrenoOr404(id);
  const o = opciones();
  if (o.validarVias && terreno.geometria) await asegurarVias(terreno.geometria, o);
  const v = await viaModel.masCercana(id, DISTANCIA_MAX_M);
  return {
    fuente: FUENTE,
    via: v && {
      highway: v.highway,
      tipo: TIPOS[v.highway] || null,
      nombre: v.nombre,
      superficie: v.superficie ? superficie(v.superficie) : null,
      distancia_m: Math.round(v.distancia_m * 10) / 10,
      trazo: v.trazo,
    },
  };
};
