import MapboxDraw from '@mapbox/mapbox-gl-draw';
import { HUANCAYO } from './mapConfig.js';

// Zonas por las que no se puede dibujar: vías principales, ríos y lagos. Salen de las teselas de
// Mapbox Streets (capas invisibles al cálculo, pero pintadas en rojo tenue), así valen en calle y satélite.
const FUENTE = 'zonas-prohibidas';
const ROJO = '#c0392b';
const TOL_PX = 2;     // holgura de la consulta alrededor del cursor
const PASO_PX = 5;    // separación entre muestras al revisar un lado
// Ancho total (m) de la franja de cada clase; coincide con VIAS_ANCHOS_M del backend (regla R3).
const ANCHO_VIA_M = { motorway: 16, trunk: 14, primary: 12, secondary: 10 };
const ANCHO_RIO_M = { river: 10, canal: 5 };
const CAPAS = ['zp-agua', 'zp-rios', 'zp-vias'];

export const MENSAJE_ZONA = 'No se puede dibujar sobre una vía principal, un río o un lago (zonas en rojo).';

// Píxeles por metro en zoom 10 a la latitud de trabajo; se duplica con cada nivel de zoom.
const PX_POR_M_Z10 = 1024 / (78271.517 * Math.cos((HUANCAYO[1] * Math.PI) / 180));
const anchoPx = (tabla) => {
  const m = ['match', ['get', 'class'], ...Object.entries(tabla).flat(), 0];
  return ['interpolate', ['exponential', 2], ['zoom'], 10, ['*', m, PX_POR_M_Z10], 22, ['*', m, PX_POR_M_Z10 * 4096]];
};
const claseEn = (tabla) => ['match', ['get', 'class'], Object.keys(tabla), true, false];

// Idempotente: se llama al cargar y tras cada cambio de estilo (setStyle borra fuentes y capas).
export function instalarZonas(map, antesDe) {
  if (!map.getSource(FUENTE)) map.addSource(FUENTE, { type: 'vector', url: 'mapbox://mapbox.mapbox-streets-v8' });
  const antes = map.getLayer(antesDe) ? antesDe : undefined;
  const add = (capa) => { if (!map.getLayer(capa.id)) map.addLayer({ source: FUENTE, ...capa }, antes); };
  add({ id: 'zp-agua', type: 'fill', 'source-layer': 'water', paint: { 'fill-color': ROJO, 'fill-opacity': 0.22 } });
  add({ id: 'zp-rios', type: 'line', 'source-layer': 'waterway', filter: claseEn(ANCHO_RIO_M),
    layout: { 'line-cap': 'round' }, paint: { 'line-color': ROJO, 'line-opacity': 0.3, 'line-width': anchoPx(ANCHO_RIO_M) } });
  add({ id: 'zp-vias', type: 'line', 'source-layer': 'road',
    filter: ['all', ['==', ['geometry-type'], 'LineString'], claseEn(ANCHO_VIA_M), ['!=', ['get', 'structure'], 'tunnel']],
    layout: { 'line-cap': 'butt' }, paint: { 'line-color': ROJO, 'line-opacity': 0.3, 'line-width': anchoPx(ANCHO_VIA_M) } });
}

// p: punto en píxeles { x, y }.
export function puntoBloqueado(map, p) {
  const capas = CAPAS.filter((id) => map.getLayer(id));
  if (!capas.length) return false;
  return map.queryRenderedFeatures([[p.x - TOL_PX, p.y - TOL_PX], [p.x + TOL_PX, p.y + TOL_PX]], { layers: capas }).length > 0;
}

// a, b: [lng, lat]. Revisa los puntos intermedios del lado (los extremos se validan aparte).
export function ladoBloqueado(map, a, b) {
  const pa = map.project(a);
  const pb = map.project(b);
  const d = Math.hypot(pb.x - pa.x, pb.y - pa.y);
  const n = Math.ceil(d / PASO_PX);
  for (let i = 1; i < n; i++) {
    const s = (i * d) / n;
    if (s <= TOL_PX + 1 || d - s <= TOL_PX + 1) continue;
    const t = i / n;
    if (puntoBloqueado(map, { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t })) return true;
  }
  return false;
}

// ring: vértices [lng, lat] sin repetir el primero al final.
function anilloBloqueado(map, ring) {
  return ring.some((v, i) => puntoBloqueado(map, map.project(v)) || ladoBloqueado(map, v, ring[(i + 1) % ring.length]));
}

const esVertice = (e) => e.featureTarget?.properties?.meta === 'vertex';
const mismoPunto = (e, c) => e.lngLat.lng === c[0] && e.lngLat.lat === c[1];   // igual que Draw al cerrar con doble clic
const avisar = (map) => map.fire('zonabloqueada');
const cursor = (map, bloqueado) => map.getCanvasContainer().classList.toggle('zona-bloqueada', bloqueado);

// Mueve las figuras seleccionadas y deshace el movimiento si alguna queda sobre una zona prohibida.
function moverProtegido(modo, mover) {
  const figuras = modo.getSelected();
  const antes = figuras.map((f) => JSON.parse(JSON.stringify(f.getCoordinates())));
  mover();
  const bloqueado = figuras.some((f) => f.getCoordinates().some((ring) => anilloBloqueado(modo.map, ring.slice(0, -1))));
  if (bloqueado) { figuras.forEach((f, i) => f.incomingCoords(antes[i])); avisar(modo.map); }
  cursor(modo.map, bloqueado);
}

// Modos de MapboxDraw que ignoran el clic o el arrastre que cruzaría una zona prohibida.
export function crearModos() {
  const { draw_polygon: baseDibujo, direct_select: baseEdicion, simple_select: baseSeleccion } = MapboxDraw.modes;

  const dibujo = { ...baseDibujo };
  const reales = (state) => state.polygon.coordinates[0].slice(0, state.currentVertexPosition);
  const cierreBloqueado = (map, r) => r.length >= 3 && ladoBloqueado(map, r[r.length - 1], r[0]);

  const contar = (map, state) => map.fire('puntosdibujo', { n: state.currentVertexPosition });
  // Quita la última esquina colocada; el punto móvil pasa a ocupar su lugar.
  const deshacer = (modo, state) => {
    if (state.currentVertexPosition === 0) return;
    state.polygon.coordinates[0].splice(state.currentVertexPosition - 1, 1);
    state.currentVertexPosition -= 1;
    state.polygon.changed();
    contar(modo.map, state);
  };
  dibujo.onSetup = function (opts) {
    const state = baseDibujo.onSetup.call(this, opts);
    state.alDeshacer = () => deshacer(this, state);
    this.map.on('deshacerpunto', state.alDeshacer);
    contar(this.map, state);
    return state;
  };
  dibujo.onMouseMove = function (state, e) {
    baseDibujo.onMouseMove.call(this, state, e);
    const r = reales(state);
    cursor(this.map, puntoBloqueado(this.map, e.point)
      || (r.length > 0 && ladoBloqueado(this.map, r[r.length - 1], [e.lngLat.lng, e.lngLat.lat])));
  };
  dibujo.onClick = dibujo.onTap = function (state, e) {
    const r = reales(state);
    const cierra = esVertice(e) || (r.length > 0 && mismoPunto(e, r[r.length - 1]));
    const bloqueado = cierra
      ? cierreBloqueado(this.map, r)
      : puntoBloqueado(this.map, e.point) || (r.length > 0 && ladoBloqueado(this.map, r[r.length - 1], [e.lngLat.lng, e.lngLat.lat]));
    if (bloqueado) { avisar(this.map); return undefined; }
    const res = baseDibujo.onClick.call(this, state, e);
    contar(this.map, state);
    return res;
  };
  dibujo.onKeyUp = function (state, e) {
    if (e.keyCode === 13 && cierreBloqueado(this.map, reales(state))) { avisar(this.map); return; }
    if (e.keyCode === 8 || ((e.ctrlKey || e.metaKey) && e.keyCode === 90)) { deshacer(this, state); return; }
    baseDibujo.onKeyUp.call(this, state, e);
  };
  dibujo.onStop = function (state) {
    cursor(this.map, false);
    this.map.off('deshacerpunto', state.alDeshacer);
    this.map.fire('puntosdibujo', { n: 0 });
    baseDibujo.onStop.call(this, state);
  };

  const edicion = { ...baseEdicion };
  // El vértice sigue al cursor y se queda quieto mientras el cursor, o alguno de sus dos lados, caiga en una zona.
  edicion.dragVertex = function (state, e, delta) {
    if (state.selectedCoordPaths.length !== 1) { baseEdicion.dragVertex.call(this, state, e, delta); return; }
    const ruta = state.selectedCoordPaths[0];
    const ring = state.feature.getCoordinates()[0];
    const n = ring.length - 1;
    const i = Number(ruta.split('.')[1]);
    const nuevo = [e.lngLat.lng, e.lngLat.lat];
    const bloqueado = puntoBloqueado(this.map, e.point)
      || ladoBloqueado(this.map, ring[(i - 1 + n) % n], nuevo) || ladoBloqueado(this.map, nuevo, ring[(i + 1) % n]);
    cursor(this.map, bloqueado);
    if (bloqueado) { avisar(this.map); return; }
    state.feature.updateCoordinate(ruta, nuevo[0], nuevo[1]);
  };
  edicion.dragFeature = function (state, e, delta) {
    moverProtegido(this, () => baseEdicion.dragFeature.call(this, state, e, delta));
  };
  const originalStop = baseEdicion.onStop;
  edicion.onStop = function (state) {
    cursor(this.map, false);
    if (originalStop) originalStop.call(this, state);
  };

  const seleccion = { ...baseSeleccion };
  seleccion.dragMove = function (state, e) {
    moverProtegido(this, () => baseSeleccion.dragMove.call(this, state, e));
  };

  return { ...MapboxDraw.modes, draw_polygon: dibujo, direct_select: edicion, simple_select: seleccion };
}
