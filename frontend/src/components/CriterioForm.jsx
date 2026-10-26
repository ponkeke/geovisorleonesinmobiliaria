import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import ResumenFinanciero from './ResumenFinanciero.jsx';
import { ACCEPT_FOTOS, ACCEPT_REPORTES, formatoTamano, subirTodos, validarSeleccion } from '../utils/archivos.js';
import {
  registrarCriteriosTecnicos, registrarSituacionLegal, registrarInformacionFinanciera, errorMessage,
} from '../services/api.js';

const RUTAS = ['partida registral', 'desmembramiento', 'prescripción adquisitiva'];
export const TIPOS_VIA = { avenida: 'Avenida', jiron: 'Jirón', calle: 'Calle', pasaje: 'Pasaje', trocha: 'Trocha' };
export const SUPERFICIES = { asfaltada: 'Asfaltada', afirmada: 'Afirmada', trocha: 'Trocha (tierra)' };
export const SERVICIOS = { agua: 'Agua', desague: 'Desagüe', luz: 'Luz', internet: 'Internet', gas: 'Gas' };
export const ESTADOS_TRAMITE = { 'no iniciado': 'No iniciado', 'en trámite': 'En trámite', observado: 'Observado', inscrito: 'Inscrito' };
export const CARGAS = { hipoteca: 'Hipoteca', embargo: 'Embargo', anotacion_preventiva: 'Anotación preventiva', litigio: 'Litigio', servidumbre: 'Servidumbre' };
export const DOCUMENTOS = {
  partida: 'Partida registral (copia literal)', gravamenes: 'Certificado de gravámenes', predial: 'Impuesto predial al día',
  parametros: 'Certificado de parámetros urbanísticos', catastral: 'Ficha catastral',
};
export const COSTOS = {
  notaria: 'Notaría', registral: 'Derechos registrales', impuestos: 'Impuestos de transferencia', tasacion: 'Tasación',
  saneamiento: 'Saneamiento y trámites legales', comision: 'Comisión', otros: 'Otros',
};
const TITULARIDAD = {
  hay_copropietarios: 'Hay copropietarios', requiere_consentimiento_conyuge: 'Requiere consentimiento del cónyuge',
  hay_representante_poder: 'Actúa un representante con poder',
};
const OBSERVACIONES_MAX = 1000;

// Casillas en forma de chips: `valores` es { clave: boolean } y `onToggle(clave)` alterna una.
function Chips({ opciones, valores, onToggle }) {
  return (
    <div className="tec-servicios">
      {Object.entries(opciones).map(([k, v]) => (
        <label key={k} className={`tec-servicio${valores[k] ? ' on' : ''}`}>
          <input type="checkbox" checked={Boolean(valores[k])} onChange={() => onToggle(k)} /> {v}
        </label>
      ))}
    </div>
  );
}
const marcadas = (lista, previo, prefijo) => Object.fromEntries(Object.keys(lista).map((k) => [k, Boolean(previo?.[`${prefijo}${k}`])]));
const hoy = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

// Formulario simple según el rol del usuario. Llama onSaved() al guardar.
// `cercanos` ({ cargando, data, error }) precarga la distancia a vía principal y `acceso` el tipo, nombre y superficie
// de la vía de frente; el usuario los confirma o corrige. `previo` es el último registro técnico (nueva versión).
export default function CriterioForm({ rol, idTerreno, onSaved, cercanos, acceso, previo, propietario, area, referencia, precioSolicitado }) {
  const [f, setF] = useState({
    distancia_via_principal: '', compatibilidad_normativa: 'true',
    tipo_via_acceso: previo?.tipo_via_acceso || '', nombre_via_acceso: previo?.nombre_via_acceso || '',
    superficie_via: previo?.superficie_via || '',
    servicios: Object.fromEntries(Object.keys(SERVICIOS).map((k) => [k, Boolean(previo?.[`servicio_${k}`])])),
    fecha_visita: hoy(), observaciones: previo?.observaciones || '',
    ruta_legal: RUTAS.includes(previo?.ruta_legal) ? previo.ruta_legal : RUTAS[0],
    legal: {
      numero_partida: previo?.numero_partida || '', oficina_registral: previo?.oficina_registral || '', titular_registral: previo?.titular_registral || '',
      titular_coincide: previo?.titular_coincide === true ? 'si' : previo?.titular_coincide === false ? 'no' : '',
      ...Object.fromEntries(Object.keys(TITULARIDAD).map((k) => [k, rol === 'legal' && Boolean(previo?.[k])])),
      cargas: marcadas(CARGAS, rol === 'legal' ? previo : null, 'carga_'), detalle_cargas: (rol === 'legal' && previo?.detalle_cargas) || '',
      estado_tramite: rol === 'legal' && Object.keys(ESTADOS_TRAMITE).includes(previo?.estado_tramite) ? previo.estado_tramite : '',
      fecha_estado_tramite: '',
      documentos: marcadas(DOCUMENTOS, rol === 'legal' ? previo : null, 'doc_'),
      fecha_revision: hoy(), observaciones: (rol === 'legal' && previo?.observaciones) || '',
    },
    fin: {
      // Primera vez: se parte del precio que pide el propietario. Si ya hubo registro, de ese (un total antiguo sin desglose va a "Otros").
      precio_ofertado: rol === 'administrativa' ? String(previo?.precio_ofertado ?? precioSolicitado ?? '') : '',
      costos: Object.fromEntries(Object.keys(COSTOS).map((k) => {
        const sinDesglose = rol === 'administrativa' && previo && Number(previo.costos_adquisicion) > 0
          && Object.keys(COSTOS).every((c) => !Number(previo[`costo_${c}`]));
        const v = rol !== 'administrativa' || !previo ? 0 : sinDesglose ? (k === 'otros' ? previo.costos_adquisicion : 0) : previo[`costo_${k}`];
        return [k, Number(v) ? String(v) : ''];
      })),
      observaciones: (rol === 'administrativa' && previo?.observaciones) || '',
      fecha_revision: hoy(),
    },
  });
  const [fotos, setFotos] = useState([]);       // archivos elegidos, se suben al guardar la revisión
  const [reportes, setReportes] = useState([]);
  const [docs, setDocs] = useState([]);           // documentos de respaldo del Área Legal
  const [avisoArchivos, setAvisoArchivos] = useState([]);
  const [progreso, setProgreso] = useState('');
  const elegir = (permitidos, actual, poner) => (e) => {
    const { validos, errores } = validarSeleccion(Array.from(e.target.files || []), permitidos);
    e.target.value = '';
    setAvisoArchivos(errores);
    poner([...actual, ...validos.filter((v) => !actual.some((a) => a.name === v.name && a.size === v.size))]);
  };
  const setFin = (e) => setF((prev) => ({ ...prev, fin: { ...prev.fin, [e.target.name]: e.target.value } }));
  const setCosto = (e) => setF((prev) => ({ ...prev, fin: { ...prev.fin, costos: { ...prev.fin.costos, [e.target.name]: e.target.value } } }));
  const totalCostos = Object.values(f.fin.costos).reduce((a, v) => a + (Number(v) > 0 ? Number(v) : 0), 0);
  const setL = (e) => setF((prev) => ({ ...prev, legal: { ...prev.legal, [e.target.name]: e.target.value } }));
  const toggleL = (k) => setF((prev) => ({ ...prev, legal: { ...prev.legal, [k]: !prev.legal[k] } }));
  const toggleGrupo = (grupo) => (k) => setF((prev) => ({ ...prev, legal: { ...prev.legal, [grupo]: { ...prev.legal[grupo], [k]: !prev.legal[grupo][k] } } }));
  const accesoEditado = useRef(Boolean(previo?.tipo_via_acceso || previo?.nombre_via_acceso || previo?.superficie_via));
  const setServicio = (k) => setF((prev) => ({ ...prev, servicios: { ...prev.servicios, [k]: !prev.servicios[k] } }));
  const setAcceso = (e) => { accesoEditado.current = true; setF((prev) => ({ ...prev, [e.target.name]: e.target.value })); };
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const editado = useRef(false);
  const set = (e) => {
    if (e.target.name === 'distancia_via_principal') editado.current = true;
    setF({ ...f, [e.target.name]: e.target.value });
  };

  const sugerida = cercanos?.data?.distancia_via_principal_m;
  const hayAuto = sugerida !== undefined && sugerida !== null;
  useEffect(() => {
    if (rol === 'tecnica' && hayAuto && !editado.current) {
      setF((prev) => ({ ...prev, distancia_via_principal: String(Math.round(sugerida)) }));
    }
  }, [rol, hayAuto, sugerida]);
  // La vía de frente (OSM) rellena tipo, nombre y superficie mientras el usuario no los haya tocado.
  const via = acceso?.data?.via;
  useEffect(() => {
    if (rol === 'tecnica' && via && !accesoEditado.current) {
      setF((prev) => ({
        ...prev, tipo_via_acceso: via.tipo || '', nombre_via_acceso: via.nombre || '', superficie_via: via.superficie || '',
      }));
    }
  }, [rol, via]);
  const notaAcceso = acceso?.cargando ? 'Buscando la vía que da frente al terreno…'
    : via ? `Sugerido por OpenStreetMap: ${via.nombre || 'vía sin nombre'} (a ${Math.round(via.distancia_m)} m del terreno). Confírmalo o corrígelo.`
    : acceso?.data ? 'No se encontró una vía de frente en OpenStreetMap. Complétalo según tu visita.'
    : acceso?.error ? 'No se pudo consultar la vía de frente. Complétalo según tu visita.' : null;
  const nota = rol !== 'tecnica' ? null
    : cercanos?.cargando ? 'Calculando distancia a la vía principal más cercana…'
    : hayAuto ? 'Calculada automáticamente (Datos de OpenStreetMap). Confírmala o corrígela.'
    : cercanos?.error ? 'Ingresa la distancia manualmente.'
    : cercanos?.data ? 'No se encontró una vía principal cercana. Ingresa la distancia manualmente.'
    : null;
  const invalid = (v) => v === '' || !Number.isFinite(Number(v)) || Number(v) < 0;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      let call;
      if (rol === 'tecnica') {
        if (invalid(f.distancia_via_principal)) return setError('La distancia debe ser un número mayor o igual a 0');
        call = () => registrarCriteriosTecnicos(idTerreno, {
          distancia_via_principal: Number(f.distancia_via_principal),
          compatibilidad_normativa: f.compatibilidad_normativa === 'true',
          tipo_via_acceso: f.tipo_via_acceso, nombre_via_acceso: f.nombre_via_acceso.trim(), superficie_via: f.superficie_via,
          servicios: f.servicios, fecha_visita: f.fecha_visita, observaciones: f.observaciones.trim(),
        });
      } else if (rol === 'legal') {
        const l = f.legal;
        call = () => registrarSituacionLegal(idTerreno, {
          ruta_legal: f.ruta_legal, estado_tramite: l.estado_tramite, fecha_estado_tramite: l.fecha_estado_tramite,
          numero_partida: l.numero_partida.trim(), oficina_registral: l.oficina_registral.trim(), titular_registral: l.titular_registral.trim(),
          titular_coincide: l.titular_coincide === 'si' ? true : l.titular_coincide === 'no' ? false : null,
          hay_copropietarios: l.hay_copropietarios, requiere_consentimiento_conyuge: l.requiere_consentimiento_conyuge,
          hay_representante_poder: l.hay_representante_poder, cargas: l.cargas, detalle_cargas: l.detalle_cargas.trim(),
          documentos: l.documentos, fecha_revision: l.fecha_revision, observaciones: l.observaciones.trim(),
        });
      } else {
        const costos = Object.fromEntries(Object.entries(f.fin.costos).map(([k, v]) => [k, v === '' ? 0 : Number(v)]));
        if (invalid(f.fin.precio_ofertado) || Object.values(costos).some((v) => !Number.isFinite(v) || v < 0)) {
          return setError('Precio y costos deben ser números mayores o iguales a 0');
        }
        call = () => registrarInformacionFinanciera(idTerreno, {
          precio_ofertado: Number(f.fin.precio_ofertado), desglose_costos: costos,
          observaciones: f.fin.observaciones.trim(), fecha_revision: f.fin.fecha_revision,
        });
      }
      setSaving(true);
      await call();
      // La revisión ya quedó guardada; si alguna foto o reporte falla, se avisa y se puede adjuntar de nuevo desde el detalle.
      const fallidos = await subirTodos(idTerreno, [...fotos, ...reportes, ...docs], (n, total) => setProgreso(`Subiendo archivo ${n} de ${total}…`));
      setProgreso('');
      await onSaved({ fallidos });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="inline-form" onSubmit={submit}>
      {rol === 'tecnica' && (<>
        <label className="field">Distancia a vía principal (m)
          <input name="distancia_via_principal" type="number" min="0" step="any" value={f.distancia_via_principal} onChange={set} required /></label>
        {nota && <p className="muted small-note">{nota}</p>}
        <label className="field">Compatibilidad normativa
          <select name="compatibilidad_normativa" value={f.compatibilidad_normativa} onChange={set}>
            <option value="true">Sí</option><option value="false">No</option></select></label>

        <fieldset className="tec-grupo">
          <legend>Acceso al terreno</legend>
          <label className="field">Tipo de vía de frente
            <select name="tipo_via_acceso" value={f.tipo_via_acceso} onChange={setAcceso}>
              <option value="">Sin especificar</option>
              {Object.entries(TIPOS_VIA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="field">Nombre de la vía
            <input name="nombre_via_acceso" maxLength={200} value={f.nombre_via_acceso} onChange={setAcceso} placeholder="Ej. Av. Mariscal Castilla" /></label>
          <label className="field">Superficie
            <select name="superficie_via" value={f.superficie_via} onChange={setAcceso}>
              <option value="">Sin especificar</option>
              {Object.entries(SUPERFICIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          {notaAcceso && <p className="muted small-note">{notaAcceso}</p>}
        </fieldset>

        <fieldset className="tec-grupo">
          <legend>Servicios básicos disponibles</legend>
          <div className="tec-servicios">
            {Object.entries(SERVICIOS).map(([k, v]) => (
              <label key={k} className={`tec-servicio${f.servicios[k] ? ' on' : ''}`}>
                <input type="checkbox" checked={f.servicios[k]} onChange={() => setServicio(k)} /> {v}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="tec-grupo">
          <legend>Visita y observaciones</legend>
          <label className="field">Fecha de visita
            <input name="fecha_visita" type="date" max={hoy()} value={f.fecha_visita} onChange={set} /></label>
          <label className="field">Observaciones técnicas
            <textarea name="observaciones" rows="3" maxLength={OBSERVACIONES_MAX} value={f.observaciones} onChange={set}
              placeholder="Estado del terreno, cercos, pendiente, riesgos, accesos…" />
            <span className="counter">{f.observaciones.length}/{OBSERVACIONES_MAX}</span></label>

          <div className="field">Fotos de la visita
            <label className="btn small outline tec-adjuntar">
              <Icon name="plus" size={14} /> Agregar fotos
              <input type="file" multiple hidden accept={ACCEPT_FOTOS} onChange={elegir(['foto'], fotos, setFotos)} />
            </label>
            <span className="muted small-note">JPG, PNG o WebP. Se reducen automáticamente antes de subir.</span>
            {fotos.length > 0 && (
              <ul className="tec-elegidos">
                {fotos.map((a) => (
                  <li key={`${a.name}-${a.size}`}><span>{a.name}</span><span className="muted">{formatoTamano(a.size)}</span>
                    <button type="button" className="archivo-x en-linea" aria-label={`Quitar ${a.name}`} onClick={() => setFotos(fotos.filter((x) => x !== a))}>×</button></li>
                ))}
              </ul>
            )}
          </div>

          <div className="field">Reportes técnicos adicionales
            <label className="btn small outline tec-adjuntar">
              <Icon name="plus" size={14} /> Agregar reportes
              <input type="file" multiple hidden accept={ACCEPT_REPORTES} onChange={elegir(['reporte'], reportes, setReportes)} />
            </label>
            <span className="muted small-note">PDF, Word o Excel, hasta 15 MB cada uno.</span>
            {reportes.length > 0 && (
              <ul className="tec-elegidos">
                {reportes.map((a) => (
                  <li key={`${a.name}-${a.size}`}><span>{a.name}</span><span className="muted">{formatoTamano(a.size)}</span>
                    <button type="button" className="archivo-x en-linea" aria-label={`Quitar ${a.name}`} onClick={() => setReportes(reportes.filter((x) => x !== a))}>×</button></li>
                ))}
              </ul>
            )}
          </div>
          {avisoArchivos.map((m) => <p key={m} className="error small-note">{m}</p>)}
        </fieldset>
      </>)}
      {rol === 'legal' && (<>
        <label className="field">Ruta legal
          <select name="ruta_legal" value={f.ruta_legal} onChange={set}>
            {RUTAS.map((r) => <option key={r}>{r}</option>)}</select></label>

        <fieldset className="tec-grupo">
          <legend>Partida registral</legend>
          <label className="field">N.° de partida
            <input name="numero_partida" maxLength={40} value={f.legal.numero_partida} onChange={setL} placeholder="Ej. 11012345" /></label>
          <label className="field">Oficina registral
            <input name="oficina_registral" maxLength={100} value={f.legal.oficina_registral} onChange={setL} placeholder="Ej. Oficina registral de Huancayo" /></label>
          <label className="field">Titular registral
            <input name="titular_registral" maxLength={200} value={f.legal.titular_registral} onChange={setL} placeholder="Nombre que figura en la partida" /></label>
        </fieldset>

        <fieldset className="tec-grupo">
          <legend>Verificación de titularidad</legend>
          <label className="field">¿El titular coincide con quien ofreció el terreno?
            <select name="titular_coincide" value={f.legal.titular_coincide} onChange={setL}>
              <option value="">Sin verificar</option><option value="si">Sí coincide</option><option value="no">No coincide</option></select>
            {propietario && <span className="muted small-note">Propietario que ofertó: {propietario}</span>}</label>
          <Chips opciones={TITULARIDAD} valores={f.legal} onToggle={toggleL} />
        </fieldset>

        <fieldset className="tec-grupo">
          <legend>Cargas y gravámenes</legend>
          <Chips opciones={CARGAS} valores={f.legal.cargas} onToggle={toggleGrupo('cargas')} />
          <label className="field">Detalle de las cargas
            <textarea name="detalle_cargas" rows="2" maxLength={OBSERVACIONES_MAX} value={f.legal.detalle_cargas} onChange={setL}
              placeholder="Acreedor, monto, expediente, vigencia…" /></label>
        </fieldset>

        <fieldset className="tec-grupo">
          <legend>Estado del trámite</legend>
          <label className="field">Estado
            <select name="estado_tramite" value={f.legal.estado_tramite} onChange={setL}>
              <option value="">Sin especificar</option>
              {Object.entries(ESTADOS_TRAMITE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="field">Fecha del estado
            <input name="fecha_estado_tramite" type="date" max={hoy()} value={f.legal.fecha_estado_tramite} onChange={setL} /></label>
        </fieldset>

        <fieldset className="tec-grupo">
          <legend>Documentos</legend>
          <div className="field">Documentos completos
            <Chips opciones={DOCUMENTOS} valores={f.legal.documentos} onToggle={toggleGrupo('documentos')} />
          </div>
          <div className="field">Documentos de respaldo
            <label className="btn small outline tec-adjuntar">
              <Icon name="plus" size={14} /> Agregar archivos
              <input type="file" multiple hidden accept={`${ACCEPT_REPORTES},${ACCEPT_FOTOS}`} onChange={elegir(['foto', 'reporte'], docs, setDocs)} />
            </label>
            <span className="muted small-note">PDF, Word, Excel o imágenes (JPG, PNG, WebP). Copia literal, certificado de gravámenes, título…</span>
            {docs.length > 0 && (
              <ul className="tec-elegidos">
                {docs.map((a) => (
                  <li key={`${a.name}-${a.size}`}><span>{a.name}</span><span className="muted">{formatoTamano(a.size)}</span>
                    <button type="button" className="archivo-x en-linea" aria-label={`Quitar ${a.name}`} onClick={() => setDocs(docs.filter((x) => x !== a))}>×</button></li>
                ))}
              </ul>
            )}
          </div>
          {avisoArchivos.map((m) => <p key={m} className="error small-note">{m}</p>)}
        </fieldset>

        <fieldset className="tec-grupo">
          <legend>Revisión y observaciones</legend>
          <label className="field">Fecha de revisión
            <input name="fecha_revision" type="date" max={hoy()} value={f.legal.fecha_revision} onChange={setL} /></label>
          <label className="field">Observaciones legales
            <textarea name="observaciones" rows="3" maxLength={OBSERVACIONES_MAX} value={f.legal.observaciones} onChange={setL}
              placeholder="Riesgos, documentos pendientes, recomendaciones…" />
            <span className="counter">{f.legal.observaciones.length}/{OBSERVACIONES_MAX}</span></label>
        </fieldset>
      </>)}
      {rol === 'administrativa' && (<>
        <label className="field">Precio ofertado (S/)
          <input name="precio_ofertado" type="number" min="0" step="any" value={f.fin.precio_ofertado} onChange={setFin} required /></label>

        <fieldset className="tec-grupo">
          <legend>Costos de adquisición estimados (S/)</legend>
          <div className="costos-grid">
            {Object.entries(COSTOS).map(([k, v]) => (
              <label key={k} className="field">{v}
                <input name={k} type="number" min="0" step="any" inputMode="decimal" placeholder="0" value={f.fin.costos[k]} onChange={setCosto} /></label>
            ))}
          </div>
          <div className="costos-total">Total de costos <b>S/ {totalCostos.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></div>
        </fieldset>

        <ResumenFinanciero precio={f.fin.precio_ofertado} costos={totalCostos} area={area} referencia={referencia} />

        <fieldset className="tec-grupo">
          <legend>Documentos de respaldo</legend>
          <div className="field">Proformas, cotizaciones, tasación o comprobantes
            <label className="btn small outline tec-adjuntar">
              <Icon name="plus" size={14} /> Agregar archivos
              <input type="file" multiple hidden accept={`${ACCEPT_REPORTES},${ACCEPT_FOTOS}`} onChange={elegir(['foto', 'reporte'], docs, setDocs)} />
            </label>
            <span className="muted small-note">PDF, Word, Excel o imágenes (JPG, PNG, WebP).</span>
            {docs.length > 0 && (
              <ul className="tec-elegidos">
                {docs.map((a) => (
                  <li key={`${a.name}-${a.size}`}><span>{a.name}</span><span className="muted">{formatoTamano(a.size)}</span>
                    <button type="button" className="archivo-x en-linea" aria-label={`Quitar ${a.name}`} onClick={() => setDocs(docs.filter((x) => x !== a))}>×</button></li>
                ))}
              </ul>
            )}
          </div>
          {avisoArchivos.map((m) => <p key={m} className="error small-note">{m}</p>)}
        </fieldset>

        <fieldset className="tec-grupo">
          <legend>Revisión y observaciones</legend>
          <label className="field">Fecha de revisión
            <input name="fecha_revision" type="date" max={hoy()} value={f.fin.fecha_revision} onChange={setFin} /></label>
          <label className="field">Observaciones financieras
            <textarea name="observaciones" rows="3" maxLength={OBSERVACIONES_MAX} value={f.fin.observaciones} onChange={setFin}
              placeholder="Condiciones, supuestos de los costos, descuentos acordados…" />
            <span className="counter">{f.fin.observaciones.length}/{OBSERVACIONES_MAX}</span></label>
        </fieldset>
      </>)}
      {error && <p className="error">{error}</p>}
      <button className="btn small" disabled={saving}>{saving ? (progreso || 'Guardando…') : 'Guardar'}</button>
    </form>
  );
}
