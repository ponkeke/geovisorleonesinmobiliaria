import { useState } from 'react';
import Icon from './Icon.jsx';
import { registrarLevantamiento, errorMessage } from '../services/api.js';
import { DATUMS, ZONAS, FILA_VACIA, leerVertices, medirLocal, numero, zonaSugerida, formatNum } from '../utils/levantamiento.js';

const OBSERVACIONES_MAX = 1000;
const MIN_FILAS = 3;

// Formulario del Área Técnica: datos del plano del ingeniero. `previo` es el último levantamiento (nueva versión).
// Los vértices se escriben en el orden del plano; "Pegar desde Excel" acepta columnas Este, Norte y (opcional) Distancia.
export default function LevantamientoForm({ idTerreno, geometria, previo, onSaved, onCancel }) {
  const [f, setF] = useState({
    datum: previo?.datum || 'WGS84', zona_utm: String(previo?.zona_utm || zonaSugerida(geometria)),
    fecha_levantamiento: previo?.fecha_levantamiento ? String(previo.fecha_levantamiento).slice(0, 10) : '',
    ingeniero: previo?.ingeniero || '', cip: previo?.cip || '',
    area_declarada: previo?.area_declarada ? String(previo.area_declarada) : '',
    perimetro_declarado: previo?.perimetro_declarado ? String(previo.perimetro_declarado) : '',
    tolerancia_pct: previo ? String(previo.tolerancia_pct) : '0.5', observaciones: previo?.observaciones || '',
  });
  const [filas, setFilas] = useState(previo
    ? previo.vertices.map((v) => ({ este: String(v.este), norte: String(v.norte), distancia: v.distancia_plano === null ? '' : String(v.distancia_plano) }))
    : Array.from({ length: MIN_FILAS }, () => ({ ...FILA_VACIA })));
  const [pegando, setPegando] = useState(false);
  const [texto, setTexto] = useState('');
  const [avisoPegado, setAvisoPegado] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (e) => setF((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  const setFila = (i, campo) => (e) => setFilas((prev) => prev.map((x, j) => (j === i ? { ...x, [campo]: e.target.value } : x)));
  const quitar = (i) => setFilas((prev) => prev.filter((_, j) => j !== i));
  const agregar = () => setFilas((prev) => [...prev, { ...FILA_VACIA }]);

  const aplicarPegado = () => {
    const { filas: leidas, errores } = leerVertices(texto);
    setAvisoPegado(errores);
    if (!leidas.length) return;
    setFilas(leidas.length >= MIN_FILAS ? leidas : [...leidas, ...Array.from({ length: MIN_FILAS - leidas.length }, () => ({ ...FILA_VACIA }))]);
    if (!errores.length) { setPegando(false); setTexto(''); }
  };

  const medida = medirLocal(filas);
  const declarada = numero(f.area_declarada);
  const difPct = medida && declarada ? (Math.abs(medida.area - declarada) / declarada) * 100 : null;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const llenas = filas.filter((x) => x.este.trim() || x.norte.trim() || x.distancia.trim());
    if (llenas.some((x) => numero(x.este) === null || numero(x.norte) === null)) return setError('Cada vértice necesita Este y Norte numéricos');
    if (llenas.length < MIN_FILAS) return setError(`Ingrese al menos ${MIN_FILAS} vértices`);
    if (llenas.some((x) => x.distancia.trim() && !(numero(x.distancia) > 0))) return setError('Las distancias deben ser números mayores que 0');
    setSaving(true);
    try {
      const r = await registrarLevantamiento(idTerreno, {
        datum: f.datum, zona_utm: Number(f.zona_utm), fecha_levantamiento: f.fecha_levantamiento,
        ingeniero: f.ingeniero.trim(), cip: f.cip.trim(),
        vertices: llenas.map((x) => ({ este: numero(x.este), norte: numero(x.norte), distancia_plano: x.distancia.trim() ? numero(x.distancia) : null })),
        area_declarada: numero(f.area_declarada), perimetro_declarado: numero(f.perimetro_declarado),
        tolerancia_pct: numero(f.tolerancia_pct), observaciones: f.observaciones.trim(),
      });
      await onSaved({ avisos: r.avisos });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="inline-form" onSubmit={submit}>
      <fieldset className="tec-grupo">
        <legend>Sistema de referencia del plano</legend>
        <div className="lev-par">
          <label className="field">Datum
            <select name="datum" value={f.datum} onChange={set}>
              {Object.entries(DATUMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="field">Zona UTM
            <select name="zona_utm" value={f.zona_utm} onChange={set}>
              {ZONAS.map((z) => <option key={z} value={z}>{z} Sur</option>)}</select></label>
        </div>
        <span className="muted small-note">Está en el cuadro de coordenadas del plano. Si el datum o la zona no son los del plano, el terreno queda desplazado.</span>
        <div className="lev-par">
          <label className="field">Fecha del levantamiento
            <input name="fecha_levantamiento" type="date" value={f.fecha_levantamiento} onChange={set} /></label>
          <label className="field">N.° de colegiatura (CIP)
            <input name="cip" maxLength={30} value={f.cip} onChange={set} /></label>
        </div>
        <label className="field">Ingeniero responsable
          <input name="ingeniero" maxLength={200} value={f.ingeniero} onChange={set} /></label>
      </fieldset>

      <fieldset className="tec-grupo">
        <legend>Cuadro de vértices</legend>
        <div className="lev-fila lev-cab" aria-hidden="true"><span /><span>Este (m)</span><span>Norte (m)</span><span>Dist. (m)</span><span /></div>
        {filas.map((x, i) => (
          <div key={i} className="lev-fila">
            <b>V{i + 1}</b>
            <input aria-label={`Este de V${i + 1}`} inputMode="decimal" value={x.este} onChange={setFila(i, 'este')} placeholder="276540.12" />
            <input aria-label={`Norte de V${i + 1}`} inputMode="decimal" value={x.norte} onChange={setFila(i, 'norte')} placeholder="8665210.45" />
            <input aria-label={`Distancia de V${i + 1} a V${(i + 1) % filas.length + 1}`} inputMode="decimal" value={x.distancia} onChange={setFila(i, 'distancia')} placeholder="opcional" />
            <button type="button" className="archivo-x en-linea" aria-label={`Quitar V${i + 1}`} disabled={filas.length <= MIN_FILAS} onClick={() => quitar(i)}>×</button>
          </div>
        ))}
        <span className="muted small-note">Siga el contorno en el orden del plano. «Dist.» es el lado hasta el vértice siguiente (la última, hasta V1).</span>
        <div className="lev-acciones">
          <button type="button" className="btn small outline" onClick={agregar}><Icon name="plus" size={14} /> Agregar vértice</button>
          <button type="button" className="btn small outline" onClick={() => setPegando((v) => !v)}>Pegar desde Excel</button>
        </div>
        {pegando && (
          <div className="lev-pegar">
            <textarea rows="5" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Vértices pegados"
              placeholder={'V1  276540.12  8665210.45\nV2  276582.37  8665213.88\n…'} />
            <button type="button" className="btn small" onClick={aplicarPegado} disabled={!texto.trim()}>Usar estos vértices</button>
            {avisoPegado.map((m) => <p key={m} className="error small-note">{m}</p>)}
          </div>
        )}
        {medida && (
          <p className="lev-medida">Con estos vértices: <b>{formatNum(medida.area)} m²</b> · perímetro <b>{formatNum(medida.perimetro)} m</b>
            {difPct !== null && <span className={difPct > (numero(f.tolerancia_pct) ?? 0.5) ? 'fuera' : 'dentro'}> · {formatNum(difPct, 3)} % de diferencia con el área declarada</span>}</p>
        )}
      </fieldset>

      <fieldset className="tec-grupo">
        <legend>Datos declarados en el plano</legend>
        <div className="lev-par">
          <label className="field">Área (m²)
            <input name="area_declarada" inputMode="decimal" value={f.area_declarada} onChange={set} /></label>
          <label className="field">Perímetro (m)
            <input name="perimetro_declarado" inputMode="decimal" value={f.perimetro_declarado} onChange={set} /></label>
        </div>
        <label className="field">Tolerancia (%)
          <input name="tolerancia_pct" inputMode="decimal" value={f.tolerancia_pct} onChange={set} />
          <span className="small-note muted">Diferencia máxima aceptada entre lo declarado y lo calculado.</span></label>
        <label className="field">Observaciones
          <textarea name="observaciones" rows="2" maxLength={OBSERVACIONES_MAX} value={f.observaciones} onChange={set}
            placeholder="Linderos, colindantes, notas del plano…" /></label>
      </fieldset>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="lev-acciones">
        <button className="btn small" disabled={saving}>{saving ? 'Guardando…' : 'Guardar levantamiento'}</button>
        <button type="button" className="btn small outline" onClick={onCancel} disabled={saving}>Cancelar</button>
      </div>
    </form>
  );
}
