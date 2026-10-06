import { Link, useNavigate } from 'react-router-dom';
import Logo from './Logo.jsx';
import Icon from './Icon.jsx';
import { getUsuario, logout } from '../services/api.js';
import { ROLES, iniciales } from '../utils/format.js';

// variant: 'public' (landing) | 'form' (formulario) | 'plain' (solo logo) | 'internal' (panel)
export default function Layout({ children, variant = 'plain', subtitle = 'Terrenos candidatos' }) {
  const navigate = useNavigate();
  const usuario = getUsuario();

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
              <button className="icon-btn dark" title="Salir" onClick={() => { logout(); navigate('/login'); }}>
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
      <header className="site-header">
        <Logo />
        {variant === 'public' && (
          <>
            <nav className="site-nav"><Link to="/" className="active">Inicio</Link></nav>
            <Link to="/ofrecer" className="btn">Ofrecer un terreno <Icon name="arrowUR" size={15} /></Link>
          </>
        )}
        {variant === 'form' && <Link to="/" className="link-strong">Salir del formulario</Link>}
      </header>
      {children}
      {variant === 'public' && (
        <footer className="site-footer"><Link to="/login">Acceso interno</Link></footer>
      )}
    </div>
  );
}
