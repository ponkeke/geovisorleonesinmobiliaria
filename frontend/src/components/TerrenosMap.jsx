import { useEffect, useRef, useState } from 'react';
import {
  mapboxgl, hasMapboxToken, ESTILOS, aplicarMarca, DEFAULT_CENTER, NIVELES, nivelViabilidad, boundsOf, colorLugar,
} from './mapConfig.js';
import LugaresCercanos from './LugaresCercanos.jsx';
import TokenWarning from './TokenWarning.jsx';
import Icon from './Icon.jsx';
import SelectorCapas from './SelectorCapas.jsx';
import { codigoTerreno } from '../utils/format.js';
import { cargarIconos, nombreIcono } from './iconosLugares.js';

const NONE = ['==', ['get', 'id'], -1];
const PUNTO_RADIO = 12;
const PUNTO_RADIO_SEL = 16;
const ICONO_TAM = 0.62;
const ICONO_TAM_SEL = 0.85;
const AREA_OPACIDAD = 0.3;
const AREA_OPACIDAD_SEL = 0.55;
const LINEA_ANCHO = 4;
const LINEA_ANCHO_SEL = 9;

// Valor normal, o el resaltado para el lugar `id` (ids de OSM: "way/123").
const resaltar = (id, normal, sel) => (id ? ['case', ['==', ['get', 'id'], id], sel, normal] : normal);

// Polígonos + pines de terrenos candidatos, coloreados por viabilidad.
export default function TerrenosMap({ terrenos, selectedId, onSelect, lugares, resaltadoId, cercanos, onReintentarCercanos, onResaltar, ocultarViabilidad = false }) {
  const [listaAbierta, setListaAbierta] = useState(true);   // la lista de lugares cercanos se puede plegar
  const el = useRef(null);
  const mapRef = useRef(null);
  const labelRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const fittedRef = useRef(false);
  const instalarRef = useRef(() => {});
  const [ready, setReady] = useState(false);
  const [capa, setCapa] = useState('calle');   // calle | satelite | relieve
  const [version, setVersion] = useState(0);   // sube al cambiar de estilo para volver a cargar los datos

  const conGeometria = (terrenos || []).filter((t) => t.geometria);

  useEffect(() => {
    if (!hasMapboxToken) return undefined;
    const map = new mapboxgl.Map({ container: el.current, style: ESTILOS.calle, center: DEFAULT_CENTER, zoom: 6 });
    mapRef.current = map;

    // Fuentes y capas propias; se repiten tras cada cambio de estilo (setStyle las elimina).
    instalarRef.current = () => {
      const empty = { type: 'FeatureCollection', features: [] };
      map.addSource('poligonos', { type: 'geojson', data: empty });
      map.addSource('pines', { type: 'geojson', data: empty });
      map.addSource('lugares', { type: 'geojson', data: empty });
      map.addSource('lugares-trazo', { type: 'geojson', data: empty });
      map.addSource('lugares-area', { type: 'geojson', data: empty });
      cargarIconos(map);
      map.addLayer({ id: 'poligonos-fill', type: 'fill', source: 'poligonos',
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.3 } });
      map.addLayer({ id: 'poligonos-line', type: 'line', source: 'poligonos',
        paint: { 'line-color': ['get', 'color'], 'line-width': 2 } });
      map.addLayer({ id: 'poligonos-sel', type: 'line', source: 'poligonos', filter: NONE,
        paint: { 'line-color': '#2b4a3e', 'line-width': 4 } });
      map.addLayer({ id: 'lugares-area', type: 'fill', source: 'lugares-area',
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': AREA_OPACIDAD } });
      map.addLayer({ id: 'lugares-area-borde', type: 'line', source: 'lugares-area',
        paint: { 'line-color': ['get', 'color'], 'line-width': 2 } });
      map.addLayer({ id: 'lugares-trazo', type: 'line', source: 'lugares-trazo',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': LINEA_ANCHO, 'line-opacity': 0.9 } });
      map.addLayer({ id: 'lugares', type: 'circle', source: 'lugares',
        paint: { 'circle-radius': PUNTO_RADIO, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      map.addLayer({ id: 'lugares-icono', type: 'symbol', source: 'lugares',
        layout: { 'icon-image': ['get', 'icono'], 'icon-size': ICONO_TAM, 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
      map.addLayer({ id: 'pines', type: 'circle', source: 'pines',
        paint: { 'circle-radius': 11, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
      map.addLayer({ id: 'pines-sel', type: 'circle', source: 'pines', filter: NONE,
        paint: { 'circle-radius': 15, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 4 } });
    };

    map.on('load', () => {
      aplicarMarca(map, 'calle');
      instalarRef.current();
      let popup = null;   // un solo popup a la vez (un parque responde por su zona y por su icono)
      for (const layer of ['lugares', 'lugares-trazo', 'lugares-area']) {
        map.on('click', layer, (e) => {
          popup?.remove();
          const f = e.features[0];
          const div = document.createElement('div');
          const b = document.createElement('b');
          b.textContent = f.properties.nombre;
          const s = document.createElement('div');
          s.textContent = `${f.properties.etiqueta} · ${f.properties.distancia} m`;
          div.append(b, s);
          popup = new mapboxgl.Popup({ offset: 10 }).setLngLat(e.lngLat).setDOMContent(div).addTo(map);
        });
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
      }

      for (const layer of ['pines', 'poligonos-fill']) {
        map.on('click', layer, (e) => onSelectRef.current(e.features[0].properties.id));
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
      }
      setReady(true);
    });
    return () => { labelRef.current?.remove(); map.remove(); mapRef.current = null; };
  }, []);

  // Datos: se actualizan al cambiar la lista; la primera vez con datos encuadra todos los terrenos.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getSource('poligonos')) return;
    const color = (t) => NIVELES[nivelViabilidad(t.puntaje_total)].color;
    map.getSource('poligonos').setData({
      type: 'FeatureCollection',
      features: conGeometria.map((t) => ({
        type: 'Feature', geometry: t.geometria, properties: { id: t.id_terreno, color: color(t) },
      })),
    });
    map.getSource('pines').setData({
      type: 'FeatureCollection',
      features: conGeometria.map((t) => ({
        type: 'Feature', geometry: t.punto, properties: { id: t.id_terreno, color: color(t) },
      })),
    });
    if (!fittedRef.current && conGeometria.length) {
      map.fitBounds(boundsOf(conGeometria.map((t) => t.geometria)), { padding: 80, maxZoom: 16, duration: 0 });
      fittedRef.current = true;
    }
  }, [ready, terrenos, version]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lugares cercanos del terreno seleccionado: las vías con tramo se dibujan como línea; el resto, como punto.
  const lugaresPlanos = (lugares || []).flatMap((c) => c.lugares.map((l) => ({ ...l, clave: c.clave, etiqueta: c.etiqueta })));
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getSource('lugares')) return;
    const visibles = selectedId ? lugaresPlanos : [];
    const props = (l) => ({
      id: l.id, nombre: l.nombre, etiqueta: l.etiqueta, distancia: Math.round(l.distancia_m),
      color: colorLugar(l.clave), icono: nombreIcono(l.clave),
    });
    map.getSource('lugares').setData({
      type: 'FeatureCollection',
      features: visibles.filter((l) => !l.trazo).map((l) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [l.lng, l.lat] }, properties: props(l),
      })),
    });
    map.getSource('lugares-area').setData({
      type: 'FeatureCollection',
      features: visibles.filter((l) => l.area).map((l) => ({ type: 'Feature', geometry: l.area, properties: props(l) })),
    });
    map.getSource('lugares-trazo').setData({
      type: 'FeatureCollection',
      features: visibles.filter((l) => l.trazo).map((l) => ({ type: 'Feature', geometry: l.trazo, properties: props(l) })),
    });
  }, [ready, lugares, selectedId, version]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resalta en el mapa el lugar con el mouse encima en la lista: el punto crece / el tramo se engruesa.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getLayer('lugares-trazo')) return;
    map.setPaintProperty('lugares', 'circle-radius', resaltar(resaltadoId, PUNTO_RADIO, PUNTO_RADIO_SEL));
    map.setPaintProperty('lugares-trazo', 'line-width', resaltar(resaltadoId, LINEA_ANCHO, LINEA_ANCHO_SEL));
    map.setPaintProperty('lugares-area', 'fill-opacity', resaltar(resaltadoId, AREA_OPACIDAD, AREA_OPACIDAD_SEL));
    map.setPaintProperty('lugares-area-borde', 'line-width', resaltar(resaltadoId, 2, 5));
    map.setLayoutProperty('lugares-icono', 'icon-size', resaltar(resaltadoId, ICONO_TAM, ICONO_TAM_SEL));
  }, [ready, resaltadoId, version]);

  // Selección: resalta, rotula con el código y centra el terreno elegido.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    labelRef.current?.remove();
    labelRef.current = null;
    const t = conGeometria.find((x) => x.id_terreno === selectedId);
    if (t) {
      const div = document.createElement('div');
      div.className = 'pin-label';
      div.textContent = codigoTerreno(t.id_terreno);
      labelRef.current = new mapboxgl.Marker({ element: div, anchor: 'bottom', offset: [0, -20] })
        .setLngLat(t.punto.coordinates).addTo(map);
      map.fitBounds(boundsOf([t.geometria]), { padding: 120, maxZoom: 17 });
    }
  }, [ready, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getLayer('pines-sel')) return;
    const filter = selectedId ? ['==', ['get', 'id'], selectedId] : NONE;
    map.setFilter('poligonos-sel', filter);
    map.setFilter('pines-sel', filter);
  }, [ready, selectedId, version]);

  const cambiarCapa = (nueva) => {
    if (nueva === capa || !mapRef.current) return;
    const map = mapRef.current;
    setCapa(nueva);
    map.once('style.load', () => {
      aplicarMarca(map, nueva);
      instalarRef.current();
      setVersion((v) => v + 1);
    });
    map.setStyle(ESTILOS[nueva]);
  };

  const centrar = () => {
    const sel = conGeometria.find((x) => x.id_terreno === selectedId);
    const geoms = (sel ? [sel] : conGeometria).map((t) => t.geometria);
    if (geoms.length) mapRef.current.fitBounds(boundsOf(geoms), { padding: 80, maxZoom: 17 });
  };

  if (!hasMapboxToken) return <TokenWarning />;

  return (
    <div className="map-card fill">
      <div ref={el} className="map" />
      <div className="legend">
        {!ocultarViabilidad && (<>
          <b>VIABILIDAD</b>
          {['alta', 'media', 'baja', 'sin'].map((k) => (
            <span key={k}><i style={{ background: NIVELES[k].color }} />{NIVELES[k].label}</span>
          ))}
        </>)}
        {selectedId && lugares?.some((c) => c.lugares.length > 0) && (<>
          <b>LUGARES CERCANOS</b>
          {lugares.map((c) => (
            <span key={c.clave}><i style={{ background: colorLugar(c.clave) }} />{c.etiqueta}</span>
          ))}
          <small>Datos de OpenStreetMap</small>
        </>)}
      </div>
      {selectedId && cercanos && (
        <div className={`map-lugares${listaAbierta ? '' : ' cerrada'}`}>
          <button type="button" className="map-lugares-cab" aria-expanded={listaAbierta} onClick={() => setListaAbierta((v) => !v)}>
            <b>ENTORNO DEL TERRENO</b><span aria-hidden="true" className="chevron" />
          </button>
          {listaAbierta && (
            <div className="map-lugares-cuerpo">
              <LugaresCercanos cercanos={cercanos} onReintentar={onReintentarCercanos} onResaltar={onResaltar} sinTitulo />
            </div>
          )}
        </div>
      )}
      <div className="map-controls">
        <button type="button" onClick={() => mapRef.current.zoomIn()} aria-label="Acercar" title="Acercar"><Icon name="plus" /></button>
        <button type="button" onClick={() => mapRef.current.zoomOut()} aria-label="Alejar" title="Alejar"><Icon name="minus" /></button>
        <button type="button" onClick={centrar} aria-label="Centrar" title={selectedId ? 'Centrar en el terreno' : 'Ver todos los terrenos'}><Icon name="target" /></button>
      </div>
      <SelectorCapas capa={capa} onChange={cambiarCapa} disabled={!ready} />
    </div>
  );
}
