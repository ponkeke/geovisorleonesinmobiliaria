// Lugares cercanos al polígono por categoría (ordenados por cercanía). Muestra carga, error y "Reintentar".
// `onResaltar(id | null)` avisa qué lugar tiene el mouse (o el foco) para resaltarlo en el mapa.
import { colorLugar } from './mapConfig.js';

export default function LugaresCercanos({ cercanos, onReintentar, onResaltar, sinTitulo = false }) {
  const { cargando, data, error } = cercanos;
  return (
    <div className="lugares">
      {!sinTitulo && <div className="crit-head"><span className="crit-title">LUGARES CERCANOS</span></div>}
      {cargando && (
        <div className="muted lugares-cargando" role="status">
          <span className="spinner" aria-hidden="true" /> Consultando lugares cercanos...
        </div>
      )}
      {!cargando && error && (
        <div className="lugares-error" role="alert">
          <span className="error">{error}</span>
          {onReintentar && <button type="button" className="btn small outline" onClick={onReintentar}>Reintentar</button>}
        </div>
      )}
      {!cargando && data && !error && data.categorias.map((c) => (
        <div key={c.clave} className="lugares-cat">
          <b><i className="lugares-punto" style={{ background: colorLugar(c.clave) }} />{c.etiqueta}</b>
          {c.lugares.length === 0
            ? <div className="muted">Ninguno en {data.radio_m} m</div>
            : <ul className="lugares-list">
                {c.lugares.map((l, i) => (
                  <li
                    key={l.id || `${l.lat},${l.lng},${i}`} tabIndex={0}
                    onMouseEnter={() => onResaltar?.(l.id)} onMouseLeave={() => onResaltar?.(null)}
                    onFocus={() => onResaltar?.(l.id)} onBlur={() => onResaltar?.(null)}
                  >
                    <span>{l.nombre}</span>
                    <span className="muted">{Math.round(l.distancia_m).toLocaleString('es-PE')} m</span>
                  </li>
                ))}
              </ul>}
        </div>
      ))}
      <div className="muted small-note">Datos de OpenStreetMap · distancias desde el borde del terreno</div>
    </div>
  );
}
