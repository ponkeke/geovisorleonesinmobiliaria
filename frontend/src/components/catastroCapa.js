// Capa catastral de referencia (COFOPRI): lotes y sectores de TODO el país (Junín incluido), dibujados en vivo.
//
// Los datos NO se guardan en la aplicación: cada «tesela» del mapa se pide al servicio público de COFOPRI
//   https://geo.serfor.gob.pe/geoservicios/rest/services/Integracion/Int_IDE_COFOPRI_PSAD56/MapServer
// (capas LOTES_PSAD56 = 2 y PUEBLOS_PSAD56 = 3), con un estilo propio: solo contornos, sin relleno.
//
// Posición: los datos de COFOPRI están en PSAD56 y, ya convertidos a WGS84, caen ≈ 11 m al oeste de las calles de
// OpenStreetMap (la base de Mapbox). Medido en BASE (Huancayo), Jauja y Tarma: +12,7 / +9,5 / +11,5 m al este y
// entre −3,5 y +1,8 m al norte. Se aplica el promedio (DESFASE_CATASTRO_M) a cada petición; el error esperado en
// esas ciudades es de unos ±4 m y no está verificado en otras zonas. El backend usa el mismo desfase al consultar
// un lote por punto (CATASTRO_DESFASE_ESTE_M / CATASTRO_DESFASE_NORTE_M).
//
// Predios RURALES de Junín (MIDAGRI, servicio «Catastro_Rural», capa 0 «Predio Rural»): se dibujan igual, en violeta, con el
// filtro id_dist LIKE '12%' (ubigeo de Junín). Ese servicio ya publica en WGS84, así que NO lleva el desfase de COFOPRI;
// no dibuja nada más lejos que 1:200 000 (≈ zoom 11) y a veces tarda varios segundos por tesela.
//
// Es solo REFERENCIAL: no reemplaza a SUNARP ni al catastro municipal.
export const SERVICIO_CATASTRO = (import.meta.env.VITE_CATASTRO_URL
  || 'https://geo.serfor.gob.pe/geoservicios/rest/services/Integracion/Int_IDE_COFOPRI_PSAD56/MapServer').replace(/\/+$/, '');

export const SERVICIO_RURAL = (import.meta.env.VITE_CATASTRO_RURAL_URL
  || 'https://georural.midagri.gob.pe/geoservicios/rest/services/servicios_ogc/Catastro_Rural/MapServer').replace(/\/+$/, '');
export const UBIGEO_JUNIN = '12';
// Predios rurales desactivados por ahora; VITE_CATASTRO_RURAL=true los vuelve a mostrar (y CATASTRO_RURAL=true en el backend).
export const CATASTRO_RURAL = String(import.meta.env.VITE_CATASTRO_RURAL ?? '').toLowerCase() === 'true';

// Metros que se mueve la capa hacia el este y el norte (el norte negativo la baja un poco).
export const DESFASE_CATASTRO_M = { este: 11.5, norte: -1 };

export const ZOOM_MIN_LOTES = 15;                 // más lejos hay demasiados lotes por tesela
export const ZOOM_MIN_SECTORES = 10;
export const ZOOM_MIN_RURAL = 13;
// Zoom desde el que un clic puede caer sobre un predio visible.
export const ZOOM_MIN_CLIC = CATASTRO_RURAL ? ZOOM_MIN_RURAL : ZOOM_MIN_LOTES;
export const COLOR_LOTES = '#f59e0b';      // urbano (COFOPRI)
export const COLOR_SECTOR = '#dc2626';
export const COLOR_RURAL = '#9333ea';      // rural (MIDAGRI)

// Vista inicial al activar la capa si el mapa está lejos de Junín: el sector BASE de Huancayo.
const INICIO = [[-75.2352, -12.0612], [-75.2288, -12.0548]];
const EN_JUNIN = { oeste: -76.7, este: -73.5, sur: -13.0, norte: -10.1 };

const FACTOR_MERCATOR = 1 / Math.cos((12 * Math.PI) / 180);   // metros del mapa por metro de terreno a ~12° S

const estilo = (capa, rgb, ancho, filtro) => ({
  id: capa, source: { type: 'mapLayer', mapLayerId: capa },
  ...(filtro && { definitionExpression: filtro }),
  drawingInfo: { showLabels: false, renderer: { type: 'simple', symbol: {
    type: 'esriSFS', style: 'esriSFSNull',
    outline: { type: 'esriSLS', style: 'esriSLSSolid', color: [...rgb, 255], width: ancho },
  } } },
});

// URL de teselas del servicio (ArcGIS «export»): Mapbox reemplaza {bbox-epsg-3857} por cada tesela.
const teselas = (capa, rgb, ancho, servicio = SERVICIO_CATASTRO, filtro) => `${servicio}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857`
  + `&size=512,512&format=png32&transparent=true&dynamicLayers=${encodeURIComponent(JSON.stringify([estilo(capa, rgb, ancho, filtro)]))}&f=image`;

const CAPAS = [
  { id: 'catastro-sectores', url: teselas(3, [220, 38, 38], 2.2), minzoom: ZOOM_MIN_SECTORES },
  { id: 'catastro-lotes', url: teselas(2, [245, 158, 11], 1.3), minzoom: ZOOM_MIN_LOTES },
  ...(CATASTRO_RURAL
    ? [{ id: 'catastro-rural', url: teselas(0, [147, 51, 234], 1.1, SERVICIO_RURAL, `id_dist LIKE '${UBIGEO_JUNIN}%'`), minzoom: ZOOM_MIN_RURAL }]
    : []),
];

// Para `transformRequest` del mapa: corrige la posición de las teselas del catastro. Pedir el recuadro corrido hacia
// el oeste/sur hace que la capa se vea corrida hacia el este/norte.
export function transformarPeticion(url, tipo) {
  if (tipo !== 'Tile' || !url.startsWith(SERVICIO_CATASTRO)) return undefined;
  const dx = DESFASE_CATASTRO_M.este * FACTOR_MERCATOR;
  const dy = DESFASE_CATASTRO_M.norte * FACTOR_MERCATOR;
  return {
    url: url.replace(/bbox=([^&]+)/, (_m, b) => {
      const [x0, y0, x1, y1] = decodeURIComponent(b).split(',').map(Number);
      return `bbox=${[x0 - dx, y0 - dy, x1 - dx, y1 - dy].join(',')}`;
    }),
  };
}

// Agrega las fuentes y capas (si faltan). Se llama tras cada carga o cambio de estilo, porque setStyle las elimina.
// `antesDe` es el id de la capa sobre la que se quiere que quede (para no tapar el dibujo ni los terrenos).
// Con { sectores: false } no se agrega el contorno rojo de los sectores (el selector de predios usa el rojo para otra cosa).
export function instalarCatastro(map, visible, antesDe, { sectores = true } = {}) {
  const antes = antesDe && map.getLayer(antesDe) ? antesDe : undefined;
  for (const c of CAPAS) {
    if (!sectores && c.id === 'catastro-sectores') continue;
    if (!map.getSource(c.id)) {
      map.addSource(c.id, { type: 'raster', tiles: [c.url], tileSize: 512, maxzoom: 19, attribution: c.id === 'catastro-rural' ? 'Catastro rural: MIDAGRI (referencial)' : 'Catastro: COFOPRI (referencial)' });
    }
    if (!map.getLayer(`${c.id}-img`)) {
      map.addLayer({
        id: `${c.id}-img`, type: 'raster', source: c.id, minzoom: c.minzoom,
        layout: { visibility: visible ? 'visible' : 'none' },
        paint: { 'raster-opacity': 0.95, 'raster-fade-duration': 0 },
      }, antes);
    }
  }
}

// Muestra u oculta la capa. Al mostrarla, si el mapa está lejos de Junín o muy alejado, se acerca al sector BASE.
export function mostrarCatastro(map, visible) {
  for (const c of CAPAS) {
    if (map.getLayer(`${c.id}-img`)) map.setLayoutProperty(`${c.id}-img`, 'visibility', visible ? 'visible' : 'none');
  }
  if (!visible) return;
  const { lng, lat } = map.getCenter();
  const enJunin = lng > EN_JUNIN.oeste && lng < EN_JUNIN.este && lat > EN_JUNIN.sur && lat < EN_JUNIN.norte;
  if (!enJunin || map.getZoom() < ZOOM_MIN_SECTORES) map.fitBounds(INICIO, { padding: 40, duration: 900 });
}
