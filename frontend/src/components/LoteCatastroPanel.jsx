import Icon from './Icon.jsx';

const vacio = (v) => v === null || v === undefined || v === '';
const m2 = (n) => `${n.toLocaleString('es-PE')} m²`;
const metros = (n) => `${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
const fechaLarga = (iso) => {
  const [a, m, d] = String(iso).split('-');
  return a && m && d ? `${d}/${m}/${a}` : iso;
};

// Bloque con título y pares [etiqueta, valor]; se omiten los datos que el catastro no trae. Sin datos, no se muestra el bloque.
function Bloque({ titulo, filas, children }) {
  const visibles = filas.filter(([, v]) => !vacio(v));
  if (!visibles.length && !children) return null;
  return (
    <>
      <h3 className="section-label">{titulo}</h3>
      {visibles.length > 0 && (
        <dl className="dl-catastro">
          {visibles.map(([e, v]) => <div key={e}><dt>{e}</dt><dd>{v}</dd></div>)}
        </dl>
      )}
      {children}
    </>
  );
}

// Datos del catastro (COFOPRI urbano, MIDAGRI rural) del punto elegido con un clic en el mapa; se muestran en la columna
// derecha, como el detalle de un terreno. `lote` = { estado: 'cargando' | 'ok' | 'error', datos?, mensaje? }.
// Se muestra todo lo que el servicio publica; el servidor decide si trae el adjudicatario según el rol.
export default function LoteCatastroPanel({ lote, onCerrar }) {
  const { lote: l, sector: s, manzana: mz, calles = [], rural: r } = lote.datos || {};
  const veAdjudicatario = !!l && 'adjudicatario' in l;
  const difPct = l && l.area_m2 && l.area_inscrita_m2 ? (Math.abs(l.area_inscrita_m2 - l.area_m2) / l.area_inscrita_m2) * 100 : null;
  const sinNada = lote.estado === 'ok' && !l && !r;

  return (
    <div className="detail">
      <div className="detail-top">
        <span className="code-chip">CATASTRO</span>
        <button type="button" className="textbtn" onClick={onCerrar}>Cerrar</button>
      </div>

      {lote.estado === 'cargando' && <p className="muted center-msg">Consultando el catastro (COFOPRI y MIDAGRI)…</p>}
      {lote.estado === 'error' && <p className="error" role="alert">{lote.mensaje || 'No se pudo consultar el catastro. Intente de nuevo.'}</p>}

      {sinNada && (
        <>
          <h2 className="detail-title">Sin predio en este punto</h2>
          <p className="muted">El catastro no tiene un lote urbano registrado donde hizo clic. Pruebe dentro de un contorno naranja (lote).</p>
        </>
      )}

      {lote.estado === 'ok' && l && (
        <>
          <h2 className="detail-title">Lote {l.numero || '—'}{l.manzana ? ` · Manzana ${l.manzana}` : ''}</h2>
          <p className="muted"><Icon name="pin" size={14} /> {s?.nombre ? [s.nombre, s.distrito].filter(Boolean).join(' · ') : 'Sector no identificado'}</p>

          <Bloque titulo="DATOS DEL LOTE" filas={[
            ['Lote', l.numero], ['Manzana', l.manzana],
            ['Área gráfica', l.area_m2 != null ? m2(l.area_m2) : null],
            ['Área inscrita (registros)', l.area_inscrita_m2 != null ? m2(l.area_inscrita_m2) : null],
            ['Tipo de uso', l.tipo_uso], ['Detalle de uso', l.detalle_uso],
            ['Colindancia', l.tipo_colindancia], ['Detalle de colindancia', l.detalle_colindancia],
            ['Tipo de predio', l.tipo_predio], ['Edificación', l.edificacion],
            ['Fecha de transferencia', l.fecha_transferencia ? fechaLarga(l.fecha_transferencia) : null],
            ['Fuente del dato', l.fuente_dato], ['CUC', l.cuc],
          ]}>
            {difPct !== null && (
              <p className={difPct > 5 ? 'valid-aviso' : 'muted small-note'}>
                El área gráfica difiere {difPct.toFixed(1)} % de la inscrita{difPct > 5 ? ': conviene revisarlo con Legal.' : '.'}
              </p>
            )}
          </Bloque>

          <Bloque titulo="MEDIDAS (APROXIMADAS)" filas={[
            ['Perímetro', l.perimetro_m != null ? metros(l.perimetro_m) : null],
            ...(l.lados || []).map((lado, i) => [`Lado ${i + 1} · ${lado.orientacion}`, metros(lado.longitud_m)]),
          ]}>
            {l.lados?.length > 0 && (
              <p className="muted small-note">
                Calculadas del contorno del catastro (COFOPRI no publica medidas por lado). Los lados van en sentido horario desde el que mira al norte; pueden diferir de las del título.
              </p>
            )}
          </Bloque>

          {veAdjudicatario && (
            <Bloque titulo="PROPIETARIO" filas={[
              ['Adjudicatario', l.adjudicatario || 'COFOPRI no publica el nombre'],
              ['Indicador de adjudicación', l.indicador_adjudicacion],
            ]} />
          )}

          <Bloque titulo="IDENTIFICACIÓN" filas={[['ID del lote', l.id_lote], ['Plano', l.plano], ['Ubigeo', l.ubigeo]]} />
        </>
      )}

      {lote.estado === 'ok' && mz && (
        <Bloque titulo="MANZANA" filas={[['Manzana', mz.numero], ['Situación', mz.situacion], ['Área', mz.area_m2 != null ? m2(mz.area_m2) : null]]} />
      )}

      {lote.estado === 'ok' && s && (
        <Bloque titulo="SECTOR" filas={[
          ['Nombre', s.nombre], ['Distrito', s.distrito], ['Total de lotes', s.total_lotes], ['Tipo de posesión', s.tipo_posesion],
          ['Tipo de formalización', s.tipo_formalizacion], ['Área', s.area_m2 != null ? m2(s.area_m2) : null],
          ['Área inscrita', s.area_inscrita_m2 != null ? m2(s.area_inscrita_m2) : null], ['Habilitación urbana', s.habilitacion_urbana],
        ]} />
      )}

      {lote.estado === 'ok' && calles.length > 0 && (
        <Bloque titulo="CALLES CERCANAS (≈ 25 m)" filas={[]}>
          <ul className="calles-cat">{calles.map((c) => <li key={c}>{c}</li>)}</ul>
        </Bloque>
      )}

      {lote.estado === 'ok' && r?.predio && (
        <>
          <h2 className="detail-title">Predio rural {r.predio.numero || ''}</h2>
          <p className="muted">Catastro rural de MIDAGRI</p>
          <Bloque titulo="DATOS DEL PREDIO" filas={[
            ['Código', r.predio.codigo], ['Número', r.predio.numero], ['Hoja', r.predio.hoja],
            ['Área', r.predio.area_ha != null ? `${r.predio.area_ha.toLocaleString('es-PE')} ha (${m2(Math.round(r.predio.area_ha * 10000))})` : null],
            ['Perímetro', r.predio.perimetro_m != null ? `${r.predio.perimetro_m.toLocaleString('es-PE')} m` : null],
            ['Origen del dato', r.predio.origen], ['Datum', r.predio.datum], ['Cálculo', r.predio.calculo],
            ['Observación', r.predio.observacion], ['Proyecto', r.predio.proyecto], ['Ubigeo', r.predio.ubigeo], ['Plano', r.predio.plano],
          ]} />
        </>
      )}

      {lote.estado === 'ok' && r?.comunidad_campesina && (
        <Bloque titulo="COMUNIDAD CAMPESINA" filas={[
          ['Comunidad', r.comunidad_campesina.nombre], ['Departamento', r.comunidad_campesina.departamento], ['Provincia', r.comunidad_campesina.provincia],
          ['Distrito', r.comunidad_campesina.distrito], ['Estado', r.comunidad_campesina.estado],
        ]} />
      )}
      {lote.estado === 'ok' && r?.comunidad_nativa && (
        <Bloque titulo="COMUNIDAD NATIVA" filas={[
          ['Comunidad', r.comunidad_nativa.nombre], ['Federación', r.comunidad_nativa.federacion], ['Etnia', r.comunidad_nativa.etnia],
          ['N.º de título', r.comunidad_nativa.titulo], ['Año del título', r.comunidad_nativa.anio_titulo],
          ['Área titulada', r.comunidad_nativa.area_titulo_ha != null ? `${r.comunidad_nativa.area_titulo_ha.toLocaleString('es-PE')} ha` : null],
          ['Distrito', r.comunidad_nativa.distrito], ['Estado', r.comunidad_nativa.estado],
        ]} />
      )}

      {lote.estado === 'ok' && !sinNada && (
        <p className="muted small-note">
          Fuente: {lote.datos.fuente}. Los códigos (UL010, CT002, FL004…) son del catastro y no tienen leyenda pública. Dato referencial: no reemplaza a SUNARP ni al catastro municipal.
        </p>
      )}
    </div>
  );
}
