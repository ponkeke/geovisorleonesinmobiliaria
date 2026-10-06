const { CATEGORIAS, CATEGORIA_VIA, DIAS_CACHE, LIMITE_POR_CATEGORIA, FUENTE, opciones } = require('../config/lugares');
const puntoModel = require('../models/puntoInteresModel');
const overpass = require('./overpassService');
const { getTerrenoOr404 } = require('./terrenoService');

const MSG_ERROR = 'No se pudo consultar lugares cercanos';
const r1 = (n) => Math.round(Number(n) * 10) / 10;
const claves = CATEGORIAS.map((c) => c.clave);

function armar(filas, radio, origen, error = null) {
  const categorias = CATEGORIAS.map((c) => ({
    clave: c.clave,
    etiqueta: c.etiqueta,
    lugares: filas.filter((f) => f.categoria === c.clave).slice(0, LIMITE_POR_CATEGORIA).map((f) => ({
      nombre: f.nombre, distancia_m: r1(f.distancia_m), lat: f.lat, lng: f.lng,
    })),
  }));
  const via = categorias.find((c) => c.clave === CATEGORIA_VIA)?.lugares[0];
  return {
    fuente: FUENTE,
    origen,
    radio_m: radio,
    categorias,
    distancia_via_principal_m: via ? via.distancia_m : null,
    error,
  };
}

// Lugares cercanos al polígono del terreno. Usa lo guardado si se sincronizó hace < DIAS_CACHE días;
// si no, consulta Overpass y guarda. Si Overpass falla NO lanza: devuelve `error` y listas vacías.
exports.cercanos = async (id) => {
  await getTerrenoOr404(id);
  const { radio } = opciones();

  const guardados = await puntoModel.cercanos(id, radio, claves, DIAS_CACHE);
  if (guardados.length) return armar(guardados, radio, 'cache');

  try {
    const caja = await puntoModel.cajaTerreno(id);
    if (!caja) return armar([], radio, 'overpass');
    // Overpass: caja del polígono + radio. Las distancias exactas (borde del polígono) las calcula PostGIS.
    const items = await overpass.buscar(caja, radio);
    await puntoModel.upsert(id, items);
    return armar(await puntoModel.cercanos(id, radio, claves, DIAS_CACHE), radio, 'overpass');
  } catch (e) {
    console.error('Lugares cercanos:', e.message);
    return armar([], radio, 'error', MSG_ERROR);
  }
};
