import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import Icon from '../components/Icon.jsx';
import TerrenosMap from '../components/TerrenosMap.jsx';
import DetailPanel from '../components/DetailPanel.jsx';
import { NIVELES, nivelViabilidad, formatM2 } from '../components/mapConfig.js';
import { listarTerrenos, getTerreno, getCercanos, getUsuario, logout, errorMessage } from '../services/api.js';
import { codigoTerreno, formatSolesCorto } from '../utils/format.js';

export default function Panel() {
  const [terrenos, setTerrenos] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [cercanos, setCercanos] = useState({ cargando: false, data: null, error: '' });
  const [intentoCercanos, setIntentoCercanos] = useState(0);
  const [filtro, setFiltro] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const usuario = getUsuario();

  const manejar = useCallback((e) => {
    if (e.response?.status === 401) { logout(); navigate('/login'); } else setError(errorMessage(e));
  }, [navigate]);

  const cargarLista = useCallback(() => listarTerrenos().then(setTerrenos).catch(manejar), [manejar]);
  useEffect(() => { cargarLista(); }, [cargarLista]);

  const cargarDetalle = useCallback(async (id) => {
    setCargandoDetalle(true);
    try { setDetalle(await getTerreno(id)); setError(''); } catch (e) { manejar(e); } finally { setCargandoDetalle(false); }
  }, [manejar]);

  useEffect(() => {
    if (selectedId) cargarDetalle(selectedId); else setDetalle(null);
  }, [selectedId, cargarDetalle]);

  // Lugares cercanos (Overpass vía servidor): aparte del detalle para no demorarlo; nunca bloquea el flujo.
  useEffect(() => {
    if (!selectedId) { setCercanos({ cargando: false, data: null, error: '' }); return undefined; }
    let activo = true;
    setCercanos({ cargando: true, data: null, error: '' });
    getCercanos(selectedId)
      .then((data) => activo && setCercanos({ cargando: false, data, error: data.error || '' }))
      .catch(() => activo && setCercanos({ cargando: false, data: null, error: 'No se pudo consultar lugares cercanos' }));
    return () => { activo = false; };
  }, [selectedId, intentoCercanos]);

  // Tras registrar un criterio o una decisión se refrescan lista (orden/puntaje) y detalle.
  const cambiado = async () => { await Promise.all([cargarLista(), cargarDetalle(selectedId)]); };

  // Al seleccionar desde el mapa, la fila correspondiente se muestra en la lista.
  const seleccionarDesdeMapa = (id) => {
    setSelectedId(id);
    document.getElementById(`terreno-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return terrenos;
    return (terrenos || []).filter((t) =>
      `${codigoTerreno(t.id_terreno)} ${t.id_terreno} ${t.ubicacion_referencial} ${t.nombre_propietario}`.toLowerCase().includes(q));
  }, [terrenos, filtro]);

  return (
    <Layout variant="internal">
      <div className="panel-shell">
        <aside className="col list-col">
          <div className="list-head">
            <h1>Candidatos</h1>
            {terrenos && <span className="count-chip">{terrenos.length} {terrenos.length === 1 ? 'terreno' : 'terrenos'}</span>}
          </div>
          <p className="muted">Ordenados por puntaje de viabilidad, de mayor a menor.</p>
          <div className="search-box">
            <Icon name="search" size={16} />
            <input placeholder="Buscar por ID o zona" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
          </div>
          {error && <p className="error">{error}</p>}
          {!terrenos && !error && <p className="muted">Cargando…</p>}
          {terrenos && visibles.length === 0 && <p className="muted">{terrenos.length ? 'Sin resultados.' : 'No hay terrenos registrados.'}</p>}
          <ul className="cards">
            {(visibles || []).map((t) => {
              const nivel = NIVELES[nivelViabilidad(t.puntaje_total)];
              return (
                <li
                  key={t.id_terreno} id={`terreno-${t.id_terreno}`}
                  className={t.id_terreno === selectedId ? 'selected' : ''}
                  onClick={() => setSelectedId(t.id_terreno)}
                >
                  <div className="card-row">
                    <span className="card-code"><i style={{ background: nivel.color }} />{codigoTerreno(t.id_terreno)}</span>
                    <span className="card-score" style={{ color: nivel.color }}>
                      {t.puntaje_total ?? '—'}{t.puntaje_total !== null && <small>/100</small>}
                    </span>
                  </div>
                  <div className="card-place"><Icon name="pin" size={15} />{t.ubicacion_referencial}</div>
                  <div className="card-row muted">
                    <span>{t.area ? formatM2(t.area) : 'Sin área'}</span>
                    <b>{t.precio_ofertado ? formatSolesCorto(t.precio_ofertado) : ''}</b>
                  </div>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="col map-col">
          <div className="map-head">
            <b>Mapa de terrenos candidatos</b>
            <span className="muted">Selecciona un pin para revisar su evaluación</span>
          </div>
          <TerrenosMap terrenos={terrenos} selectedId={selectedId} onSelect={seleccionarDesdeMapa}
            lugares={cercanos.data?.categorias} />
        </section>

        <aside className="col detail-col">
          {!selectedId && <p className="muted center-msg">Selecciona un terreno de la lista o del mapa para ver su evaluación.</p>}
          {selectedId && !detalle && <p className="muted center-msg">{cargandoDetalle ? 'Cargando…' : 'No se pudo cargar el detalle.'}</p>}
          {selectedId && detalle && (
            <DetailPanel key={detalle.id_terreno} terreno={detalle} usuario={usuario} onChanged={cambiado} cercanos={cercanos}
              onReintentarCercanos={() => setIntentoCercanos((n) => n + 1)} />
          )}
        </aside>
      </div>
    </Layout>
  );
}
