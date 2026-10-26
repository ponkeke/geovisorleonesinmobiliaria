import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Logo from './Logo.jsx';
import Icon from './Icon.jsx';
import SocialMenu from './SocialMenu.jsx';
import { getUsuario } from '../services/api.js';
import { useSessionTransition } from './SessionTransition.jsx';
import { ROLES, iniciales } from '../utils/format.js';

// variant: 'public' (landing) | 'form' (formulario) | 'plain' (solo logo) | 'internal' (panel)
export default function Layout({ children, variant = 'plain', subtitle = 'Terrenos candidatos' }) {
  const { cerrarSesion } = useSessionTransition();
  const usuario = getUsuario();
  const { pathname } = useLocation();
  const headerRef = useRef(null);
  const [fijo, setFijo] = useState(false);   // la barra superior reaparece fija al bajar la página
  const [altura, setAltura] = useState(0);   // reserva su espacio para que la página no salte al fijarse

  useEffect(() => {
    if (variant !== 'public') return undefined;
    let pendiente = false;
    const revisar = () => {
      pendiente = false;
      const h = headerRef.current;
      if (!h) return;
      const llego = window.scrollY > h.offsetHeight;   // la barra original ya salió de pantalla: reaparece fija
      setFijo((antes) => {
        if (llego && !antes) setAltura(h.offsetHeight);
        return llego;
      });
    };
    const alScroll = () => { if (!pendiente) { pendiente = true; requestAnimationFrame(revisar); } };
    revisar();
    window.addEventListener('scroll', alScroll, { passive: true });
    window.addEventListener('resize', alScroll);
    return () => { window.removeEventListener('scroll', alScroll); window.removeEventListener('resize', alScroll); };
  }, [variant]);

  // "Inicio" estando ya en la página principal sube suavemente en lugar de recargar.
  const alInicio = (e) => {
    if (pathname !== '/') return;
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (variant === 'internal') {
    return (
      <div className="app">
        <header className="topbar">
          <Logo to="/panel" light />
          <span className="topbar-sep" />
          <div className="topbar-title"><b>Geovisor de Adquisición</b><small>{subtitle}</small></div>
          {usuario && (
            <div className="topbar-user">
              <span className="avatar">{iniciales(usuario.nombre)}</span>
              <div><b>{usuario.nombre}</b><small>{ROLES[usuario.rol] || usuario.rol}</small></div>
              <button className="icon-btn dark" title="Salir" aria-label="Cerrar sesión" onClick={cerrarSesion}>
                <Icon name="logout" />
              </button>
            </div>
          )}
        </header>
        {children}
      </div>
    );
  }

  return (
    <div className="site">
      <div className="site-header-slot" style={fijo && altura ? { height: altura } : undefined}>
      <header ref={headerRef} className={`site-header${fijo ? ' is-fixed' : ''}`}>
        <Logo light />
        {variant === 'public' && (
          <>
            <nav className="site-nav">
              <Link to="/" className="active" onClick={alInicio}>Inicio</Link>
              <a className="section-link" href="#terrenos">Terrenos</a>
              <a className="section-link" href="#proyectos">Proyectos</a>
              <a className="section-link" href="#preguntas">Contacto</a>
            </nav>
            <div className="header-actions">
              <Link to="/login" className="btn soft nav-login"><Icon name="user" size={16} /> Iniciar sesión</Link>
              <Link to="/ofrecer" className="btn"><Icon name="pin" size={16} /> Ofrecer un terreno <Icon name="arrowUR" size={15} /></Link>
            </div>
          </>
        )}
        {variant === 'form' && <Link to="/" className="link-strong salir"><Icon name="logout" size={16} /> Salir del formulario</Link>}
      </header>
      </div>
      {children}
      {variant === 'public' && <SocialMenu />}
    </div>
  );
}
