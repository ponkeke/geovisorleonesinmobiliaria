import { Link } from 'react-router-dom';
import logoLeones from '../assets/logo-leones.png';

export default function Logo({ to = '/', light = false }) {
  return (
    <Link to={to} className={`logo${light ? ' light' : ''}`}>
      <img className="logo-img" src={logoLeones} alt="Leones Grupo Inmobiliario" />
    </Link>
  );
}
