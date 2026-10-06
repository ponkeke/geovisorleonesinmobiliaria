import { useEffect, useRef, useState } from 'react';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import turfArea from '@turf/area';
import {
  mapboxgl, hasMapboxToken, MAPBOX_TOKEN, MAP_STYLE, HUANCAYO, HUANCAYO_ZOOM, ZOOM_UBICACION, PRECISION_MAX_M, boundsOf, formatM2,
} from './mapConfig.js';
import TokenWarning from './TokenWarning.jsx';
import { validarPoligono } from '../services/api.js';
import Icon from './Icon.jsx';

const STYLE_CALLE = MAP_STYLE;
const STYLE_SATELITE = 'mapbox://styles/mapbox/satellite-streets-v12';
const AVISO_UBICACION = 'Tu ubicación aproximada puede no ser exacta. Busca la dirección o ajusta el mapa manualmente.';
const GREEN = '#2b4a3e';
const FILL = '#2f7a5a';
const ROJO = '#c0392b';
const vertex = ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex']];
const DRAW_STYLES = [
  { id: 'poly-fill', type: 'fill', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': ['case', ['==', ['get', 'user_invalido'], 'true'], ROJO, FILL], 'fill-opacity': 0.3 } },
  { id: 'poly-stroke', type: 'line', filter: ['==', '$type', 'Polygon'],
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['case', ['==', ['get', 'user_invalido'], 'true'], ROJO, GREEN], 'line-width': 2.5 } },
  { id: 'line', type: 'line', filter: ['==', '$type', 'LineString'],
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': GREEN, 'line-width': 2.5, 'line-dasharray': [2, 2] } },
  // Vértices visibles también mientras se dibuja (los puntos propios de Draw solo aparecen al editar).
  { id: 'poly-vertices-live', type: 'circle', filter: ['all', ['==', '$type', 'Polygon'], ['==', 'active', 'true']],
    paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-color': GREEN, 'circle-stroke-width': 2 } },
  { id: 'vertex-halo', type: 'circle', filter: vertex, paint: { 'circle-radius': 7, 'circle-color': '#fff' } },
  { id: 'vertex', type: 'circle', filter: vertex, paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-color': GREEN, 'circle-stroke-width': 2 } },
  { id: 'midpoint', type: 'circle', filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']],
    paint: { 'circle-radius': 3, 'circle-color': FILL } },
];

// Dibujo de UN polígono editable. onChange({ geometry, area }) o onChange(null) si no hay polígono.
// `area` (m², turf) es solo informativa: el área oficial la calcula el servidor.
export default function PolygonPicker({ onChange, onValidacion, initial = null }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const drawRef = useRef(null);
  const problemaRef = useRef(null);
  const instalarProblemaRef = useRef(() => {});
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onValidacionRef = useRef(onValidacion);
  onValidacionRef.current = onValidacion;
  const validandoRef = useRef(0);   // nº de petición vigente (descarta respuestas viejas)

  const [area, setArea] = useState(null);
  const [query, setQuery] = useState('');
  const [searchMsg, setSearchMsg] = useState('');
  const [searching, setSearching] = useState(false);
  const [avisoUbicacion, setAvisoUbicacion] = useState(false);
  const [modo, setModo] = useState(initial ? 'listo' : 'idle');   // idle | dibujando | listo
  const [puntos, setPuntos] = useState(0);
  const [satelite, setSatelite] = useState(false);
  const [validacion, setValidacion] = useState({ estado: 'ninguno', errores: [], avisos: [] });

  useEffect(() => {
    if (!hasMapboxToken) return undefined;
    const map = new mapboxgl.Map({ container: el.current, style: MAP_STYLE, center: HUANCAYO, zoom: HUANCAYO_ZOOM,
      locale: { 'GeolocateControl.FindMyLocation': 'Usar mi ubicación', 'GeolocateControl.LocationNotAvailable': 'Ubicación no disponible' },
    });
    // Solo ayuda a centrar: sin seguimiento, con círculo de precisión; el polígono lo dibuja el usuario.
    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
      showAccuracyCircle: true,
      showUserLocation: true,
    });
    map.addControl(geolocate, 'top-right');
    geolocate.on('geolocate', (e) => {
      map.easeTo({ center: [e.coords.longitude, e.coords.latitude], zoom: ZOOM_UBICACION });
      setAvisoUbicacion(e.coords.accuracy > PRECISION_MAX_M);
    });
    geolocate.on('error', () => setAvisoUbicacion(true));
    // Con el permiso ya denegado Mapbox deshabilita el botón y no emite 'error': se avisa igual.
    let permiso = null;
    navigator.permissions?.query({ name: 'geolocation' }).then((p) => {
      permiso = p;
      const revisar = () => { if (p.state === 'denied') setAvisoUbicacion(true); };
      revisar();
      p.onchange = revisar;
    }).catch(() => {});
    const draw = new MapboxDraw({ displayControlsDefault: false, styles: DRAW_STYLES });
    map.addControl(draw);
    mapRef.current = map;
    drawRef.current = draw;

    const poligono = () => draw.getAll().features.find((x) => x.geometry.coordinates[0]?.length >= 4);
    // Zona problemática (R1-R4) en rojo sobre el mapa; se reinstala tras cambiar de estilo.
    const VACIO = { type: 'FeatureCollection', features: [] };
    const instalarProblema = () => {
      if (map.getSource('problema')) return;
      map.addSource('problema', { type: 'geojson', data: VACIO });
      map.addLayer({ id: 'problema-fill', type: 'fill', source: 'problema', filter: ['==', '$type', 'Polygon'],
        paint: { 'fill-color': ROJO, 'fill-opacity': 0.55 } });
      map.addLayer({ id: 'problema-line', type: 'line', source: 'problema',
        paint: { 'line-color': ROJO, 'line-width': 3 } });
      map.addLayer({ id: 'problema-punto', type: 'circle', source: 'problema', filter: ['==', '$type', 'Point'],
        paint: { 'circle-radius': 9, 'circle-color': ROJO, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
    };
    const mostrarProblema = (geometry) => {
      problemaRef.current = geometry || null;
      instalarProblema();
      map.getSource('problema').setData(geometry ? { type: 'Feature', properties: {}, geometry } : VACIO);
    };
    instalarProblemaRef.current = () => { instalarProblema(); mostrarProblema(problemaRef.current); };

    const marcar = (f, invalido) => { if (f) draw.setFeatureProperty(f.id, 'invalido', invalido ? 'true' : 'false'); };
    const validar = async (f) => {
      const n = ++validandoRef.current;
      mostrarProblema(null);
      marcar(f, false);
      const poner = (v) => { setValidacion(v); onValidacionRef.current?.(v.estado); };
      poner({ estado: 'validando', errores: [], avisos: [] });
      try {
        const r = await validarPoligono(f.geometry);
        if (n !== validandoRef.current) return;
        if (r.valido) poner({ estado: 'ok', errores: [], avisos: r.avisos || [] });
        else {
          marcar(poligono(), true);
          mostrarProblema(r.geometriaProblema);
          poner({ estado: 'error', errores: r.errores, avisos: r.avisos || [] });
        }
      } catch {
        if (n !== validandoRef.current) return;
        // Sin respuesta (red, límite de uso): no se bloquea; el servidor valida de nuevo al enviar.
        poner({ estado: 'nd', errores: [], avisos: ['No se pudo validar el contorno ahora. El servidor lo revisará al enviar.'] });
      }
    };
    const limpiarValidacion = () => {
      validandoRef.current += 1;
      mostrarProblema(null);
      setValidacion({ estado: 'ninguno', errores: [], avisos: [] });
      onValidacionRef.current?.('ninguno');
    };

    const emit = () => {
      const f = poligono();
      if (!f) { setArea(null); setModo('idle'); onChangeRef.current(null); limpiarValidacion(); return; }
      const m2 = turfArea(f);
      setArea(m2);
      setModo('listo');
      onChangeRef.current({ geometry: f.geometry, area: m2 });
      validar(f);
    };
    // Área y nº de puntos en vivo mientras se dibuja (el anillo incluye el punto móvil y el cierre).
    map.on('draw.render', () => {
      const f = poligono();
      if (!f) { setPuntos(0); return; }
      setArea(turfArea(f));
      setPuntos(Math.max(0, f.geometry.coordinates[0].length - 2));
    });
    map.on('draw.modechange', (e) => {
      if (e.mode === 'draw_polygon') setModo('dibujando');
      else setModo(poligono() ? 'listo' : 'idle');
    });
    map.on('load', () => {
      instalarProblema();
      if (initial) {
        // Restaura el polígono si el usuario volvió del paso anterior.
        draw.add({ type: 'Feature', properties: {}, geometry: initial });
        setArea(turfArea({ type: 'Feature', properties: {}, geometry: initial }));
        validar(poligono());
        map.fitBounds(boundsOf([initial]), { padding: 60, maxZoom: 18, duration: 0 });
      } else {
        draw.changeMode('draw_polygon');
        setModo('dibujando');   // changeMode() de la API es silencioso: no emite draw.modechange
      }
    });
    // Solo un polígono: al terminar uno nuevo se descartan los anteriores.
    map.on('draw.create', (e) => {
      const keep = e.features[0].id;
      const others = draw.getAll().features.map((f) => f.id).filter((id) => id !== keep);
      if (others.length) draw.delete(others);
      emit();
    });
    map.on('draw.update', emit);
    map.on('draw.delete', emit);

    return () => { if (permiso) permiso.onchange = null; map.remove(); mapRef.current = null; drawRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dibujar = () => { drawRef.current.changeMode('draw_polygon'); setModo('dibujando'); };

  // Cierra la figura sin doble clic: al salir de draw_polygon, Draw descarta el punto móvil y emite draw.create.
  const finalizar = () => {
    const draw = drawRef.current;
    draw.changeMode('simple_select');
    if (!draw.getAll().features.some((x) => x.geometry.coordinates[0]?.length >= 4)) { setArea(null); setModo('idle'); }
  };

  const redibujar = () => {
    drawRef.current.deleteAll();
    setArea(null);
    setPuntos(0);
    onChangeRef.current(null);
    validandoRef.current += 1;
    mapRef.current.getSource('problema')?.setData({ type: 'FeatureCollection', features: [] });
    problemaRef.current = null;
    setValidacion({ estado: 'ninguno', errores: [], avisos: [] });
    onValidacionRef.current?.('ninguno');
    drawRef.current.changeMode('draw_polygon');
    setModo('dibujando');
  };

  // setStyle elimina las capas de Draw: se reinstala el control con su polígono.
  const alternarSatelite = () => {
    const map = mapRef.current;
    const draw = drawRef.current;
    const features = draw.getAll();
    const next = !satelite;
    setSatelite(next);
    map.once('style.load', () => {
      map.removeControl(draw);
      map.addControl(draw);
      if (features.features.length) draw.set(features);
      instalarProblemaRef.current();
    });
    map.setStyle(next ? STYLE_SATELITE : STYLE_CALLE);
  };

  const centrar = () => {
    const f = drawRef.current.getAll().features[0];
    const b = f && boundsOf([f.geometry]);
    if (b) mapRef.current.fitBounds(b, { padding: 60, maxZoom: 18 });
    else mapRef.current.flyTo({ center: HUANCAYO, zoom: HUANCAYO_ZOOM });
  };

  const buscar = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchMsg('');
    try {
      const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(query)}&country=pe&proximity=${HUANCAYO.join(',')}&limit=1&language=es&access_token=${MAPBOX_TOKEN}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error();
      const data = await r.json();
      const c = data.features?.[0]?.geometry?.coordinates;
      if (c) mapRef.current.flyTo({ center: c, zoom: 16 });
      else setSearchMsg('No se encontraron resultados');
    } catch {
      setSearchMsg('No se pudo buscar la dirección');
    } finally {
      setSearching(false);
    }
  };

  if (!hasMapboxToken) return <TokenWarning />;

  const AYUDA = {
    idle: 'Pulsa «Dibujar contorno» y marca las esquinas de tu terreno en el mapa.',
    dibujando: puntos >= 3
      ? 'Sigue marcando esquinas o pulsa «Finalizar» para cerrar la figura.'
      : 'Toca o haz clic en el mapa para marcar cada esquina (mínimo 3).',
    listo: 'Arrastra los vértices para ajustar el contorno.',
  };

  return (
    <div className={`map-card picker${modo === 'dibujando' ? ' dibujando' : ''}`}>
      <div className="map-wrap">
        <div ref={el} className="map" />
        <div className="map-search">
          <Icon name="search" size={16} />
          <input
            placeholder="Buscar dirección o referencia"
            value={query}
            disabled={searching}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } }}
          />
        </div>
        {(searchMsg || avisoUbicacion) && (
          <div className="map-msgs">
            {searchMsg && <div className="map-search-msg">{searchMsg}</div>}
            {avisoUbicacion && <div className="map-geo-warning" role="status">{AVISO_UBICACION}</div>}
          </div>
        )}
        <div className="map-controls below-geo">
          <button type="button" onClick={() => mapRef.current.zoomIn()} aria-label="Acercar"><Icon name="plus" /></button>
          <button type="button" onClick={() => mapRef.current.zoomOut()} aria-label="Alejar"><Icon name="minus" /></button>
          <button type="button" onClick={centrar} aria-label="Centrar"><Icon name="target" /></button>
        </div>
        {area !== null && <div className="area-badge"><Icon name="expand" size={15} /> Área {modo === 'listo' ? 'declarada' : 'actual'}: {formatM2(area)}</div>}
      </div>
      <div className="map-toolbar">
        <div className="map-toolbar-text">
          <Icon name="polygon" />
          <div>
            <span>{AYUDA[modo]}</span>
            {validacion.estado === 'validando' && <div className="muted small-note" role="status">Validando el contorno…</div>}
            {validacion.estado === 'ok' && validacion.avisos.length === 0 && <div className="valid-ok small-note" role="status">Contorno válido.</div>}
            {validacion.errores.map((e) => <div key={e.regla} className="valid-error" role="alert">{e.mensaje}</div>)}
            {validacion.avisos.map((a) => <div key={a} className="valid-aviso" role="status">{a}</div>)}
          </div>
        </div>
        <div className="map-toolbar-btns">
          <button type="button" className="btn small" onClick={dibujar} disabled={modo !== 'idle'}>Dibujar contorno</button>
          <button type="button" className="btn small" onClick={finalizar} disabled={modo !== 'dibujando' || puntos < 3}>Finalizar</button>
          <button type="button" className="btn small outline" onClick={redibujar} disabled={modo === 'idle' && area === null}>Borrar y redibujar</button>
          <button type="button" className="btn small outline" onClick={alternarSatelite} disabled={modo === 'dibujando'}
            aria-pressed={satelite}>{satelite ? 'Vista de calle' : 'Vista satélite'}</button>
        </div>
      </div>
    </div>
  );
}
