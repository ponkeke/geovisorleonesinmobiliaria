import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import turfArea from '@turf/area';
import {
  mapboxgl, hasMapboxToken, ESTILOS, aplicarMarca, HUANCAYO, HUANCAYO_ZOOM, ZOOM_UBICACION, PRECISION_MAX_M, boundsOf, formatM2,
} from './mapConfig.js';
import TokenWarning from './TokenWarning.jsx';
import { validarPoligono, contornosRegistrados, getPredioCatastro } from '../services/api.js';
import Icon from './Icon.jsx';
import SelectorCapas from './SelectorCapas.jsx';
import { instalarCatastro, transformarPeticion, CATASTRO_RURAL, ZOOM_MIN_RURAL, ZOOM_MIN_LOTES, ZOOM_MIN_CLIC } from './catastroCapa.js';
import BuscadorLugares from './BuscadorLugares.jsx';

const AVISO_UBICACION = 'Tu ubicación aproximada puede no ser exacta. Busca la dirección o ajusta el mapa manualmente.';
const CONTORNO = '#1f5c43';
const FILL = '#2f7a5a';
const RESTRINGIDO = '#c0392b';
const REGISTRADO = '#b71c1c';   // terrenos ya registrados (relleno rojo)
const VACIO = { type: 'FeatureCollection', features: [] };
const PASOS = ['Elige tu lote', 'Confirma'];

const FUENTES = { urbano: 'lote urbano (COFOPRI)', rural: 'predio rural (MIDAGRI)' };

// Elección de UN predio del catastro haciendo clic sobre el mapa: el oferente ve los lotes urbanos (naranja) y, si están
// activos, los predios rurales de Junín (violeta); el contorno del predio elegido pasa a ser el terreno de su oferta.
// Para dibujar el terreno a mano está PolygonPicker (el formulario permite elegir entre los dos).
// onChange({ geometry, area, sello, etiqueta, fuente }) o onChange(null). `area` (m², turf) es informativa: la oficial la calcula el servidor.
export default function PredioPicker({ onChange, onValidacion, initial = null }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const instalarRef = useRef(() => {});
  const predioRef = useRef(VACIO);      // elemento elegido (se reinstala al cambiar de estilo)
  const problemaRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onValidacionRef = useRef(onValidacion);
  onValidacionRef.current = onValidacion;
  const validandoRef = useRef(0);       // nº de validación vigente (descarta respuestas viejas)
  const buscandoRef = useRef(0);        // nº de consulta de predio vigente

  const [seleccion, setSeleccion] = useState(null);   // { etiqueta, fuente, area }
  const [buscando, setBuscando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [zoom, setZoom] = useState(HUANCAYO_ZOOM);
  const [searchMsg, setSearchMsg] = useState('');
  const [avisoUbicacion, setAvisoUbicacion] = useState(false);
  const [capa, setCapa] = useState('calle');   // calle | satelite | relieve
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const wrapRef = useRef(null);
  const cardRef = useRef(null);
  const huecoRef = useRef(null);
  const [enUso, setEnUso] = useState(false);   // el usuario está trabajando en el mapa: se atenúa el resto de la página
  const registradosRef = useRef(VACIO);        // contornos de terrenos ya registrados
  const [badgePos, setBadgePos] = useState(null);
  const arrastreRef = useRef(null);
  const marcadorRef = useRef(null);            // chincheta del lugar elegido en el buscador
  const [validacion, setValidacion] = useState({ estado: 'ninguno', errores: [], avisos: [] });

  useEffect(() => {
    if (!hasMapboxToken) return undefined;
    const map = new mapboxgl.Map({ container: el.current, style: ESTILOS.calle, center: HUANCAYO, zoom: HUANCAYO_ZOOM,
      transformRequest: transformarPeticion,
      locale: { 'GeolocateControl.FindMyLocation': 'Usar mi ubicación', 'GeolocateControl.LocationNotAvailable': 'Ubicación no disponible' },
    });
    // Solo ayuda a centrar: sin seguimiento, con círculo de precisión.
    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true }, trackUserLocation: false, showAccuracyCircle: true, showUserLocation: true,
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
    mapRef.current = map;

    // Capas propias; se reinstalan tras cada cambio de estilo (setStyle las elimina).
    const instalar = () => {
      // Lotes urbanos (naranja) y predios rurales de Junín (violeta); sin sectores, porque el rojo es de los terrenos registrados.
      instalarCatastro(map, true, undefined, { sectores: false });
      if (!map.getSource('registrados')) {
        map.addSource('registrados', { type: 'geojson', data: registradosRef.current });
        map.addLayer({ id: 'registrados-fill', type: 'fill', source: 'registrados', paint: { 'fill-color': REGISTRADO, 'fill-opacity': 0.35 } });
        map.addLayer({ id: 'registrados-line', type: 'line', source: 'registrados', layout: { 'line-join': 'round' },
          paint: { 'line-color': REGISTRADO, 'line-width': 2.5 } });
      }
      if (!map.getSource('predio')) {
        map.addSource('predio', { type: 'geojson', data: predioRef.current });
        map.addLayer({ id: 'predio-fill', type: 'fill', source: 'predio',
          paint: { 'fill-color': ['case', ['==', ['get', 'invalido'], true], RESTRINGIDO, FILL], 'fill-opacity': 0.45 } });
        map.addLayer({ id: 'predio-line', type: 'line', source: 'predio', layout: { 'line-join': 'round' },
          paint: { 'line-color': ['case', ['==', ['get', 'invalido'], true], RESTRINGIDO, CONTORNO], 'line-width': 3.5 } });
      }
      if (!map.getSource('problema')) {
        map.addSource('problema', { type: 'geojson', data: VACIO });
        map.addLayer({ id: 'problema-fill', type: 'fill', source: 'problema', filter: ['==', '$type', 'Polygon'],
          paint: { 'fill-color': RESTRINGIDO, 'fill-opacity': 0.55 } });
        map.addLayer({ id: 'problema-line', type: 'line', source: 'problema', paint: { 'line-color': RESTRINGIDO, 'line-width': 3 } });
      }
      map.getSource('problema').setData(problemaRef.current ? { type: 'Feature', properties: {}, geometry: problemaRef.current } : VACIO);
    };
    instalarRef.current = instalar;

    const ponerPredio = (geometry, invalido = false) => {
      predioRef.current = geometry ? { type: 'Feature', properties: { invalido }, geometry } : VACIO;
      map.getSource('predio')?.setData(predioRef.current);
    };
    const mostrarProblema = (geometry) => {
      problemaRef.current = geometry || null;
      map.getSource('problema')?.setData(geometry ? { type: 'Feature', properties: {}, geometry } : VACIO);
    };
    const poner = (v) => { setValidacion(v); onValidacionRef.current?.(v.estado); };

    // Reglas del servidor (R1-R4) sobre el predio elegido; sobre todo R4: que otra persona no lo haya ofertado ya.
    const validar = async (geometry) => {
      const n = ++validandoRef.current;
      mostrarProblema(null);
      poner({ estado: 'validando', errores: [], avisos: [] });
      try {
        const r = await validarPoligono(geometry);
        if (n !== validandoRef.current) return;
        if (r.valido) poner({ estado: 'ok', errores: [], avisos: r.avisos || [] });
        else {
          ponerPredio(geometry, true);
          mostrarProblema(r.geometriaProblema);
          poner({ estado: 'error', errores: r.errores, avisos: r.avisos || [] });
        }
      } catch {
        if (n !== validandoRef.current) return;
        // Sin respuesta (red, límite de uso): no se bloquea; el servidor valida de nuevo al enviar.
        poner({ estado: 'nd', errores: [], avisos: ['No se pudo validar el lote ahora. El servidor lo revisará al enviar.'] });
      }
    };

    const elegir = (p) => {
      const area = turfArea({ type: 'Feature', properties: {}, geometry: p.poligono });
      marcadorRef.current?.remove(); marcadorRef.current = null;
      ponerPredio(p.poligono);
      setSeleccion({ etiqueta: p.etiqueta, fuente: p.fuente, area });
      onChangeRef.current({ geometry: p.poligono, area, sello: p.sello, etiqueta: p.etiqueta, fuente: p.fuente });
      validar(p.poligono);
    };
    instalarRef.current.quitar = () => {
      buscandoRef.current += 1;
      validandoRef.current += 1;
      ponerPredio(null);
      mostrarProblema(null);
      setSeleccion(null); setBuscando(false); setMensaje('');
      onChangeRef.current(null);
      poner({ estado: 'ninguno', errores: [], avisos: [] });
    };

    map.on('load', () => {
      aplicarMarca(map, 'calle');
      instalar();
      // Sin respuesta simplemente no se muestran; no afecta a la elección ni al envío.
      contornosRegistrados().then((fc) => {
        registradosRef.current = fc;
        map.getSource('registrados')?.setData(fc);
      }).catch(() => {});
      if (initial?.geometry) {
        // Restaura el lote si el usuario volvió del paso anterior.
        ponerPredio(initial.geometry);
        setSeleccion({ etiqueta: initial.etiqueta, fuente: initial.fuente, area: initial.area });
        validar(initial.geometry);
        map.fitBounds(boundsOf([initial.geometry]), { padding: 60, maxZoom: 18, duration: 0 });
      }
    });

    const actualizarZoom = () => {
      const z = map.getZoom();
      setZoom(z);
      map.getCanvas().style.cursor = z >= ZOOM_MIN_CLIC ? 'pointer' : '';
    };
    map.on('zoomend', actualizarZoom);
    map.on('load', actualizarZoom);

    // Un clic sobre el mapa pide al servidor el predio que hay en ese punto (urbano o rural).
    map.on('click', async (e) => {
      if (map.getZoom() < ZOOM_MIN_CLIC) { setMensaje('Acerca el mapa a tu terreno hasta ver los contornos de los predios y vuelve a hacer clic.'); return; }
      const n = ++buscandoRef.current;
      setBuscando(true);
      setMensaje('');
      try {
        const { predio } = await getPredioCatastro(e.lngLat.lng, e.lngLat.lat);
        if (n !== buscandoRef.current) return;
        if (!predio || (!CATASTRO_RURAL && predio.fuente === 'rural')) {
          setMensaje(`No hay un lote del catastro en ese punto. Haz clic dentro de un lote (naranja)${CATASTRO_RURAL ? ' o predio rural (violeta)' : ''} o dibuja tu terreno.`);
        }
        else elegir(predio);
      } catch (err) {
        if (n !== buscandoRef.current) return;
        setMensaje(err.response?.data?.error || 'No se pudo consultar el catastro. Intenta de nuevo en unos segundos.');
      } finally {
        if (n === buscandoRef.current) setBuscando(false);
      }
    });

    const alCambiarPantalla = () => { setPantallaCompleta(document.fullscreenElement === wrapRef.current); map.resize(); };
    document.addEventListener('fullscreenchange', alCambiarPantalla);

    return () => {
      marcadorRef.current?.remove();
      document.removeEventListener('fullscreenchange', alCambiarPantalla);
      if (permiso) permiso.onchange = null;
      map.remove();
      mapRef.current = null;
    };
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

  // setStyle elimina las capas propias: se reinstalan al terminar de cargar el nuevo estilo.
  const cambiarCapa = (nueva) => {
    if (nueva === capa) return;
    const map = mapRef.current;
    setCapa(nueva);
    map.once('style.load', () => { aplicarMarca(map, nueva); instalarRef.current(); });
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

  const centrar = () => {
    const g = predioRef.current?.geometry;
    const b = g && boundsOf([g]);
    if (b) mapRef.current.fitBounds(b, { padding: 60, maxZoom: 18 });
    else mapRef.current.flyTo({ center: HUANCAYO, zoom: HUANCAYO_ZOOM });
  };

  // Lleva el mapa al lugar elegido y deja una chincheta hasta que el usuario elija un lote.
  const irA = ({ centro, bbox }) => {
    const map = mapRef.current;
    setSearchMsg('');
    marcadorRef.current?.remove();
    marcadorRef.current = new mapboxgl.Marker({ color: CONTORNO }).setLngLat(centro).addTo(map);
    if (bbox) map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 80, maxZoom: 17 });
    else map.flyTo({ center: centro, zoom: 17 });
  };

  if (!hasMapboxToken) return <TokenWarning />;

  // 1 Elige tu lote · 2 Confirma (lote elegido y validado).
  const paso = seleccion && ['ok', 'nd'].includes(validacion.estado) ? 2 : 1;
  const cerca = zoom >= ZOOM_MIN_CLIC;

  let ayuda;
  if (seleccion) ayuda = 'Este es el lote que se enviará como tu terreno. Si no es el tuyo, pulsa «Cambiar lote» y elige otro.';
  else if (buscando) ayuda = 'Buscando el predio en el catastro…';
  else if (!cerca) ayuda = 'Busca tu dirección o acerca el mapa hasta ver los contornos de los predios y haz clic sobre el tuyo.';
  else if (CATASTRO_RURAL) ayuda = `Haz clic sobre tu lote: los lotes urbanos (naranja) aparecen desde el zoom ${ZOOM_MIN_LOTES} y los predios rurales (violeta) desde el ${ZOOM_MIN_RURAL}.`;
  else ayuda = 'Haz clic sobre tu lote (contorno naranja). Si no aparece, dibuja tu terreno.';

  return (
    <>
    {enUso && createPortal(<div ref={huecoRef} className="map-backdrop" aria-hidden="true" />, document.body)}
    <div ref={cardRef} onPointerDownCapture={() => setEnUso(true)} className={`map-card picker${enUso ? ' en-uso' : ''}`}>
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
          <button type="button" onClick={centrar} aria-label="Centrar" title="Centrar en el lote"><Icon name="target" /></button>
          <button type="button" onClick={alternarPantallaCompleta} aria-label="Pantalla completa" aria-pressed={pantallaCompleta}
            title={pantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'}><Icon name="expand" /></button>
        </div>
        <details className="zonas-leyenda" open>
          <summary><Icon name="polygon" size={15} />Leyenda del mapa<b className="chevron" aria-hidden="true" /></summary>
          <div className="leyenda-grupo">Predios del catastro</div>
          <ul>
            <li><i className="urbano" /><span><b>Lote urbano</b>Catastro de COFOPRI (desde el zoom {ZOOM_MIN_LOTES}).</span></li>
            {CATASTRO_RURAL && <li><i className="rural" /><span><b>Predio rural</b>Catastro rural de MIDAGRI, solo Junín (desde el zoom {ZOOM_MIN_RURAL}).</span></li>}
          </ul>
          <div className="leyenda-grupo">Terrenos</div>
          <ul>
            <li><i className="nuevo" /><span><b>Tu lote</b>El predio que elegiste con un clic.</span></li>
            <li><i className="registrada" /><span><b>Terreno registrado</b>Ya ofertado por otra persona.</span></li>
          </ul>
          <div className="leyenda-grupo">Avisos</div>
          <ul>
            <li><i className="problema" /><span><b>Zona con problema</b>Parte del lote que incumple una regla.</span></li>
          </ul>
        </details>
        <SelectorCapas capa={capa} onChange={cambiarCapa} />
        {(buscando || mensaje) && (
          <div className="map-toast" role="status">{buscando ? 'Buscando el predio…' : mensaje}</div>
        )}
        {seleccion && (
          <div className="area-badge" title="Arrastra para mover" style={badgePos ? { left: badgePos.x, top: badgePos.y, transform: 'none' } : undefined}
            onPointerDown={empezarArrastre} onPointerMove={arrastrar} onPointerUp={terminarArrastre} onPointerCancel={terminarArrastre}>
            <Icon name="expand" size={15} /> {seleccion.etiqueta} · {formatM2(seleccion.area)}
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
            <span>{ayuda}</span>
            {seleccion && <div className="small-note" role="status"><b>{seleccion.etiqueta}</b> — {FUENTES[seleccion.fuente] || 'predio del catastro'}</div>}
            {validacion.estado === 'validando' && <div className="muted small-note" role="status">Validando el lote…</div>}
            {validacion.estado === 'ok' && validacion.avisos.length === 0 && <div className="valid-ok small-note" role="status">Lote válido.</div>}
            {validacion.errores.map((e) => <div key={e.regla} className="valid-error" role="alert">{e.mensaje}</div>)}
            {validacion.avisos.map((a) => <div key={a} className="valid-aviso" role="status">{a}</div>)}
          </div>
        </div>
        <div className="map-toolbar-btns">
          <button type="button" className="btn small outline" onClick={() => instalarRef.current.quitar()} disabled={!seleccion}>Cambiar lote</button>
        </div>
      </div>
    </div>
    </>
  );
}
