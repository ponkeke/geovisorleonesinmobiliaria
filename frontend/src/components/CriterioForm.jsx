import { useEffect, useRef, useState } from 'react';
import LugaresCercanos from './LugaresCercanos.jsx';
import {
  registrarCriteriosTecnicos, registrarSituacionLegal, registrarInformacionFinanciera, errorMessage,
} from '../services/api.js';

const RUTAS = ['partida registral', 'desmembramiento', 'prescripción adquisitiva'];

// Formulario simple según el rol del usuario. Llama onSaved() al guardar.
// `cercanos` ({ cargando, data, error }) precarga la distancia a vía principal; el usuario la confirma o corrige.
export default function CriterioForm({ rol, idTerreno, onSaved, cercanos, onReintentar }) {
  const [f, setF] = useState({
    distancia_via_principal: '', compatibilidad_normativa: 'true',
    ruta_legal: RUTAS[0], estado_tramite: '',
    precio_ofertado: '', costos_adquisicion: '0',
  });
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
        });
      } else if (rol === 'legal') {
        call = () => registrarSituacionLegal(idTerreno, { ruta_legal: f.ruta_legal, estado_tramite: f.estado_tramite });
      } else {
        if (invalid(f.precio_ofertado) || invalid(f.costos_adquisicion)) {
          return setError('Precio y costos deben ser números mayores o iguales a 0');
        }
        call = () => registrarInformacionFinanciera(idTerreno, {
          precio_ofertado: Number(f.precio_ofertado), costos_adquisicion: Number(f.costos_adquisicion),
        });
      }
      setSaving(true);
      await call();
      await onSaved();
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
        {cercanos && <LugaresCercanos cercanos={cercanos} onReintentar={onReintentar} />}
        <label className="field">Compatibilidad normativa
          <select name="compatibilidad_normativa" value={f.compatibilidad_normativa} onChange={set}>
            <option value="true">Sí</option><option value="false">No</option></select></label>
      </>)}
      {rol === 'legal' && (<>
        <label className="field">Ruta legal
          <select name="ruta_legal" value={f.ruta_legal} onChange={set}>
            {RUTAS.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label className="field">Estado del trámite<input name="estado_tramite" value={f.estado_tramite} onChange={set} /></label>
      </>)}
      {rol === 'administrativa' && (<>
        <label className="field">Precio ofertado
          <input name="precio_ofertado" type="number" min="0" step="any" value={f.precio_ofertado} onChange={set} required /></label>
        <label className="field">Costos de adquisición
          <input name="costos_adquisicion" type="number" min="0" step="any" value={f.costos_adquisicion} onChange={set} /></label>
      </>)}
      {error && <p className="error">{error}</p>}
      <button className="btn small" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
    </form>
  );
}
