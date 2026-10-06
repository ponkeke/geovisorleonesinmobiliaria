import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import Icon from '../components/Icon.jsx';
import { login, errorMessage } from '../services/api.js';

const ROLES = ['Gerencia', 'Área Técnica', 'Área Legal', 'Área Administrativa'];

export default function Login() {
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [ver, setVer] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(correo, password);
      navigate('/panel');
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <span className="blob b1" /><span className="blob b2" />
      <form className="card-lg login-card" onSubmit={submit}>
        <Logo />
        <span className="chip">ACCESO INTERNO</span>
        <h1>Bienvenido de nuevo</h1>
        <p className="sub">Ingresa tus credenciales para acceder al Geovisor de Adquisición de Terrenos.</p>
        <div className="role-chips">{ROLES.map((r) => <span key={r}>{r}</span>)}</div>

        <label className="field">Correo
          <span className="input-affix left">
            <Icon name="user" size={16} />
            <input type="email" placeholder="correo@leones.test" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
          </span>
        </label>
        <label className="field">Contraseña
          <span className="input-affix left right">
            <Icon name="lock" size={16} />
            <input type={ver ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="button" className="affix-btn" onClick={() => setVer(!ver)} aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
              <Icon name={ver ? 'eyeOff' : 'eye'} size={16} />
            </button>
          </span>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn block" disabled={loading}>{loading ? 'Ingresando…' : <>Ingresar <Icon name="arrow" size={16} /></>}</button>

        <div className="notice"><Icon name="shield" size={18} />
          <span>Acceso exclusivo para personal interno autorizado de Leones Grupo Inmobiliaria.</span>
        </div>
      </form>
    </div>
  );
}
