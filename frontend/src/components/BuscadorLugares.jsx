import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { crearSesion, recuperar, sugerir } from '../utils/buscarLugares.js';

const MIN_CARACTERES = 3;
const ESPERA_MS = 300;
const ICONO = { poi: 'building' };

// Caja de búsqueda con sugerencias. onElegir({ centro, bbox, nombre }); onError(texto) avisa al contenedor.
export default function BuscadorLugares({ onElegir, onError }) {
  const [texto, setTexto] = useState('');
  const [opciones, setOpciones] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState('ocioso');   // ocioso | buscando | listo | error
  const [activa, setActiva] = useState(-1);
  const raiz = useRef(null);
  const abortRef = useRef(null);
  const sesionRef = useRef(crearSesion());
  const elegidoRef = useRef('');   // texto puesto al elegir una opción: no vuelve a buscar
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Sugerencias con espera tras dejar de escribir; cada texto nuevo cancela la petición anterior.
  useEffect(() => {
    abortRef.current?.abort();
    const q = texto.trim();
    if (q === elegidoRef.current) return undefined;
    if (q.length < MIN_CARACTERES) { setOpciones([]); setEstado('ocioso'); return undefined; }
    setEstado('buscando');
    const ctl = new AbortController();
    abortRef.current = ctl;
    const t = setTimeout(async () => {
      try {
        const r = await sugerir(q, { sessionToken: sesionRef.current, signal: ctl.signal });
        if (ctl.signal.aborted) return;
        setOpciones(r);
        setActiva(-1);
        setEstado('listo');
      } catch (e) {
        if (e.name !== 'AbortError') setEstado('error');
      }
    }, ESPERA_MS);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [texto]);

  useEffect(() => {
    const fuera = (e) => { if (!raiz.current?.contains(e.target)) setAbierto(false); };
    document.addEventListener('pointerdown', fuera);
    return () => { document.removeEventListener('pointerdown', fuera); abortRef.current?.abort(); };
  }, []);

  const elegir = async (op) => {
    elegidoRef.current = op.nombre.trim();
    setTexto(op.nombre);
    setAbierto(false);
    onErrorRef.current('');
    try {
      const lugar = await recuperar(op.id, { sessionToken: sesionRef.current });
      sesionRef.current = crearSesion();   // la búsqueda terminó: la siguiente abre otra sesión
      onElegir({ ...lugar, nombre: op.nombre });
    } catch {
      onErrorRef.current('No se pudo ubicar ese lugar');
    }
  };

  const alTeclear = (e) => {
    if (e.key === 'Escape') { setAbierto(false); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!opciones.length) return;
      e.preventDefault();
      setAbierto(true);
      const paso = e.key === 'ArrowDown' ? 1 : -1;
      setActiva((i) => (i + paso + opciones.length) % opciones.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const op = opciones[activa >= 0 ? activa : 0];
      if (op) elegir(op);
    }
  };

  const limpiar = () => { elegidoRef.current = ''; setTexto(''); setOpciones([]); setAbierto(false); onErrorRef.current(''); };
  const mostrarLista = abierto && texto.trim().length >= MIN_CARACTERES;

  return (
    <div className="map-search" ref={raiz}>
      <Icon name="search" size={16} />
      <input
        role="combobox" aria-expanded={mostrarLista} aria-controls="buscador-lista" aria-autocomplete="list"
        aria-activedescendant={activa >= 0 ? `buscador-op-${activa}` : undefined}
        placeholder="Buscar dirección o referencia" value={texto} autoComplete="off"
        onChange={(e) => { elegidoRef.current = ''; setTexto(e.target.value); setAbierto(true); }}
        onFocus={() => setAbierto(true)} onKeyDown={alTeclear}
      />
      {texto && <button type="button" className="buscador-limpiar" onClick={limpiar} aria-label="Borrar búsqueda">×</button>}
      {mostrarLista && (
        <ul className="buscador-lista" id="buscador-lista" role="listbox">
          {estado === 'buscando' && opciones.length === 0 && <li className="buscador-vacio">Buscando…</li>}
          {estado === 'error' && <li className="buscador-vacio">No se pudo buscar. Intenta de nuevo.</li>}
          {estado === 'listo' && opciones.length === 0 && <li className="buscador-vacio">Sin resultados</li>}
          {estado !== 'error' && opciones.map((o, i) => (
            <li key={o.id} id={`buscador-op-${i}`} role="option" aria-selected={i === activa}
              className={`buscador-item${i === activa ? ' activo' : ''}`}
              onPointerDown={(e) => e.preventDefault()} onClick={() => elegir(o)} onMouseEnter={() => setActiva(i)}>
              <Icon name={ICONO[o.tipo] || 'pin'} size={16} />
              <span><b>{o.nombre}</b>{o.detalle && <small>{o.detalle}</small>}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
