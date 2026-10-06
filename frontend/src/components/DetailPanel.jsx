import { useState } from 'react';
import Icon from './Icon.jsx';
import CriterioForm from './CriterioForm.jsx';
import LugaresCercanos from './LugaresCercanos.jsx';
import UbicacionApoyo from './UbicacionApoyo.jsx';
import { NIVELES, nivelViabilidad, formatM2 } from './mapConfig.js';
import { registrarDecision, errorMessage } from '../services/api.js';
import { codigoTerreno, formatSoles, ESTADOS, capitalizar } from '../utils/format.js';

const POTENCIAL = { alta: 'alto', media: 'medio', baja: 'bajo' };

function Badge({ puntaje }) {
  if (puntaje === undefined || puntaje === null) return <span className="crit-badge pending">Pendiente</span>;
  const n = NIVELES[nivelViabilidad(puntaje)];
  return <span className="crit-badge" style={{ color: n.color }}><Icon name="check" size={14} /> {puntaje}/100</span>;
}

function Criterio({ titulo, valor, detalle, puntaje, pendiente, form, onActualizar, puedeActualizar }) {
  return (
    <div className="crit">
      <div className="crit-head">
        <span className="crit-title">{titulo}</span>
        {puntaje !== false && <Badge puntaje={pendiente ? null : puntaje} />}
      </div>
      {pendiente ? <div className="muted">Pendiente de registro</div> : (
        <>
          <div className="crit-value">{valor}</div>
          {detalle.map((d) => <div key={d} className="muted">{d}</div>)}
        </>
      )}
      {puedeActualizar && !pendiente && !form.open && (
        <button className="textbtn" onClick={onActualizar}>Registrar nueva versión</button>
      )}
      {form.show && form.node}
    </div>
  );
}

// Detalle del terreno seleccionado: criterios reales, puntaje y decisión.
export default function DetailPanel({ terreno: t, usuario, onChanged, cercanos, onReintentarCercanos }) {
  const [obs, setObs] = useState('');
  const [abrirDecision, setAbrirDecision] = useState(false);
  const [editar, setEditar] = useState({});
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState('');

  const { oferta, criterios_tecnicos: ct, situacion_legal: sl, informacion_financiera: fi, puntaje, decision } = t;
  const det = puntaje?.detalle_criterios;
  const nivel = puntaje ? nivelViabilidad(puntaje.puntaje_total) : null;
  const rol = usuario?.rol;
  const abierto = t.estado === 'en_evaluacion';

  const precioBase = fi ? fi.precio_ofertado : oferta.precio_ofertado;
  const porM2 = t.area ? precioBase / t.area : null;
  const costoTotalM2 = fi && t.area ? (fi.precio_ofertado + fi.costos_adquisicion) / t.area : null;

  const guardado = async () => { setEditar({}); await onChanged(); };

  const decidir = async (resultado) => {
    if (resultado === 'descartado' && !window.confirm('¿Descartar este terreno? Esta decisión no se puede cambiar.')) return;
    setError('');
    setDeciding(true);
    try {
      await registrarDecision(t.id_terreno, resultado, obs);
      setAbrirDecision(false);
      await onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDeciding(false);
    }
  };

  const formDe = (rolForm, pendiente) => ({
    open: false,
    show: rol === rolForm && abierto && (pendiente || editar[rolForm]),
    node: <CriterioForm rol={rolForm} idTerreno={t.id_terreno} onSaved={guardado} cercanos={cercanos} onReintentar={onReintentarCercanos} />,
  });
  const conEdicion = (rolForm, pendiente) => {
    const f = formDe(rolForm, pendiente);
    return { ...f, open: f.show };
  };

  return (
    <div className="detail">
      <div className="detail-top">
        <span className="code-chip">{codigoTerreno(t.id_terreno)}</span>
        <span className={`state-chip ${t.estado}`}>{ESTADOS[t.estado]}</span>
      </div>
      <h2 className="detail-title">Terreno {oferta.ubicacion_referencial}</h2>
      <p className="muted">{oferta.nombre_propietario} · {oferta.contacto}</p>
      <UbicacionApoyo geometria={t.geometria} textoPropietario={oferta.ubicacion_referencial} />
      {oferta.descripcion && <p className="detail-desc">{oferta.descripcion}</p>}

      <div className="score-box" style={nivel ? { background: `${NIVELES[nivel].color}1f` } : undefined}>
        <div>
          <small>PUNTAJE DE VIABILIDAD</small>
          {puntaje
            ? <b style={{ color: NIVELES[nivel].color }}>Potencial de adquisición {POTENCIAL[nivel]}</b>
            : <b className="muted">Pendiente: se calcula al registrar los 3 criterios</b>}
        </div>
        {puntaje && <div className="score-num" style={{ color: NIVELES[nivel].color }}>{puntaje.puntaje_total}<small>/100</small></div>}
      </div>

      <h3 className="section-label">CRITERIOS DE EVALUACIÓN</h3>

      <Criterio
        titulo="ÁREA" puntaje={false} pendiente={!t.area}
        valor={formatM2(t.area)} detalle={['Calculada del polígono dibujado']}
        form={{ show: false }}
      />
      <Criterio
        titulo="CRITERIO TÉCNICO" pendiente={!ct} puntaje={det?.puntaje_tecnico}
        valor={ct ? `${ct.distancia_via_principal} m a vía principal` : ''}
        detalle={ct ? [`Compatibilidad normativa: ${ct.compatibilidad_normativa ? 'sí' : 'no'}`] : []}
        form={conEdicion('tecnica', !ct)} puedeActualizar={rol === 'tecnica' && abierto}
        onActualizar={() => setEditar({ ...editar, tecnica: true })}
      />
      <Criterio
        titulo="SITUACIÓN LEGAL" pendiente={!sl} puntaje={det?.puntaje_legal}
        valor={sl ? capitalizar(sl.ruta_legal) : ''}
        detalle={sl ? [sl.estado_tramite ? `Trámite: ${sl.estado_tramite}` : 'Sin estado de trámite'] : []}
        form={conEdicion('legal', !sl)} puedeActualizar={rol === 'legal' && abierto}
        onActualizar={() => setEditar({ ...editar, legal: true })}
      />
      <Criterio
        titulo={fi ? 'PRECIO OFERTADO' : 'PRECIO SOLICITADO (OFERTA)'} pendiente={!fi && !oferta.precio_ofertado}
        puntaje={det?.puntaje_financiero}
        valor={formatSoles(precioBase)}
        detalle={[
          porM2 !== null ? `${formatSoles(porM2)} por m²` : null,
          fi ? `Costos de adquisición: ${formatSoles(fi.costos_adquisicion)}` : 'Información financiera pendiente',
          costoTotalM2 !== null ? `Costo total por m² (base del puntaje): ${formatSoles(costoTotalM2)}` : null,
        ].filter(Boolean)}
        form={conEdicion('administrativa', !fi)} puedeActualizar={rol === 'administrativa' && abierto}
        onActualizar={() => setEditar({ ...editar, administrativa: true })}
      />

      {cercanos && <div className="crit"><LugaresCercanos cercanos={cercanos} onReintentar={onReintentarCercanos} /></div>}

      <div className="detail-actions">
        {decision ? (
          <div className={`decision-box ${decision.resultado}`}>
            <b>{capitalizar(decision.resultado)}</b> por {decision.decidido_por_nombre}
            {decision.observaciones && <p>{decision.observaciones}</p>}
          </div>
        ) : rol === 'gerencia' && (
          <>
            {abrirDecision && (
              <div className="decision-form">
                <label className="field">Observaciones
                  <textarea rows="3" value={obs} onChange={(e) => setObs(e.target.value)} />
                </label>
                <button className="btn" disabled={deciding} onClick={() => decidir('aprobado')}>Aprobar adquisición</button>
              </div>
            )}
            {!abrirDecision && (
              <button className="btn block" disabled={!puntaje} onClick={() => setAbrirDecision(true)}>
                Registrar decisión de adquisición <Icon name="clipboard" size={16} />
              </button>
            )}
            {!puntaje && <p className="muted center">Disponible cuando el puntaje de viabilidad esté calculado.</p>}
          </>
        )}
        <button className="btn outline block" disabled title="Próximamente">
          Comparar con otro candidato <Icon name="compare" size={16} /> <em className="soon">Próximamente</em>
        </button>
        {!decision && rol === 'gerencia' && (
          <button className="btn outline danger block" disabled={!puntaje || deciding} onClick={() => decidir('descartado')}>
            Descartar terreno <Icon name="trash" size={16} />
          </button>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
