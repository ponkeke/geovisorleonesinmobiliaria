import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { logout } from '../services/api.js';
import leonAnimado from '../assets/leon.gif';
import logoLeones from '../assets/logo-leones.png';

const SessionContext = createContext(null);
const MIN_VISIBLE_MS = 1000;
const FADE_MS = 650;   // duración del desvanecimiento de la pantalla de transición (coincide con el CSS)

function SessionLoader({ message, detail, leaving }) {
  const dialog = useRef(null);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setReducedMotion(preference.matches);
    preference.addEventListener('change', changed);
    return () => preference.removeEventListener('change', changed);
  }, []);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return createPortal(
    <div className={`session-overlay${leaving ? ' is-leaving' : ''}`}>
      <div className="session-dialog" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-busy="true"
        aria-labelledby="session-message" aria-describedby="session-detail">
        <img className="session-logo" src={reducedMotion ? logoLeones : leonAnimado} alt="" width="200" height="200" />
        <span className="eyebrow plain">LEONES GRUPO INMOBILIARIO</span>
        <h2 id="session-message" role="status" aria-live="polite">{message}</h2>
        <p id="session-detail">{detail}</p>
        <span className="session-progress" aria-hidden="true"><span /></span>
      </div>
    </div>,
    document.body,
  );
}

export function SessionTransitionProvider({ children }) {
  const [transition, setTransition] = useState(null);
  const [leaving, setLeaving] = useState(false);   // la pantalla ya se está desvaneciendo
  const inFlight = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const image = new Image();
    image.src = leonAnimado;
  }, []);

  // `alTerminar` se ejecuta justo cuando la pantalla empieza a desvanecerse: lo que monte (login, panel)
  // se anima visible detrás de ella en lugar de aparecer de golpe.
  const runWithTransition = useCallback((action, options) => {
    if (inFlight.current) return inFlight.current;
    setLeaving(false);
    setTransition(options);
    const minimumVisible = new Promise((resolve) => setTimeout(resolve, MIN_VISIBLE_MS));
    const operation = (async () => {
      try {
        return await action();
      } finally {
        await minimumVisible;
        options?.alTerminar?.();
        setLeaving(true);
        setTimeout(() => { setTransition(null); setLeaving(false); }, FADE_MS);
        inFlight.current = null;
      }
    })();
    inFlight.current = operation;
    return operation;
  }, []);

  const cerrarSesion = useCallback(() => runWithTransition(() => Promise.resolve(), {
    message: 'Cerrando sesión…',
    detail: 'Gracias por visitar el geovisor de Leones.',
    alTerminar: () => { logout(); navigate('/login', { replace: true }); },
  }), [navigate, runWithTransition]);

  const value = useMemo(() => ({ runWithTransition, cerrarSesion }), [runWithTransition, cerrarSesion]);

  return (
    <SessionContext.Provider value={value}>
      <div inert={transition && !leaving ? '' : undefined}>{children}</div>
      {transition && <SessionLoader {...transition} leaving={leaving} />}
    </SessionContext.Provider>
  );
}

export const useSessionTransition = () => useContext(SessionContext);
