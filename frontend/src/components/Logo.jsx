import { Link } from 'react-router-dom';

export default function Logo({ to = '/', light = false }) {
  return (
    <Link to={to} className={`logo${light ? ' light' : ''}`}>
      <span className="logo-mark">L</span>
      <span className="logo-text"><b>Leones</b><small>GRUPO INMOBILIARIA</small></span>
    </Link>
  );
}
