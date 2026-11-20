import { useState } from 'react';
import Icon from './Icon.jsx';
import LevantamientoForm from './LevantamientoForm.jsx';
import { DATUMS, formatNum } from '../utils/levantamiento.js';

const ANCHO = 320;
const ALTO = 230;
const MARGEN = 34;

const fechaCorta = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });

// Croquis del polígono medido, con norte hacia arriba, vértices y largo de cada lado.
function Croquis({ vertices }) {
  const es = vertices.map((v) => v.este);
  const ns = vertices.map((v) => v.norte);
  const minE = Math.min(...es); const minN = Math.min(...ns);
  const dE = Math.max(...es) - minE || 1; const dN = Math.max(...ns) - minN || 1;
  const esc = Math.min((ANCHO - 2 * MARGEN) / dE, (ALTO - 2 * MARGEN) / dN);
  const offX = (ANCHO - dE * esc) / 2; const offY = (ALTO - dN * esc) / 2;
  const pts = vertices.map((v) => [offX + (v.este - minE) * esc, ALTO - offY - (v.norte - minN) * esc]);
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const afuera = ([x, y], k) => { const d = Math.hypot(x - cx, y - cy) || 1; return [x + ((x - cx) / d) * k, y + ((y - cy) / d) * k]; };
  return (
    <svg className="lev-croquis" viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label={`Croquis del polígono medido, ${vertices.length} vértices`}>
      <polygon points={pts.map((p) => p.join(',')).join(' ')} className="lev-poligono" />
      {pts.map((p, i) => {
        const s = pts[(i + 1) % pts.length];
        const [tx, ty] = afuera([(p[0] + s[0]) / 2, (p[1] + s[1]) / 2], 11);
        const [vx, vy] = afuera(p, 13);
        return (
          <g key={i}>
            <circle cx={p[0]} cy={p[1]} r="3.5" className="lev-vertice" />
            <text x={vx} y={vy} className="lev-etq-vertice" textAnchor="middle" dominantBaseline="middle">V{i + 1}</text>
            <text x={tx} y={ty} className="lev-etq-lado" textAnchor="middle" dominantBaseline="middle">{formatNum(vertices[i].distancia_calculada)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Estado({ ok }) {
  if (ok === null) return <span className="crit-badge pending">Sin declarar</span>;
  return ok
    ? <span className="crit-badge revisado"><Icon name="check" size={14} /> Dentro de tolerancia</span>
    : <span className="crit-badge lev-fuera">Fuera de tolerancia</span>;
}

// Levantamiento topográfico de un terreno: croquis, medidas y verificación contra el plano del ingeniero.
// El Área Técnica lo registra (y puede registrar nuevas versiones); el resto de áreas solo lo ve.
export default function LevantamientoTopografico({ terreno: t, puedeEditar, onChanged }) {
  const lev = t.levantamiento;
  const [abierto, setAbierto] = useState(false);
  const [avisos, setAvisos] = useState([]);
  if (!lev && !puedeEditar) return null;

  const guardado = async (info) => {
    setAbierto(false);
    setAvisos(info?.avisos || []);
    await onChanged();
  };
  const v = lev?.verificacion;
  const filas = lev ? [['Área', 'm²', v.area], ['Perímetro', 'm', v.perimetro]] : [];
  const fueraDeLado = lev ? v.lados.filter((l) => l.coincide === false) : [];

  return (
    <div className="crit lev">
      <div className="crit-head">
        <span className="crit-title">LEVANTAMIENTO TOPOGRÁFICO</span>
        {lev ? <Estado ok={v.dentro_tolerancia} /> : <span className="crit-badge pending">Pendiente</span>}
      </div>

      {!lev && !abierto && <div className="muted">Sin plano del ingeniero. Registre sus vértices para medir el terreno con exactitud.</div>}
      {lev && (
        <>
          <div className="crit-value">{formatNum(lev.area_utm)} m²</div>
          <div className="muted">Calculada en UTM con los vértices del plano · perímetro {formatNum(lev.perimetro_utm)} m</div>
          <Croquis vertices={lev.vertices} />
          <table className="lev-tabla">
            <thead><tr><th /><th>Declarado</th><th>Calculado</th><th>Diferencia</th></tr></thead>
            <tbody>
              {filas.map(([nombre, unidad, x]) => (
                <tr key={nombre}>
                  <th scope="row">{nombre}</th>
                  <td>{x.declarada === null ? '—' : `${formatNum(x.declarada)} ${unidad}`}</td>
                  <td>{formatNum(x.calculada)} {unidad}</td>
                  <td className={x.dentro === false ? 'fuera' : ''}>{x.diferencia === null ? '—' : `${x.diferencia > 0 ? '+' : ''}${formatNum(x.diferencia)} (${formatNum(x.diferencia_pct, 3)} %)`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="muted">Tolerancia {formatNum(lev.tolerancia_pct)} %</div>
          {fueraDeLado.length > 0 && (
            <div className="lev-alerta">Lados que no coinciden con el plano: {fueraDeLado.map((l) => `${l.lado} (plano ${formatNum(l.declarada)} m, calculado ${formatNum(l.calculada)} m)`).join('; ')}</div>
          )}
          <div className="muted">Sistema: {DATUMS[lev.datum]} · UTM {lev.zona_utm} Sur (EPSG:{lev.epsg})</div>
          {(lev.ingeniero || lev.cip) && <div className="muted">Ingeniero: {[lev.ingeniero, lev.cip && `CIP ${lev.cip}`].filter(Boolean).join(' · ')}</div>}
          {lev.fecha_levantamiento && <div className="muted">Levantamiento: {fechaCorta(lev.fecha_levantamiento)} · registrado por {lev.registrado_por_nombre}</div>}
          {lev.desplazamiento_m !== null && <div className="muted">Centro a {Math.round(lev.desplazamiento_m)} m del dibujo del propietario</div>}
          {lev.observaciones && <div className="muted">Observaciones: {lev.observaciones}</div>}
        </>
      )}
      {avisos.map((a) => <div key={a} className="lev-alerta" role="status">{a}</div>)}

      {puedeEditar && !abierto && (
        <button className="textbtn" onClick={() => { setAvisos([]); setAbierto(true); }}>
          {lev ? 'Registrar nueva versión' : 'Registrar levantamiento'}
        </button>
      )}
      {abierto && <LevantamientoForm idTerreno={t.id_terreno} geometria={t.geometria} previo={lev} onSaved={guardado} onCancel={() => setAbierto(false)} />}
    </div>
  );
}
