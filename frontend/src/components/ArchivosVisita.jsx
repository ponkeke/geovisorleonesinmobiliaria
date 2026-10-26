import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { descargarArchivo, eliminarArchivo, errorMessage } from '../services/api.js';
import { ACCEPT_FOTOS, ACCEPT_REPORTES, formatoTamano, subirTodos, validarSeleccion } from '../utils/archivos.js';

// Las imágenes requieren sesión, así que se piden con el token y se muestran como blob.
function Miniatura({ idTerreno, archivo, onAbrir, onEliminar }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let activo = true;
    let objeto = null;
    descargarArchivo(idTerreno, archivo.id_archivo)
      .then((blob) => { if (activo) { objeto = URL.createObjectURL(blob); setUrl(objeto); } })
      .catch(() => activo && setUrl('error'));
    return () => { activo = false; if (objeto) URL.revokeObjectURL(objeto); };
  }, [idTerreno, archivo.id_archivo]);

  return (
    <li className="foto">
      <button type="button" className="foto-img" disabled={!url || url === 'error'} onClick={() => onAbrir({ url, archivo })}
        aria-label={`Ver foto ${archivo.nombre_original}`} title={archivo.nombre_original}>
        {url && url !== 'error' ? <img src={url} alt={archivo.nombre_original} /> : <span className="muted">{url === 'error' ? 'No disponible' : '…'}</span>}
      </button>
      {onEliminar && (
        <button type="button" className="archivo-x" onClick={() => onEliminar(archivo)} aria-label={`Eliminar ${archivo.nombre_original}`} title="Eliminar">×</button>
      )}
    </li>
  );
}

// Fotos de las visitas y reportes técnicos del terreno. Los ve cualquier rol; solo el Área Técnica adjunta o elimina.
export default function ArchivosVisita({ idTerreno, archivos = [], area = 'tecnica', titulo = 'FOTOS Y REPORTES DE LA VISITA', puedeEditar, onCambio, aviso, onCerrarAviso }) {
  const [abierta, setAbierta] = useState(null);   // { url, archivo } de la foto ampliada
  const [estado, setEstado] = useState({ subiendo: '', errores: [] });
  const inputRef = useRef(null);
  archivos = archivos.filter((a) => a.area === area);   // cada área ve su propia galería
  const fotos = archivos.filter((a) => a.tipo === 'foto');
  const reportes = archivos.filter((a) => a.tipo === 'reporte');

  useEffect(() => {
    if (!abierta) return undefined;
    const tecla = (e) => { if (e.key === 'Escape') setAbierta(null); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [abierta]);

  const adjuntar = async (e) => {
    const { validos, errores } = validarSeleccion(Array.from(e.target.files || []), ['foto', 'reporte']);
    e.target.value = '';
    setEstado({ subiendo: validos.length ? 'Subiendo…' : '', errores });
    if (!validos.length) return;
    const fallidos = await subirTodos(idTerreno, validos, (n, total) => setEstado((s) => ({ ...s, subiendo: `Subiendo ${n} de ${total}…` })));
    setEstado({ subiendo: '', errores: [...errores, ...fallidos.map((f) => `«${f.nombre}»: ${f.motivo}`)] });
    await onCambio();
  };

  const eliminar = async (a) => {
    if (!window.confirm(`¿Eliminar «${a.nombre_original}»?`)) return;
    try { await eliminarArchivo(idTerreno, a.id_archivo); await onCambio(); } catch (err) { setEstado((s) => ({ ...s, errores: [errorMessage(err)] })); }
  };

  const bajar = async (a) => {
    try {
      const blob = await descargarArchivo(idTerreno, a.id_archivo);
      const url = URL.createObjectURL(blob);
      const enlace = Object.assign(document.createElement('a'), { href: url, download: a.nombre_original });
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      setEstado((s) => ({ ...s, errores: [errorMessage(err)] }));
    }
  };

  const errores = [...(aviso || []), ...estado.errores];
  if (!archivos.length && !errores.length) return null;   // sin archivos no se muestra la sección (se adjuntan desde el formulario técnico)

  return (
    <div className="crit archivos-visita">
      <div className="crit-head">
        <span className="crit-title">{titulo}</span>
        {puedeEditar && (
          <>
            <button type="button" className="btn small outline" onClick={() => inputRef.current?.click()} disabled={Boolean(estado.subiendo)}>
              <Icon name="plus" size={14} /> Adjuntar
            </button>
            <input ref={inputRef} type="file" multiple hidden accept={`${ACCEPT_FOTOS},${ACCEPT_REPORTES}`} onChange={adjuntar} />
          </>
        )}
      </div>
      {estado.subiendo && <div className="muted small-note" role="status"><span className="spinner" aria-hidden="true" /> {estado.subiendo}</div>}
      {errores.length > 0 && (
        <div className="archivos-errores" role="alert">
          {errores.map((m) => <div key={m} className="error">{m}</div>)}
          <button type="button" className="textbtn" onClick={() => { setEstado((s) => ({ ...s, errores: [] })); onCerrarAviso?.(); }}>Cerrar</button>
        </div>
      )}
      {fotos.length > 0 && (
        <ul className="fotos">
          {fotos.map((a) => <Miniatura key={a.id_archivo} idTerreno={idTerreno} archivo={a} onAbrir={setAbierta} onEliminar={puedeEditar ? eliminar : null} />)}
        </ul>
      )}
      {reportes.length > 0 && (
        <ul className="reportes">
          {reportes.map((a) => (
            <li key={a.id_archivo}>
              <Icon name="clipboard" size={16} />
              <button type="button" className="textbtn" onClick={() => bajar(a)} title="Descargar">{a.nombre_original}</button>
              <span className="muted">{formatoTamano(a.tamano)}</span>
              {puedeEditar && <button type="button" className="archivo-x en-linea" onClick={() => eliminar(a)} aria-label={`Eliminar ${a.nombre_original}`} title="Eliminar">×</button>}
            </li>
          ))}
        </ul>
      )}
      {archivos.length > 0 && <div className="muted small-note">Subido por el {area === 'legal' ? 'Área Legal' : area === 'administrativa' ? 'Área Administrativa' : 'Área Técnica'} · solo visible con sesión iniciada</div>}

      {abierta && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={abierta.archivo.nombre_original} onClick={() => setAbierta(null)}>
          <button type="button" className="lightbox-cerrar" onClick={() => setAbierta(null)} aria-label="Cerrar">×</button>
          <img src={abierta.url} alt={abierta.archivo.nombre_original} onClick={(e) => e.stopPropagation()} />
          <p onClick={(e) => e.stopPropagation()}>{abierta.archivo.nombre_original} · {abierta.archivo.subido_por_nombre}</p>
        </div>
      )}
    </div>
  );
}
