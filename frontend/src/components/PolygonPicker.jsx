import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import turfArea from '@turf/area';
import {
  mapboxgl, hasMapboxToken, ESTILOS, aplicarMarca, HUANCAYO, HUANCAYO_ZOOM, ZOOM_UBICACION, PRECISION_MAX_M, boundsOf, formatM2,
} from './mapConfig.js';
import TokenWarning from './TokenWarning.jsx';
import { validarPoligono, contornosRegistrados } from '../services/api.js';
import Icon from './Icon.jsx';
import SelectorCapas from './SelectorCapas.jsx';
import BuscadorLugares from './BuscadorLugares.jsx';
import { crearModos, instalarZonas, ladoBloqueado, MENSAJE_ZONA } from './zonasProhibidas.js';

const AVISO_UBICACION = 'Tu ubicación aproximada puede no ser exacta. Busca la dirección o ajusta el mapa manualmente.';
const CONTORNO = '#2b4a3e';
const FILL = '#2f7a5a';
const RESTRINGIDO = '#c0392b';
const REGISTRADO = '#b71c1c';   // terrenos ya registrados (relleno rojo, línea continua)
const vertex = ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex']];
const DRAW_STYLES = [
  { id: 'poly-fill', type: 'fill', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': ['case', ['==', ['get', 'user_invalido'], 'true'], RESTRINGIDO, FILL], 'fill-opacity': 0.38 } },
  // Contorno nuevo con línea discontinua; los terrenos ya registrados llevan línea continua.
  { id: 'poly-stroke', type: 'line', filter: ['==', '$type', 'Polygon'],
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: { 'line-color': ['case', ['==', ['get', 'user_invalido'], 'true'], RESTRINGIDO, CONTORNO], 'line-width': 2.5, 'line-dasharray': [3, 2] } },
  { id: 'line', type: 'line', filter: ['==', '$type', 'LineString'],
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': CONTORNO, 'line-width': 2.5, 'line-dasharray': [2, 2] } },
  // Vértices visibles también mientras se dibuja (los puntos propios de Draw solo aparecen al editar).
  { id: 'poly-vertices-live', type: 'circle', filter: ['all', ['==', '$type', 'Polygon'], ['==', 'active', 'true']],
    paint: { 'circle-radius': 6.5, 'circle-color': '#fff', 'circle-stroke-color': CONTORNO, 'circle-stroke-width': 2.5 } },
  { id: 'vertex-halo', type: 'circle', filter: vertex, paint: { 'circle-radius': 10, 'circle-color': '#fff' } },
  { id: 'vertex', type: 'circle', filter: vertex, paint: { 'circle-radius': 7, 'circle-color': '#fff', 'circle-stroke-color': CONTORNO, 'circle-stroke-width': 2.5 } },
  { id: 'midpoint', type: 'circle', filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']],
    paint: { 'circle-radius': 4, 'circle-color': FILL } },
];

const VACIO = { type: 'FeatureCollection', features: [] };
const VACIO_GEO = VACIO;

// Capas de Draw con línea discontinua y su patrón [raya, hueco]; se animan desplazando el patrón.
const LINEAS_ANIMADAS = [['poly-stroke.cold', 3, 2], ['poly-stroke.hot', 3, 2], ['line.cold', 2, 2], ['line.hot', 2, 2]];
const PASOS_ANIMACION = 20;   // posiciones por ciclo
const MS_POR_PASO = 70;

// Patrón [raya, hueco] corrido `s` unidades hacia delante (mismo largo de ciclo, empieza a mitad de patrón).
function patronDesplazado(raya, hueco, s) {
  if (s <= 0) return [raya, hueco];
  if (s <= hueco) return [0, s, raya, hueco - s];
  const r = s - hueco;
  return [r, hueco, raya - r, hueco];
}const PASOS = ['Dibuja', 'Ajusta', 'Confirma'];

// Distancia en metros entre dos [lng, lat] (haversine).
function distanciaM([lng1, lat1], [lng2, lat2]) {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(a));
}

// Un punto con la longitud de cada lado del anillo, en su punto medio.
function medidasDeLados(ring) {
  const features = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const m = distanciaM(ring[i], ring[i + 1]);
    if (m < 1) continue;
    features.push({
      type: 'Feature', properties: { texto: `${m < 100 ? m.toFixed(1) : Math.round(m)} m` },
      geometry: { type: 'Point', coordinates: [(ring[i][0] + ring[i + 1][0]) / 2, (ring[i][1] + ring[i + 1][1]) / 2] },
    });
  }
  return { type: 'FeatureCollection', features };
}

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
  const [searchMsg, setSearchMsg] = useState('');
  const [avisoUbicacion, setAvisoUbicacion] = useState(false);
  const [modo, setModo] = useState(initial ? 'listo' : 'idle');   // idle | dibujando | listo
  const [puntos, setPuntos] = useState(0);
  const [capa, setCapa] = useState('calle');   // calle | satelite | relieve
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const wrapRef = useRef(null);
  const cardRef = useRef(null);
  const huecoRef = useRef(null);
  const [enUso, setEnUso] = useState(false);   // el usuario está trabajando en el mapa: se atenúa el resto de la página
  const registradosRef = useRef(VACIO_GEO);   // contornos de terrenos ya registrados (se reinstalan al cambiar de estilo)
  const [badgePos, setBadgePos] = useState(null);   // posición { x, y } de la insignia de área si el usuario la movió
  const arrastreRef = useRef(null);
  const marcadorRef = useRef(null);   // chincheta del lugar elegido en el buscador
  const [validacion, setValidacion] = useState({ estado: 'ninguno', errores: [], avisos: [] });
  const [zonaBloqueada, setZonaBloqueada] = useState(false);   // aviso temporal al intentar cruzar vía, río o lago

  useEffect(() => {
    if (!hasMapboxToken) return undefined;
    let temporizador = null;
    const map = new mapboxgl.Map({ container: el.current, style: ESTILOS.calle, center: HUANCAYO, zoom: HUANCAYO_ZOOM,
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
    const draw = new MapboxDraw({ displayControlsDefault: false, styles: DRAW_STYLES, modes: crearModos() });
    map.addControl(draw);
    mapRef.current = map;
    drawRef.current = draw;

    const poligono = () => draw.getAll().features.find((x) => x.geometry.coordinates[0]?.length >= 4);
    // Zona problemática (R1-R4) en rojo sobre el mapa; se reinstala tras cambiar de estilo.
    const instalarProblema = () => {
      instalarZonas(map, 'poly-fill.cold');
      if (!map.getSource('registrados')) {
        map.addSource('registrados', { type: 'geojson', data: registradosRef.current });
        const antes = map.getLayer('poly-fill.cold') ? 'poly-fill.cold' : undefined;
        map.addLayer({ id: 'registrados-fill', type: 'fill', source: 'registrados',
          paint: { 'fill-color': REGISTRADO, 'fill-opacity': 0.35 } }, antes);
        map.addLayer({ id: 'registrados-line', type: 'line', source: 'registrados',
          layout: { 'line-join': 'round' }, paint: { 'line-color': REGISTRADO, 'line-width': 2.5 } }, antes);
      }
      if (!map.getSource('medidas')) {
        map.addSource('medidas', { type: 'geojson', data: VACIO });
        map.addLayer({ id: 'medidas', type: 'symbol', source: 'medidas',
          layout: { 'text-field': ['get', 'texto'], 'text-size': 12, 'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'], 'text-allow-overlap': false },
          paint: { 'text-color': CONTORNO, 'text-halo-color': '#fff', 'text-halo-width': 2 } });
      }
      if (map.getSource('problema')) return;
      map.addSource('problema', { type: 'geojson', data: VACIO });
      map.addLayer({ id: 'problema-fill', type: 'fill', source: 'problema', filter: ['==', '$type', 'Polygon'],
        paint: { 'fill-color': RESTRINGIDO, 'fill-opacity': 0.55 } });
      map.addLayer({ id: 'problema-line', type: 'line', source: 'problema',
        paint: { 'line-color': RESTRINGIDO, 'line-width': 3 } });
      map.addLayer({ id: 'problema-punto', type: 'circle', source: 'problema', filter: ['==', '$type', 'Point'],
        paint: { 'circle-radius': 9, 'circle-color': RESTRINGIDO, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
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
      map.getSource('medidas')?.setData(f ? medidasDeLados(f.geometry.coordinates[0]) : VACIO);
      if (f) setArea(turfArea(f));
    });
    map.on('puntosdibujo', (e) => {
      setPuntos(e.n);
      if (e.n > 0) { marcadorRef.current?.remove(); marcadorRef.current = null; }   // ya empezó a dibujar
    });
    map.on('draw.modechange', (e) => {
      if (e.mode === 'draw_polygon') setModo('dibujando');
      else setModo(poligono() ? 'listo' : 'idle');
    });
    map.on('load', () => {
      aplicarMarca(map, 'calle');
      instalarProblema();
      // Sin respuesta simplemente no se muestran; no afecta al dibujo ni al envío.
      contornosRegistrados().then((fc) => {
        registradosRef.current = fc;
        map.getSource('registrados')?.setData(fc);
      }).catch(() => {});
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
    map.on('zonabloqueada', () => {
      setZonaBloqueada(true);
      clearTimeout(temporizador);
      temporizador = setTimeout(() => setZonaBloqueada(false), 3500);
    });
    map.on('draw.update', emit);
    map.on('draw.delete', emit);

    // Los trazos discontinuos "caminan" por el contorno; se omite si el usuario prefiere menos movimiento.
    let cuadro = null;
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      let paso = 0;
      let ultimo = 0;
      const animar = (t) => {
        cuadro = requestAnimationFrame(animar);
        if (t - ultimo < MS_POR_PASO) return;
        ultimo = t;
        paso = (paso + 1) % PASOS_ANIMACION;
        for (const [id, raya, hueco] of LINEAS_ANIMADAS) {
          if (map.getLayer(id)) map.setPaintProperty(id, 'line-dasharray', patronDesplazado(raya, hueco, ((raya + hueco) * paso) / PASOS_ANIMACION));
        }
      };
      cuadro = requestAnimationFrame(animar);
    }
    const alCambiarPantalla = () => { setPantallaCompleta(document.fullscreenElement === wrapRef.current); map.resize(); };
    document.addEventListener('fullscreenchange', alCambiarPantalla);

    return () => { if (cuadro) cancelAnimationFrame(cuadro); marcadorRef.current?.remove(); document.removeEventListener('fullscreenchange', alCambiarPantalla); clearTimeout(temporizador); if (permiso) permiso.onchange = null; map.remove(); mapRef.current = null; drawRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Un clic fuera del mapa devuelve la página a su aspecto normal; tocar el mapa la vuelve a atenuar.
  useEffect(() => {
    const fuera = (e) => { if (cardRef.current && !cardRef.current.contains(e.target)) setEnUso(false); };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, []);

  // La capa oscura es un hueco con sombra gigante que sigue al mapa: oscurece todo salvo el mapa.
  useEffect(() => {
    if (!enUso) return undefined;
    let cuadro = requestAnimationFrame(function seguir() {
      const r = cardRef.current?.getBoundingClientRect();
      const h = huecoRef.current;
      if (r && h) {
        Object.assign(h.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
          borderRadius: getComputedStyle(cardRef.current).borderRadius });
      }
      cuadro = requestAnimationFrame(seguir);
    });
    return () => cancelAnimationFrame(cuadro);
  }, [enUso]);

  const dibujar = () => { drawRef.current.changeMode('draw_polygon'); setModo('dibujando'); };

  // Cierra la figura sin doble clic: al salir de draw_polygon, Draw descarta el punto móvil y emite draw.create.
  const finalizar = () => {
    const draw = drawRef.current;
    // El anillo en curso lleva además el punto móvil y el cierre repetido.
    const ring = draw.getAll().features.find((x) => x.geometry.coordinates[0]?.length >= 4)?.geometry.coordinates[0];
    const reales = ring ? ring.slice(0, -2) : [];
    if (reales.length >= 3 && ladoBloqueado(mapRef.current, reales[reales.length - 1], reales[0])) {
      mapRef.current.fire('zonabloqueada');
      return;
    }
    draw.changeMode('simple_select');
    if (!draw.getAll().features.some((x) => x.geometry.coordinates[0]?.length >= 4)) { setArea(null); setModo('idle'); }
  };

  const redibujar = () => {
    drawRef.current.deleteAll();
    setArea(null);
    setPuntos(0);
    onChangeRef.current(null);
    validandoRef.current += 1;
    mapRef.current.getSource('problema')?.setData(VACIO);
    mapRef.current.getSource('medidas')?.setData(VACIO);
    problemaRef.current = null;
    setValidacion({ estado: 'ninguno', errores: [], avisos: [] });
    onValidacionRef.current?.('ninguno');
    drawRef.current.changeMode('draw_polygon');
    setModo('dibujando');
  };

  // setStyle elimina las capas de Draw: se reinstala el control con su polígono.
  const cambiarCapa = (nueva) => {
    if (nueva === capa) return;
    const map = mapRef.current;
    const draw = drawRef.current;
    // Con el modo de dibujo activo y sin esquinas aún, se sale limpio y se retoma tras el cambio de estilo.
    const retomar = modo === 'dibujando';
    if (retomar) draw.changeMode('simple_select');
    const features = draw.getAll();
    setCapa(nueva);
    map.once('style.load', () => {
      map.removeControl(draw);
      map.addControl(draw);
      if (features.features.length) draw.set(features);
      if (retomar) { draw.changeMode('draw_polygon'); setModo('dibujando'); }
      aplicarMarca(map, nueva);
      instalarProblemaRef.current();
    });
    map.setStyle(ESTILOS[nueva]);
  };

  // Arrastre de la insignia de área: se mueve con el puntero y no sale del mapa.
  const empezarArrastre = (e) => {
    const caja = e.currentTarget.getBoundingClientRect();
    arrastreRef.current = { dx: e.clientX - caja.left, dy: e.clientY - caja.top, w: caja.width, h: caja.height };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const arrastrar = (e) => {
    const a = arrastreRef.current;
    if (!a) return;
    const wrap = wrapRef.current.getBoundingClientRect();
    const limitar = (v, max) => Math.min(Math.max(v, 0), Math.max(max, 0));
    setBadgePos({ x: limitar(e.clientX - wrap.left - a.dx, wrap.width - a.w), y: limitar(e.clientY - wrap.top - a.dy, wrap.height - a.h) });
  };
  const terminarArrastre = () => { arrastreRef.current = null; };

  const alternarPantallaCompleta = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrapRef.current?.requestFullscreen?.();
  };

  const deshacer = () => mapRef.current.fire('deshacerpunto');

  const centrar = () => {
    const f = drawRef.current.getAll().features[0];
    const b = f && boundsOf([f.geometry]);
    if (b) mapRef.current.fitBounds(b, { padding: 60, maxZoom: 18 });
    else mapRef.current.flyTo({ center: HUANCAYO, zoom: HUANCAYO_ZOOM });
  };

  // Lleva el mapa al lugar elegido y deja una chincheta hasta que el usuario empiece a dibujar.
  const irA = ({ centro, bbox }) => {
    const map = mapRef.current;
    setSearchMsg('');
    marcadorRef.current?.remove();
    marcadorRef.current = new mapboxgl.Marker({ color: CONTORNO }).setLngLat(centro).addTo(map);
    if (bbox) map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 80, maxZoom: 17 });
    else map.flyTo({ center: centro, zoom: 17 });
  };

  if (!hasMapboxToken) return <TokenWarning />;

  // 1 Dibuja · 2 Ajusta (hay figura pero falta una validación correcta) · 3 Confirma (contorno validado).
  const paso = modo !== 'listo' ? 1 : ['ok', 'nd'].includes(validacion.estado) ? 3 : 2;

  const AYUDA = {
    idle: 'Pulsa «Dibujar contorno» y marca las esquinas de tu terreno en el mapa.',
    dibujando: puntos >= 3
      ? 'Sigue marcando esquinas o pulsa «Finalizar» para cerrar la figura.'
      : 'Toca o haz clic en el mapa para marcar cada esquina (mínimo 3). No se puede cruzar avenidas, jirones, pasajes, parques, ríos, lagos ni espacios privados.',
    listo: 'Arrastra los vértices para ajustar el contorno.',
  };

  return (
    <>
    {enUso && createPortal(<div ref={huecoRef} className="map-backdrop" aria-hidden="true" />, document.body)}
    <div ref={cardRef} onPointerDownCapture={() => setEnUso(true)}
      className={`map-card picker${modo === 'dibujando' ? ' dibujando' : ''}${enUso ? ' en-uso' : ''}`}>
      <div className="map-wrap" ref={wrapRef}>
        <div ref={el} className="map" />
        <BuscadorLugares onElegir={irA} onError={setSearchMsg} />
        {(searchMsg || avisoUbicacion) && (
          <div className="map-msgs">
            {searchMsg && <div className="map-search-msg">{searchMsg}</div>}
            {avisoUbicacion && <div className="map-geo-warning" role="status">{AVISO_UBICACION}</div>}
          </div>
        )}
        <div className="map-controls below-geo">
          <button type="button" onClick={() => mapRef.current.zoomIn()} aria-label="Acercar" title="Acercar"><Icon name="plus" /></button>
          <button type="button" onClick={() => mapRef.current.zoomOut()} aria-label="Alejar" title="Alejar"><Icon name="minus" /></button>
          <button type="button" onClick={centrar} aria-label="Centrar" title="Centrar en el terreno"><Icon name="target" /></button>
          <button type="button" onClick={alternarPantallaCompleta} aria-label="Pantalla completa" aria-pressed={pantallaCompleta}
            title={pantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'}><Icon name="expand" /></button>
        </div>
        <details className="zonas-leyenda" open>
          <summary><Icon name="polygon" size={15} />Leyenda del mapa<b className="chevron" aria-hidden="true" /></summary>
          <div className="leyenda-grupo">Terrenos</div>
          <ul>
            <li><i className="nuevo" /><span><b>Tu terreno</b>Contorno que estás dibujando (línea discontinua).</span></li>
            <li><i className="registrada" /><span><b>Terreno registrado</b>Ya ofertado por otra persona (línea continua).</span></li>
          </ul>
          <div className="leyenda-grupo">Zonas donde no se puede dibujar</div>
          <ul>
            <li><i className="privado" /><span><b>Espacios privados</b>Universidades, colegios, hospitales y locales comerciales o industriales. No se pueden ocupar.</span></li>
            <li><i className="via" /><span><b>Avenidas, jirones, pasajes, parques, ríos y lagos</b>No se pueden cruzar ni ocupar. El mapa no las marca: si intentas dibujar encima verás un aviso.</span></li>
          </ul>
          <div className="leyenda-grupo">Avisos</div>
          <ul>
            <li><i className="problema" /><span><b>Zona con problema</b>Parte del contorno que incumple una regla.</span></li>
          </ul>
        </details>
        <SelectorCapas capa={capa} onChange={cambiarCapa} disabled={modo === 'dibujando' && puntos > 0} />
        {zonaBloqueada && <div className="map-toast" role="status">{MENSAJE_ZONA}</div>}
        {area !== null && (
          <div className="area-badge" title="Arrastra para mover" style={badgePos ? { left: badgePos.x, top: badgePos.y, transform: 'none' } : undefined}
            onPointerDown={empezarArrastre} onPointerMove={arrastrar} onPointerUp={terminarArrastre} onPointerCancel={terminarArrastre}>
            <Icon name="expand" size={15} /> Área {modo === 'listo' ? 'declarada' : 'actual'}: {formatM2(area)}
          </div>
        )}
      </div>
      <div className="map-toolbar">
        <div className="map-toolbar-text">
          <Icon name="polygon" />
          <div>
            <ol className="pasos" aria-label="Pasos">
              {PASOS.map((p, i) => (
                <li key={p} className={i + 1 === paso ? 'actual' : i + 1 < paso ? 'hecho' : ''} aria-current={i + 1 === paso ? 'step' : undefined}>
                  <b>{i + 1}</b>{p}
                </li>
              ))}
            </ol>
            <span>{AYUDA[modo]}</span>
            {validacion.estado === 'validando' && <div className="muted small-note" role="status">Validando el contorno…</div>}
            {validacion.estado === 'ok' && validacion.avisos.length === 0 && <div className="valid-ok small-note" role="status">Contorno válido.</div>}
            {validacion.errores.map((e) => <div key={e.regla} className="valid-error" role="alert">{e.mensaje}</div>)}
            {validacion.avisos.map((a) => <div key={a} className="valid-aviso" role="status">{a}</div>)}
          </div>
        </div>
        <div className="map-toolbar-btns">
          <button type="button" className="btn small" onClick={dibujar} disabled={modo !== 'idle'}>Dibujar contorno</button>
          <button type="button" className="btn small outline" onClick={deshacer} disabled={modo !== 'dibujando' || puntos < 1}
            title="Quitar la última esquina (Retroceso o Ctrl+Z)">Deshacer punto</button>
          <button type="button" className="btn small" onClick={finalizar} disabled={modo !== 'dibujando' || puntos < 3}>Finalizar</button>
          <button type="button" className="btn small outline" onClick={redibujar} disabled={modo === 'idle' && area === null}>Borrar</button>
        </div>
      </div>
    </div>
    </>
  );
}
