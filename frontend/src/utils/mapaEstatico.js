import { MAPBOX_TOKEN, hasMapboxToken } from '../components/mapConfig.js';

const redondear = (n) => Math.round(n * 1e5) / 1e5;
const LIMITE_URL = 7000;   // la Static Images API rechaza URLs de más de ~8 000 caracteres

// Imagen (Mapbox Static Images, estilo claro) con el contorno del terreno en verde.
// Devuelve null si no hay token o el polígono es demasiado grande para ir en la URL.
export function urlMapaEstatico(poligono, { ancho = 560, alto = 240 } = {}) {
  if (!hasMapboxToken || !Array.isArray(poligono?.coordinates)) return null;
  const feature = {
    type: 'Feature',
    properties: { stroke: '#2b4a3e', 'stroke-width': 3, fill: '#2f7a5a', 'fill-opacity': 0.35 },
    geometry: { type: 'Polygon', coordinates: poligono.coordinates.map((anillo) => anillo.map(([lng, lat]) => [redondear(lng), redondear(lat)])) },
  };
  const url = `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/geojson(${encodeURIComponent(JSON.stringify(feature))})`
    + `/auto/${ancho}x${alto}@2x?padding=48&access_token=${MAPBOX_TOKEN}`;
  return url.length > LIMITE_URL ? null : url;
}
