import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import Icon from '../components/Icon.jsx';

// Fondo decorativo que imita un mapa (no es un mapa real).
function HeroBg() {
  return (
    <svg className="hero-bg" viewBox="0 0 1200 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="hg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4b6a58" /><stop offset=".55" stopColor="#8d9a74" /><stop offset="1" stopColor="#c7bd96" />
        </linearGradient>
      </defs>
      <rect width="1200" height="520" fill="url(#hg)" />
      <g fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="2">
        <polygon points="640,240 800,240 890,360 800,470 640,470 560,360" fill="rgba(255,255,255,.08)" />
        <polygon points="120,0 320,40 360,170 250,260 80,220 40,100" />
        <polygon points="520,30 760,20 820,140 700,200 560,170" />
        <polygon points="900,60 1200,30 1200,260 1000,300 880,200" />
      </g>
      <ellipse cx="620" cy="115" rx="70" ry="38" fill="rgba(43,74,62,.35)" />
      <path d="M-20 240 L1220 130" stroke="rgba(255,255,255,.45)" strokeWidth="26" />
    </svg>
  );
}

const FEATURES = [
  ['sparkle', 'Proceso simple y sin cuenta', 'Completa tus datos en pocos minutos.'],
  ['pin', 'Ubica tu terreno en el mapa', 'Dibuja el contorno con precisión.'],
  ['phone', 'Nos pondremos en contacto', 'Nuestro equipo revisará tu propuesta.'],
];

export default function Landing() {
  return (
    <Layout variant="public">
      <section className="hero">
        <HeroBg />
        <div className="hero-card">
          <span className="eyebrow">ADQUISICIÓN DE TERRENOS</span>
          <h1>¿Tienes un terreno que deseas ofrecer?</h1>
          <p>Compártenos su ubicación y características. Evaluaremos su potencial con criterios técnicos, comerciales y legales.</p>
          <Link to="/ofrecer" className="btn">Ofrecer mi terreno <Icon name="arrow" size={16} /></Link>
        </div>
        <div className="hero-pin">
          <span className="pin-dot"><Icon name="pin" size={18} /></span>
          <span className="pin-label">Ubica tu terreno en el mapa</span>
        </div>
      </section>
      <section className="features">
        {FEATURES.map(([icon, title, text]) => (
          <div key={title} className="feature">
            <span className="feature-icon"><Icon name={icon} /></span>
            <div><b>{title}</b><p>{text}</p></div>
          </div>
        ))}
      </section>
    </Layout>
  );
}
