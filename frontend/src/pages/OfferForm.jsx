import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import Icon from '../components/Icon.jsx';
import PolygonPicker from '../components/PolygonPicker.jsx';
import GuiaMapa from '../components/GuiaMapa.jsx';
import leonAside from '../assets/guia/leon3.png';
import { hasMapboxToken } from '../components/mapConfig.js';
import { enviarOferta, errorMessage } from '../services/api.js';
import { centroide, direccionDesde } from '../utils/geocodificar.js';
import {
  DESCRIPCION_MAX, filtrarNombre, normalizarNombre, filtrarPrecio, formatearPrecio, formatearCelular,
  validarNombre, validarContacto, validarPrecio, validarDescripcion, validarUbicacion,
} from '../utils/validators.js';

const initial = {
  nombre_propietario: '', contacto: '', ubicacion_referencial: '', precio_ofertado: '', descripcion: '',
};
const PASOS = ['Datos generales', 'Ubicación'];
const CAMPOS_PASO_1 = ['nombre_propietario', 'contacto', 'precio_ofertado', 'descripcion'];

const VALIDADORES = {
  nombre_propietario: validarNombre,
  contacto: validarContacto,
  precio_ofertado: validarPrecio,
  descripcion: validarDescripcion,
  ubicacion_referencial: validarUbicacion,
};

function Stepper({ paso }) {
  return (
    <ol className="stepper">
      {PASOS.map((nombre, i) => {
        const n = i + 1;
        const estado = n < paso ? 'done' : n === paso ? 'current' : '';
        return (
          <li key={nombre} className={estado}>
            <span className="step-dot">{n < paso ? <Icon name="check" size={14} /> : n}</span>
            <span className="step-name">{nombre}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function OfferForm() {
  const [paso, setPaso] = useState(1);
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [precioEditando, setPrecioEditando] = useState(false);
  const [poligono, setPoligono] = useState(null); // { geometry, area }
  const [errorGeneral, setErrorGeneral] = useState('');
  const [sending, setSending] = useState(false);
  const [estadoPoligono, setEstadoPoligono] = useState('ninguno');   // ninguno | validando | ok | error | nd
  const [foco, setFoco] = useState(null);
  const [guiaVista, setGuiaVista] = useState(false);   // la guía del mapa se muestra una vez por registro
  const refs = useRef({});
  const ubicacionEditada = useRef(false);   // true si el usuario escribió la dirección a mano
  const [sugerencia, setSugerencia] = useState('');   // '' | cargando | ok | fallo
  const navigate = useNavigate();

  // Lleva el foco al campo pedido una vez renderizado el paso correspondiente.
  useEffect(() => {
    if (foco && refs.current[foco]) { refs.current[foco].focus(); setFoco(null); }
  }, [foco, paso]);

  const setCampo = (name, value) => setForm((f) => ({ ...f, [name]: value }));
  const setError = (name, error) => setErrors((e) => ({ ...e, [name]: error || undefined }));

  // Valida un campo; devuelve el valor normalizado (o undefined si hay error).
  const validar = (name, valor = form[name]) => {
    const r = VALIDADORES[name](valor);
    setError(name, r.error);
    return r.error ? undefined : r;
  };

  const onNombre = (e) => setCampo('nombre_propietario', filtrarNombre(e.target.value)); // bloquea dígitos y símbolos
  const onNombreBlur = () => {
    const n = normalizarNombre(form.nombre_propietario);
    setCampo('nombre_propietario', n);
    validar('nombre_propietario', n);
  };
  const onContactoBlur = () => {
    const r = validar('contacto');
    if (r) setCampo('contacto', /^\d+$/.test(r.valor) ? formatearCelular(r.valor) : r.valor);
  };
  const onPrecio = (e) => setCampo('precio_ofertado', filtrarPrecio(e.target.value));
  const onDescripcionBlur = () => {
    const d = form.descripcion.trim();
    setCampo('descripcion', d);
    validar('descripcion', d);
  };

  const siguiente = (e) => {
    e.preventDefault();
    setErrorGeneral('');
    const resultados = {};
    let primero = null;
    for (const name of CAMPOS_PASO_1) {
      const r = VALIDADORES[name](form[name]);
      if (r.error) { setError(name, r.error); primero = primero || name; } else resultados[name] = r.valor;
    }
    if (primero) { setFoco(primero); refs.current[primero]?.focus(); return; }
    setForm((f) => ({ ...f, ...resultados, precio_ofertado: String(resultados.precio_ofertado) }));
    setPaso(2);
  };

  const submit = async (e) => {
    e.preventDefault();
    setErrorGeneral('');
    const ubic = VALIDADORES.ubicacion_referencial(form.ubicacion_referencial);
    setError('ubicacion_referencial', ubic.error);
    if (ubic.error) { refs.current.ubicacion_referencial?.focus(); return; }
    if (!poligono) { setError('poligono', 'Dibuje el polígono del terreno en el mapa'); return; }

    // Los textos ya fueron normalizados al avanzar; se revalidan por seguridad.
    const nombre = validarNombre(form.nombre_propietario);
    const contacto = validarContacto(form.contacto);
    const precio = validarPrecio(form.precio_ofertado);
    const descripcion = validarDescripcion(form.descripcion);
    const fallo = [['nombre_propietario', nombre], ['contacto', contacto], ['precio_ofertado', precio], ['descripcion', descripcion]]
      .find(([, r]) => r.error);
    if (fallo) { setError(fallo[0], fallo[1].error); setPaso(1); setFoco(fallo[0]); return; }

    setSending(true);
    try {
      const registrada = await enviarOferta({
        nombre_propietario: nombre.valor,
        contacto: contacto.valor,
        ubicacion_referencial: ubic.valor,
        precio_ofertado: precio.valor,
        descripcion: descripcion.valor,
        poligono: poligono.geometry,
      });
      navigate('/confirmacion', {
        state: { oferta: { id: registrada.id_oferta, area: registrada.area, ubicacion: ubic.valor, precio: precio.valor, poligono: poligono.geometry } },
      });
    } catch (err) {
      setSending(false);
      const { campo, error: msg } = err.response?.data || {};
      if (campo && (CAMPOS_PASO_1.includes(campo) || campo === 'ubicacion_referencial' || campo === 'poligono')) {
        setError(campo, msg);
        if (CAMPOS_PASO_1.includes(campo)) { setPaso(1); setFoco(campo); }
        else if (campo === 'ubicacion_referencial') setFoco(campo);
      } else {
        setErrorGeneral(errorMessage(err));
      }
    }
  };

  // Dirección sugerida desde el centro del polígono (reverse geocoding), con espera de 600 ms.
  // Si el usuario escribió la dirección no se sobrescribe; solo se sugiere de nuevo tras borrar y redibujar.
  useEffect(() => {
    if (!poligono) { ubicacionEditada.current = false; setSugerencia(''); return undefined; }
    if (ubicacionEditada.current) return undefined;
    const ctrl = new AbortController();
    const espera = setTimeout(async () => {
      setSugerencia('cargando');
      try {
        const c = centroide(poligono.geometry);
        const texto = await direccionDesde(c, ctrl.signal);
        if (ctrl.signal.aborted || ubicacionEditada.current) return;
        setCampo('ubicacion_referencial', texto);
        if (texto) setError('ubicacion_referencial', undefined);
        setSugerencia(texto ? 'ok' : 'fallo');
      } catch {
        if (ctrl.signal.aborted || ubicacionEditada.current) return;
        setCampo('ubicacion_referencial', '');
        setSugerencia('fallo');
      }
    }, 600);
    return () => { clearTimeout(espera); ctrl.abort(); };
  }, [poligono]); // eslint-disable-line react-hooks/exhaustive-deps

  const onUbicacion = (e) => {
    ubicacionEditada.current = true;
    setSugerencia('');
    setCampo('ubicacion_referencial', e.target.value);
  };

  const onPoligono = (p) => {
    setPoligono(p);
    if (p) setError('poligono', undefined);
  };

  // Props comunes de accesibilidad para un campo con error en línea.
  const a11y = (name) => ({
    ref: (el) => { refs.current[name] = el; },
    'aria-invalid': errors[name] ? 'true' : undefined,
    'aria-describedby': errors[name] ? `err-${name}` : undefined,
  });
  const Err = ({ name }) => (errors[name] ? <p className="field-error" id={`err-${name}`} role="alert">{errors[name]}</p> : null);

  const precioMostrado = !precioEditando && validarPrecio(form.precio_ofertado).valor
    ? formatearPrecio(form.precio_ofertado) : form.precio_ofertado;

  return (
    <Layout variant="form">
      <Stepper paso={paso} />
      <main className="form-page">
        {paso === 1 && (
          <div className="oferta-grid">
            <aside className="oferta-aside" aria-label="Sobre el proceso">
              <div className="oferta-aside-texto">
                <span className="eyebrow">OFRECE TU TERRENO</span>
                <h2>Tu terreno puede ser nuestro próximo proyecto.</h2>
                <ul>
                  <li><span><Icon name="sparkle" size={18} /></span>Sin crear cuenta, en pocos minutos.</li>
                  <li><span><Icon name="pin" size={18} /></span>Delimita tu terreno directamente en el mapa.</li>
                  <li><span><Icon name="phone" size={18} /></span>Nuestro equipo revisará tu propuesta y te contactará.</li>
                </ul>
              </div>
              <img className="oferta-leon" src={leonAside} alt="" aria-hidden="true" />
            </aside>
          <form onSubmit={siguiente} className="form-card" noValidate>
            <span className="eyebrow plain">PASO 1 DE 2</span>
            <h1>Datos generales</h1>
            <p className="sub">Cuéntanos quién eres y qué esperas por tu terreno.</p>

            <label className="field">Nombre del propietario
              <span className="input-affix left">
                <Icon name="user" size={16} />
                <input
                  {...a11y('nombre_propietario')} name="nombre_propietario" placeholder="Nombre y apellidos" maxLength={80}
                  autoComplete="name" value={form.nombre_propietario} onChange={onNombre} onBlur={onNombreBlur}
                />
              </span>
              <Err name="nombre_propietario" />
            </label>

            <label className="field">Teléfono o correo
              <span className="input-affix left">
                <Icon name="phone" size={16} />
                <input
                  {...a11y('contacto')} name="contacto" placeholder="999 123 456 / correo@ejemplo.com" maxLength={100}
                  autoComplete="email" value={form.contacto} onChange={(e) => setCampo('contacto', e.target.value)} onBlur={onContactoBlur}
                />
              </span>
              <Err name="contacto" />
            </label>

            <label className="field">Precio solicitado
              <span className="input-affix left">
                <span className="affix-text prefix">S/</span>
                <input
                  {...a11y('precio_ofertado')} name="precio_ofertado" type="text" inputMode="decimal" placeholder="0.00"
                  value={precioMostrado} onChange={onPrecio}
                  onFocus={() => setPrecioEditando(true)}
                  onBlur={() => { setPrecioEditando(false); validar('precio_ofertado'); }}
                />
              </span>
              <Err name="precio_ofertado" />
            </label>

            <label className="field">Descripción adicional <span className="muted opt">(opcional)</span>
              <textarea
                {...a11y('descripcion')} name="descripcion" rows="4" maxLength={DESCRIPCION_MAX}
                placeholder="Accesos, servicios cercanos u otros detalles..."
                value={form.descripcion} onChange={(e) => setCampo('descripcion', e.target.value)} onBlur={onDescripcionBlur}
              />
              <span className={`counter${form.descripcion.length >= DESCRIPCION_MAX ? ' max' : ''}`}>
                {form.descripcion.length}/{DESCRIPCION_MAX}
              </span>
              <Err name="descripcion" />
            </label>

            <div className="form-actions">
              <Link to="/" className="link-muted">Cancelar</Link>
              <button className="btn">Siguiente <Icon name="arrow" size={16} /></button>
            </div>
          </form>
          </div>
        )}

        {paso === 2 && !guiaVista && <GuiaMapa onTerminar={() => setGuiaVista(true)} />}

        {paso === 2 && guiaVista && (
          <form onSubmit={submit} className="loc-grid" noValidate>
            <div className="loc-direccion">
            <label className="field">Dirección o referencia
              <span className="input-affix left">
                <Icon name="pin" size={16} />
                <input
                  {...a11y('ubicacion_referencial')} name="ubicacion_referencial" placeholder="Ej. Av. Los Olivos km 4"
                  value={form.ubicacion_referencial} onChange={onUbicacion}
                  onBlur={() => validar('ubicacion_referencial')}
                />
              </span>
              <Err name="ubicacion_referencial" />
              {!errors.ubicacion_referencial && sugerencia === 'cargando' && <span className="muted small-note">Obteniendo dirección…</span>}
              {!errors.ubicacion_referencial && sugerencia === 'ok' && <span className="muted small-note">Dirección sugerida automáticamente. Puedes corregirla.</span>}
              {!errors.ubicacion_referencial && sugerencia === 'fallo' && <span className="muted small-note">No se pudo obtener la dirección automáticamente, escribe una referencia</span>}
            </label>
              {!hasMapboxToken && <p className="error">No se puede enviar la oferta sin el mapa (falta el token de Mapbox).</p>}
            </div>
            <div className="loc-map">
              <PolygonPicker onChange={onPoligono} onValidacion={setEstadoPoligono} initial={poligono?.geometry} />
              <Err name="poligono" />
            </div>
            <div className="form-actions loc-actions">
              <Link to="/" className="link-muted">Cancelar</Link>
              <span>
                <button type="button" className="btn secondary" onClick={() => setPaso(1)}>Atrás</button>{' '}
                <button className="btn" disabled={sending || !hasMapboxToken || estadoPoligono === 'error' || estadoPoligono === 'validando'}
                  title={estadoPoligono === 'error' ? 'Corrija el contorno del terreno para poder enviar' : undefined}>
                  {sending ? 'Enviando…' : <>Enviar oferta <Icon name="arrow" size={16} /></>}
                </button>
              </span>
            </div>
            {errorGeneral && <p className="error loc-error" role="alert">{errorGeneral}</p>}
          </form>
        )}
      </main>
    </Layout>
  );
}
