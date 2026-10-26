import { useState } from 'react';
import Icon from './Icon.jsx';
import CriterioForm, { TIPOS_VIA, SUPERFICIES, SERVICIOS, ESTADOS_TRAMITE, CARGAS, DOCUMENTOS, COSTOS } from './CriterioForm.jsx';
import ResumenFinanciero from './ResumenFinanciero.jsx';
import ArchivosVisita from './ArchivosVisita.jsx';
import UbicacionApoyo from './UbicacionApoyo.jsx';
import { NIVELES, nivelViabilidad, formatM2 } from './mapConfig.js';
import { registrarDecision, errorMessage } from '../services/api.js';
import { codigoTerreno, formatSoles, ESTADOS, capitalizar } from '../utils/format.js';

const POTENCIAL = { alta: 'alto', media: 'medio', baja: 'bajo' };

function Badge({ puntaje }) {
  if (puntaje === undefined || puntaje === null) return <span className="crit-badge pending">Pendiente</span>;
  const n = NIVELES[nivelViabilidad(puntaje)];
  return <span className="crit-badge" style={{ color: n.textColor }}><Icon name="check" size={14} /> {puntaje}/100</span>;
}

// `soloEstado`: solo indica si el criterio ya fue revisado (Revisado / Pendiente), sin mostrar su contenido ni su puntaje.
function Criterio({ titulo, valor, detalle, puntaje, pendiente, form, onActualizar, puedeActualizar, soloEstado }) {
  const insignia = soloEstado
    ? (pendiente
      ? <span className="crit-badge pending">Pendiente</span>
      : <span className="crit-badge revisado"><Icon name="check" size={14} /> Revisado</span>)
    : puntaje !== false && <Badge puntaje={pendiente ? null : puntaje} />;
  return (
    <div className="crit">
      <div className="crit-head">
        <span className="crit-title">{titulo}</span>
        {insignia}
      </div>
      {pendiente ? <div className="muted">Pendiente de registro</div> : soloEstado ? null : (
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

const fechaCorta = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });

// Líneas del criterio técnico registrado: compatibilidad, acceso, servicios, visita y observaciones.
function detalleTecnico(ct) {
  const acceso = [TIPOS_VIA[ct.tipo_via_acceso], ct.nombre_via_acceso, SUPERFICIES[ct.superficie_via]?.toLowerCase()].filter(Boolean);
  const servicios = Object.entries(SERVICIOS).filter(([k]) => ct[`servicio_${k}`]).map(([, v]) => v);
  return [
    `Compatibilidad normativa: ${ct.compatibilidad_normativa ? 'sí' : 'no'}`,
    acceso.length ? `Acceso: ${acceso.join(' · ')}` : null,
    `Servicios: ${servicios.length ? servicios.join(', ') : 'ninguno confirmado'}`,
    ct.fecha_visita ? `Visita: ${fechaCorta(ct.fecha_visita)}${ct.registrado_por_nombre ? ` · ${ct.registrado_por_nombre}` : ''}` : null,
    ct.observaciones ? `Observaciones: ${ct.observaciones}` : null,
  ].filter(Boolean);
}

// Líneas de la situación legal registrada: partida, titularidad, cargas, trámite, documentos y revisión (solo informativas).
function detalleLegal(sl) {
  const partida = [sl.numero_partida && `N.° ${sl.numero_partida}`, sl.oficina_registral].filter(Boolean);
  const titularidad = sl.titular_coincide === true ? 'Titular registral coincide con el propietario'
    : sl.titular_coincide === false ? 'Atención: el titular registral NO coincide con el propietario' : 'Titularidad sin verificar';
  const avisos = [sl.hay_copropietarios && 'copropietarios', sl.requiere_consentimiento_conyuge && 'consentimiento del cónyuge', sl.hay_representante_poder && 'representante con poder'].filter(Boolean);
  const cargas = Object.entries(CARGAS).filter(([k]) => sl[`carga_${k}`]).map(([, v]) => v.toLowerCase());
  const faltan = Object.entries(DOCUMENTOS).filter(([k]) => !sl[`doc_${k}`]).map(([, v]) => v);
  const completos = Object.keys(DOCUMENTOS).length - faltan.length;
  const estado = ESTADOS_TRAMITE[sl.estado_tramite] || sl.estado_tramite;
  return [
    partida.length ? `Partida: ${partida.join(' · ')}` : null,
    sl.titular_registral ? `Titular registral: ${sl.titular_registral}` : null,
    titularidad + (avisos.length ? ` · ${avisos.join(', ')}` : ''),
    cargas.length ? `Cargas: ${cargas.join(', ')}${sl.detalle_cargas ? ` (${sl.detalle_cargas})` : ''}` : 'Sin cargas declaradas',
    estado ? `Trámite: ${estado}${sl.fecha_estado_tramite ? ` (${fechaCorta(sl.fecha_estado_tramite)})` : ''}` : 'Sin estado de trámite',
    `Documentos: ${completos} de ${Object.keys(DOCUMENTOS).length} completos${faltan.length ? ` · faltan: ${faltan.join(', ').toLowerCase()}` : ''}`,
    sl.fecha_revision ? `Revisión: ${fechaCorta(sl.fecha_revision)}${sl.registrado_por_nombre ? ` · ${sl.registrado_por_nombre}` : ''}` : null,
    sl.observaciones ? `Observaciones: ${sl.observaciones}` : null,
  ].filter(Boolean);
}

// Líneas de la información financiera registrada: total de costos, desglose, revisión y observaciones.
function detalleFinanciero(fi) {
  const desglose = Object.entries(COSTOS).filter(([k]) => Number(fi[`costo_${k}`]) > 0).map(([k, v]) => `${v} ${formatSoles(fi[`costo_${k}`])}`);
  return [
    `Costos de adquisición: ${formatSoles(fi.costos_adquisicion)}`,
    desglose.length ? `Desglose: ${desglose.join(' · ')}` : null,
    fi.fecha_revision ? `Revisión: ${fechaCorta(fi.fecha_revision)}${fi.registrado_por_nombre ? ` · ${fi.registrado_por_nombre}` : ''}` : null,
    fi.observaciones ? `Observaciones: ${fi.observaciones}` : null,
  ].filter(Boolean);
}

// Detalle del terreno seleccionado: criterios reales, puntaje y decisión.
export default function DetailPanel({ terreno: t, usuario, onChanged, cercanos, acceso, onReintentarCercanos, onResaltar, onComparar }) {
  const [obs, setObs] = useState('');
  const [abrirDecision, setAbrirDecision] = useState(false);
  const [editar, setEditar] = useState({});
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState('');
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [avisoArchivos, setAvisoArchivos] = useState([]);   // archivos que no se pudieron subir al guardar la revisión

  const { oferta, criterios_tecnicos: ct, situacion_legal: sl, informacion_financiera: fi, puntaje, decision } = t;
  const det = puntaje?.detalle_criterios;
  const nivel = puntaje ? nivelViabilidad(puntaje.puntaje_total) : null;
  const rol = usuario?.rol;
  const esTecnica = rol === 'tecnica';   // el Área Técnica no ve la situación legal ni el puntaje de viabilidad
  const esAdmin = rol === 'administrativa';   // el Área Administrativa solo ve su información financiera y si lo técnico y lo legal están revisados
  const esLegal = rol === 'legal';       // el Área Legal no ve el puntaje de viabilidad, las dimensiones ni el precio solicitado
  const abierto = t.estado === 'en_evaluacion';

  const precioBase = fi ? fi.precio_ofertado : oferta.precio_ofertado;
  const porM2 = t.area ? precioBase / t.area : null;
  const costoTotalM2 = fi && t.area ? (fi.precio_ofertado + fi.costos_adquisicion) / t.area : null;

  // Resumen del terreno en PDF (solo Gerencia). Las librerías del PDF se cargan recién al pulsar.
  const descargarResumen = async () => {
    setError('');
    setGenerandoPdf(true);
    try {
      const { generarResumenPdf } = await import('../utils/resumenPdf.js');
      await generarResumenPdf({ terreno: t, cercanos, usuario });
    } catch (e) {
      setError(`No se pudo generar el PDF: ${e.message || 'error desconocido'}`);
    } finally {
      setGenerandoPdf(false);
    }
  };

  const guardado = async (info) => {
    setEditar({});
    const fallidos = info?.fallidos || [];
    setAvisoArchivos(fallidos.length
      ? ['La revisión se guardó, pero no se pudieron subir estos archivos (puedes adjuntarlos de nuevo):', ...fallidos.map((f) => `«${f.nombre}»: ${f.motivo}`)]
      : []);
    await onChanged();
  };

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
    node: <CriterioForm rol={rolForm} idTerreno={t.id_terreno} onSaved={guardado} cercanos={cercanos} acceso={acceso}
      previo={rolForm === 'tecnica' ? ct : rolForm === 'legal' ? sl : rolForm === 'administrativa' ? fi : null}
      propietario={oferta.nombre_propietario} area={t.area} referencia={t.referencia_precio_m2} precioSolicitado={oferta.precio_ofertado} />,
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
      {oferta.descripcion && <p className="detail-desc"><b>Descripción:</b> {oferta.descripcion}</p>}

      {!esTecnica && !esLegal && !esAdmin && (
      <div className="score-box" style={nivel ? { background: `${NIVELES[nivel].color}1f` } : undefined}>
        <div>
          <small>PUNTAJE DE VIABILIDAD</small>
          {puntaje
            ? <b style={{ color: NIVELES[nivel].textColor }}>Potencial de adquisición {POTENCIAL[nivel]}</b>
            : <b className="muted">Pendiente: se calcula al registrar los 3 criterios</b>}
        </div>
        {puntaje && <div className="score-num" style={{ color: NIVELES[nivel].textColor }}>{puntaje.puntaje_total}<small>/100</small></div>}
      </div>
      )}

      <h3 className="section-label">CRITERIOS DE EVALUACIÓN</h3>

      {!esAdmin && (
      <Criterio
        titulo="ÁREA" puntaje={false} pendiente={!t.area}
        valor={formatM2(t.area)} detalle={['Calculada del polígono dibujado']}
        form={{ show: false }}
      />
      )}
      <Criterio
        titulo="CRITERIO TÉCNICO" pendiente={!ct} puntaje={esTecnica ? false : det?.puntaje_tecnico} soloEstado={esLegal || esAdmin}
        valor={ct ? `${ct.distancia_via_principal} m a vía principal` : ''}
        detalle={ct ? detalleTecnico(ct) : []}
        form={conEdicion('tecnica', !ct)} puedeActualizar={rol === 'tecnica' && abierto}
        onActualizar={() => setEditar({ ...editar, tecnica: true })}
      />
      {!esAdmin && (
      <ArchivosVisita idTerreno={t.id_terreno} archivos={t.archivos} puedeEditar={rol === 'tecnica' && abierto}
        onCambio={onChanged} aviso={rol === 'tecnica' ? avisoArchivos : []} onCerrarAviso={() => setAvisoArchivos([])} />
      )}
      {!esTecnica && (
      <>
      <Criterio
        titulo="SITUACIÓN LEGAL" pendiente={!sl} puntaje={det?.puntaje_legal} soloEstado={esAdmin}
        valor={sl ? capitalizar(sl.ruta_legal) : ''}
        detalle={sl ? detalleLegal(sl) : []}
        form={conEdicion('legal', !sl)} puedeActualizar={rol === 'legal' && abierto}
        onActualizar={() => setEditar({ ...editar, legal: true })}
      />
      {!esAdmin && (
      <ArchivosVisita idTerreno={t.id_terreno} archivos={t.archivos} area="legal" titulo="DOCUMENTOS LEGALES"
        puedeEditar={rol === 'legal' && abierto} onCambio={onChanged} aviso={rol === 'legal' ? avisoArchivos : []} onCerrarAviso={() => setAvisoArchivos([])} />
      )}
      </>
      )}
      {!esLegal && (
      <Criterio
        titulo={fi ? 'PRECIO OFERTADO' : 'PRECIO SOLICITADO (OFERTA)'} pendiente={!fi && !oferta.precio_ofertado}
        puntaje={esTecnica ? false : det?.puntaje_financiero}
        valor={formatSoles(precioBase)}
        detalle={fi ? detalleFinanciero(fi) : [porM2 !== null ? `${formatSoles(porM2)} por m² (precio solicitado)` : null, 'Información financiera pendiente'].filter(Boolean)}
        form={conEdicion('administrativa', !fi)} puedeActualizar={rol === 'administrativa' && abierto}
        onActualizar={() => setEditar({ ...editar, administrativa: true })}
      />
      )}
      {fi && !esLegal && !conEdicion('administrativa', !fi).show && (
        <ResumenFinanciero precio={fi.precio_ofertado} costos={fi.costos_adquisicion} area={t.area} referencia={t.referencia_precio_m2} />
      )}
      {(esAdmin || rol === 'gerencia') && (
        <ArchivosVisita idTerreno={t.id_terreno} archivos={t.archivos} area="administrativa" titulo="DOCUMENTOS FINANCIEROS"
          puedeEditar={esAdmin && abierto} onCambio={onChanged} aviso={esAdmin ? avisoArchivos : []} onCerrarAviso={() => setAvisoArchivos([])} />
      )}


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
        {rol === 'gerencia' && (
          <>
            <button type="button" className="btn outline block" onClick={descargarResumen} disabled={generandoPdf}>
              {generandoPdf ? 'Generando PDF…' : <>Descargar resumen en PDF <Icon name="clipboard" size={16} /></>}
            </button>
            <button type="button" className="btn outline block" onClick={onComparar}>
              Comparar con otro candidato <Icon name="compare" size={16} />
            </button>
          </>
        )}
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
