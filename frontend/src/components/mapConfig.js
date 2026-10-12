import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';
export const hasMapboxToken = MAPBOX_TOKEN.trim() !== '';
if (hasMapboxToken) mapboxgl.accessToken = MAPBOX_TOKEN;

export const MAP_STYLE = 'mapbox://styles/mapbox/light-v11';
// Capas base que el usuario puede alternar.
export const ESTILOS = {
  calle: MAP_STYLE,
  satelite: 'mapbox://styles/mapbox/satellite-streets-v12',
  relieve: 'mapbox://styles/mapbox/outdoors-v12',
};

// Ajustes de marca sobre el estilo de calle: agua y áreas verdes en la paleta del sitio y sin puntos de interés.
// Cada capa se comprueba antes de tocarla porque los estilos de Mapbox cambian de ids entre versiones.
export function aplicarMarca(map, capa) {
  if (capa !== 'calle') return;
  const pintar = (id, prop, valor) => { if (map.getLayer(id)) map.setPaintProperty(id, prop, valor); };
  pintar('water', 'fill-color', '#cfe3dc');
  pintar('landuse', 'fill-color', '#e8efe9');
  pintar('national-park', 'fill-color', '#dbe8df');
  if (map.getLayer('poi-label')) map.setLayoutProperty('poi-label', 'visibility', 'none');
}
export const DEFAULT_CENTER = [-80.63, -5.19];
export const DEFAULT_ZOOM = 11;

// Formulario público: el mapa abre en Huancayo.
export const HUANCAYO = [-75.2049, -12.0651];   // [lng, lat]
export const HUANCAYO_ZOOM = 13;
export const ZOOM_UBICACION = 17;
export const PRECISION_MAX_M = 100;

// Viabilidad: alta >= 70, media >= 40, baja < 40; sin puntaje -> gris.
export const NIVELES = {
  alta: { label: 'Alta', color: '#2f7a5a' },
  media: { label: 'Media', color: '#c98f3a' },
  baja: { label: 'Baja', color: '#a9473f' },
  sin: { label: 'Sin puntaje', color: '#8a948e' },
};
export const nivelViabilidad = (puntaje) => {
  if (puntaje === null || puntaje === undefined) return 'sin';
  return puntaje >= 70 ? 'alta' : puntaje >= 40 ? 'media' : 'baja';
};

// Bounds [[minLng, minLat], [maxLng, maxLat]] de una lista de geometrías Polygon.
export function boundsOf(geometries) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const g of geometries) {
    for (const ring of g.coordinates) {
      for (const [lng, lat] of ring) {
        b[0] = Math.min(b[0], lng); b[1] = Math.min(b[1], lat);
        b[2] = Math.max(b[2], lng); b[3] = Math.max(b[3], lat);
      }
    }
  }
  return b[0] === Infinity ? null : [[b[0], b[1]], [b[2], b[3]]];
}

// Colores de los lugares cercanos por categoría (clave del backend); las nuevas usan COLOR_LUGAR_DEFECTO.
export const COLORES_LUGARES = { via_principal: '#c0392b', colegio: '#2c6fbb', universidad: '#7b4fa3' };
export const COLOR_LUGAR_DEFECTO = '#555f5a';
export const colorLugar = (clave) => COLORES_LUGARES[clave] || COLOR_LUGAR_DEFECTO;

export const formatM2 = (n) =>
  `${Number(n).toLocaleString('es-PE', { maximumFractionDigits: 2 })} m²`;

export { mapboxgl };
