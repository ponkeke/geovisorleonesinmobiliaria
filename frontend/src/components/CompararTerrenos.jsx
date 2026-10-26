import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { getTerreno, errorMessage } from '../services/api.js';
import { alertasTerreno } from '../utils/alertas.js';
import { codigoTerreno, formatSoles, formatSolesCorto, ESTADOS, capitalizar } from '../utils/format.js';
import { formatM2 } from './mapConfig.js';
import { TIPOS_VIA, SUPERFICIES, SERVICIOS, ESTADOS_TRAMITE, CARGAS, DOCUMENTOS } from './CriterioForm.jsx';

const MAX = 3;
const PEND = 'Pendiente';
const soles2 = (n) => `S/ ${Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Datos de una fila para un terreno: { texto, valor? }. `valor` (número) permite resaltar el mejor de la fila.
function costos(t) {
  const fi = t.informacion_financiera;
  const precio = Number(fi ? fi.precio_ofertado : t.oferta.precio_ofertado);
  const extra = fi ? Number(fi.costos_adquisicion) : 0;
  const a = Number(t.area);
  return { precio, extra, porM2: a > 0 ? precio / a : null, totalM2: a > 0 && fi ? (precio + extra) / a : null };
}

// [etiqueta, función(t) -> { texto, valor }, 'max' | 'min' | undefined, grupo]
const FILAS = [
  ['Estado', (t) => ({ texto: t.decision ? `${ESTADOS[t.estado]} por ${t.decision.decidido_por_nombre}` : ESTADOS[t.estado] }), undefined, 'General'],
  ['Área', (t) => ({ texto: formatM2(t.area), valor: Number(t.area) }), undefined],
  ['Puntaje total', (t) => (t.puntaje ? { texto: `${t.puntaje.puntaje_total}/100`, valor: Number(t.puntaje.puntaje_total) } : { texto: PEND }), 'max'],
  ['Puntaje técnico', (t) => { const v = t.puntaje?.detalle_criterios?.puntaje_tecnico; return v === undefined ? { texto: PEND } : { texto: `${v}/100`, valor: Number(v) }; }, 'max'],
  ['Puntaje legal', (t) => { const v = t.puntaje?.detalle_criterios?.puntaje_legal; return v === undefined ? { texto: PEND } : { texto: `${v}/100`, valor: Number(v) }; }, 'max'],
  ['Puntaje financiero', (t) => { const v = t.puntaje?.detalle_criterios?.puntaje_financiero; return v === undefined ? { texto: PEND } : { texto: `${v}/100`, valor: Number(v) }; }, 'max'],

  ['Precio', (t) => { const c = costos(t); return { texto: formatSolesCorto(c.precio), valor: c.precio }; }, 'min', 'Financiero'],
  ['Precio por m²', (t) => { const c = costos(t); return c.porM2 === null ? { texto: PEND } : { texto: soles2(c.porM2), valor: c.porM2 }; }, 'min'],
  ['Costos de adquisición', (t) => (t.informacion_financiera ? { texto: formatSoles(t.informacion_financiera.costos_adquisicion), valor: Number(t.informacion_financiera.costos_adquisicion) } : { texto: PEND }), 'min'],
  ['Costo total por m²', (t) => { const c = costos(t); return c.totalM2 === null ? { texto: PEND } : { texto: soles2(c.totalM2), valor: c.totalM2 }; }, 'min'],
  ['Frente a la referencia', (t) => {
    const c = costos(t);
    const ref = Number(t.referencia_precio_m2);
    if (c.totalM2 === null || !ref) return { texto: PEND };
    const dif = Math.round(((c.totalM2 - ref) / ref) * 100);
    return { texto: dif <= 0 ? `${Math.abs(dif)} % por debajo` : `${dif} % por encima`, valor: dif };
  }, 'min'],

  ['Distancia a vía principal', (t) => (t.criterios_tecnicos ? { texto: `${t.criterios_tecnicos.distancia_via_principal} m`, valor: Number(t.criterios_tecnicos.distancia_via_principal) } : { texto: PEND }), 'min', 'Técnico'],
  ['Compatibilidad normativa', (t) => (t.criterios_tecnicos ? { texto: t.criterios_tecnicos.compatibilidad_normativa ? 'Sí' : 'No', valor: t.criterios_tecnicos.compatibilidad_normativa ? 1 : 0 } : { texto: PEND }), 'max'],
  ['Acceso', (t) => {
    const c = t.criterios_tecnicos;
    if (!c) return { texto: PEND };
    return { texto: [TIPOS_VIA[c.tipo_via_acceso], c.nombre_via_acceso, SUPERFICIES[c.superficie_via]?.toLowerCase()].filter(Boolean).join(' · ') || 'Sin especificar' };
  }],
  ['Servicios básicos', (t) => {
    const c = t.criterios_tecnicos;
    if (!c) return { texto: PEND };
    const n = Object.keys(SERVICIOS).filter((k) => c[`servicio_${k}`]);
    return { texto: `${n.length} de ${Object.keys(SERVICIOS).length}${n.length ? ` (${n.map((k) => SERVICIOS[k]).join(', ')})` : ''}`, valor: n.length };
  }, 'max'],

  ['Ruta legal', (t) => (t.situacion_legal ? { texto: capitalizar(t.situacion_legal.ruta_legal) } : { texto: PEND }), undefined, 'Legal'],
  ['Titular coincide', (t) => {
    const l = t.situacion_legal;
    if (!l) return { texto: PEND };
    return { texto: l.titular_coincide === true ? 'Sí' : l.titular_coincide === false ? 'No' : 'Sin verificar', valor: l.titular_coincide === true ? 1 : l.titular_coincide === false ? 0 : undefined };
  }, 'max'],
  ['Cargas y gravámenes', (t) => {
    const l = t.situacion_legal;
    if (!l) return { texto: PEND };
    const n = Object.entries(CARGAS).filter(([k]) => l[`carga_${k}`]).map(([, v]) => v.toLowerCase());
    return { texto: n.length ? n.join(', ') : 'Ninguna', valor: n.length };
  }, 'min'],
  ['Estado del trámite', (t) => (t.situacion_legal ? { texto: ESTADOS_TRAMITE[t.situacion_legal.estado_tramite] || t.situacion_legal.estado_tramite || 'Sin especificar' } : { texto: PEND })],
  ['Documentos completos', (t) => {
    const l = t.situacion_legal;
    if (!l) return { texto: PEND };
    const n = Object.keys(DOCUMENTOS).filter((k) => l[`doc_${k}`]).length;
    return { texto: `${n} de ${Object.keys(DOCUMENTOS).length}`, valor: n };
  }, 'max'],

  ['Puntos de atención', (t) => {
    const a = alertasTerreno(t);
    return { texto: a.length ? a.map((x) => `${x.nivel === 'alto' ? '▲' : '●'} ${x.texto}`).join('\n') : 'Ninguno', valor: a.length };
  }, 'min', 'Alertas'],
];

// Mejor valor de la fila (si hay al menos dos números distintos); devuelve el conjunto de índices ganadores.
function ganadores(celdas, modo) {
  if (!modo) return new Set();
  const vals = celdas.map((c) => (Number.isFinite(c.valor) ? c.valor : null));
  const validos = vals.filter((v) => v !== null);
  if (validos.length < 2 || new Set(validos).size < 2) return new Set();
  const mejor = modo === 'max' ? Math.max(...validos) : Math.min(...validos);
  return new Set(vals.map((v, i) => (v === mejor ? i : -1)).filter((i) => i >= 0));
}

// Comparación lado a lado de hasta MAX terrenos (solo Gerencia). `terrenos` es la lista resumida del panel.
export default function CompararTerrenos({ terrenos, idInicial, onCerrar }) {
  const [elegidos, setElegidos] = useState([idInicial]);
  const [detalles, setDetalles] = useState({});   // id -> detalle completo
  const [error, setError] = useState('');

  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onCerrar]);

  // Trae el detalle de los que faltan.
  useEffect(() => {
    let activo = true;
    elegidos.filter((id) => !detalles[id]).forEach((id) => {
      getTerreno(id)
        .then((d) => activo && setDetalles((prev) => ({ ...prev, [id]: d })))
        .catch((e) => activo && setError(errorMessage(e)));
    });
    return () => { activo = false; };
  }, [elegidos]); // eslint-disable-line react-hooks/exhaustive-deps

  const alternar = (id) => setElegidos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX ? prev : [...prev, id]));
  const listos = elegidos.map((id) => detalles[id]).filter(Boolean);
  const cargando = elegidos.length > listos.length && !error;
  const filas = useMemo(() => FILAS.map(([etiqueta, fn, modo, grupo]) => {
    const celdas = listos.map(fn);
    return { etiqueta, grupo, celdas, ganan: ganadores(celdas, modo) };
  }), [listos]);

  return (
    <div className="comparar-fondo" role="dialog" aria-modal="true" aria-label="Comparar candidatos" onClick={onCerrar}>
      <div className="comparar" onClick={(e) => e.stopPropagation()}>
        <header className="comparar-cab">
          <div>
            <h2>Comparar candidatos</h2>
            <p className="muted">Elige hasta {MAX} terrenos. Lo mejor de cada fila se marca en verde.</p>
          </div>
          <button type="button" className="comparar-x" onClick={onCerrar} aria-label="Cerrar">×</button>
        </header>

        <div className="comparar-cuerpo">
          <ul className="comparar-lista" aria-label="Terrenos disponibles">
            {terrenos.map((t) => {
              const marcado = elegidos.includes(t.id_terreno);
              const lleno = !marcado && elegidos.length >= MAX;
              return (
                <li key={t.id_terreno}>
                  <label className={`comparar-item${marcado ? ' on' : ''}${lleno ? ' off' : ''}`}>
                    <input type="checkbox" checked={marcado} disabled={lleno || t.id_terreno === idInicial} onChange={() => alternar(t.id_terreno)} />
                    <span><b>{codigoTerreno(t.id_terreno)}</b> · {t.ubicacion_referencial}
                      <small>{t.area ? formatM2(t.area) : 'Sin área'} · {t.precio_ofertado ? formatSolesCorto(t.precio_ofertado) : ''}{t.puntaje_total !== null && t.puntaje_total !== undefined ? ` · ${t.puntaje_total}/100` : ''}</small></span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="comparar-tabla-caja">
            {error && <p className="error" role="alert">{error}</p>}
            {elegidos.length < 2 && !error && (
              <p className="comparar-vacio"><Icon name="compare" size={20} /> Marca al menos otro terreno de la lista para compararlo con {codigoTerreno(idInicial)}.</p>
            )}
            {elegidos.length >= 2 && (
              <table className="comparar-tabla">
                <thead>
                  <tr>
                    <th scope="col"><span className="sr">Concepto</span></th>
                    {elegidos.map((id) => {
                      const d = detalles[id];
                      return (
                        <th key={id} scope="col">
                          <b>{codigoTerreno(id)}</b>
                          <small>{d ? d.oferta.ubicacion_referencial : 'Cargando…'}</small>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {cargando && <tr><td colSpan={elegidos.length + 1} className="muted">Cargando datos…</td></tr>}
                  {!cargando && filas.map((f, i) => (
                    <>
                      {f.grupo && <tr key={`g-${f.grupo}`} className="comparar-grupo"><th colSpan={elegidos.length + 1} scope="colgroup">{f.grupo}</th></tr>}
                      <tr key={f.etiqueta}>
                        <th scope="row">{f.etiqueta}</th>
                        {f.celdas.map((c, j) => (
                          <td key={elegidos[j]} className={`${f.ganan.has(j) ? 'mejor' : ''}${c.texto === PEND ? ' pend' : ''}`}>{c.texto}</td>
                        ))}
                      </tr>
                    </>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
