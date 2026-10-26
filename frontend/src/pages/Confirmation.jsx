import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import Icon from '../components/Icon.jsx';
import Confeti from '../components/Confeti.jsx';
import imagenMapa from '../assets/mapa.png';
import { formatM2 } from '../components/mapConfig.js';
import { urlMapaEstatico } from '../utils/mapaEstatico.js';
import { codigoOferta, formatSoles } from '../utils/format.js';

const SIGUIENTE = [
  ['clipboard', 'Revisión técnica', 'Evaluamos el terreno y su entorno.'],
  ['shield', 'Evaluación legal', 'Verificamos la situación del predio.'],
  ['phone', 'Te contactamos', 'Nos comunicamos contigo con el resultado.'],
];

// Plano de lotización: manzanas con lotes, calles, un parque, carteles "SE VENDE" y pines de ubicación.
const BW = 360;   // ancho de manzana
const BH = 250;   // alto de manzana
const PASO_X = 430;
const PASO_Y = 320;
const X0 = 60;
const Y0 = 40;
const PARQUE = [1, 2];
const PINES = [[1, 0, 0, 1], [2, 1, 1, 2], [0, 2, 0, 3], [3, 1, 0, 0]];
const CARTELES = [[0, 0, 1, 1], [1, 1, 0, 2], [2, 0, 1, 3], [3, 2, 1, 1], [2, 2, 0, 0]];
const RELLENOS = ['#ffcc00', '#ffb36b', '#a8d89a'];

const centroLote = (c, r, i, j) => [X0 + c * PASO_X + j * (BW / 4) + BW / 8, Y0 + r * PASO_Y + i * (BH / 2) + BH / 4];

function Manzana({ c, r }) {
  const x = X0 + c * PASO_X;
  const y = Y0 + r * PASO_Y;
  if (c === PARQUE[0] && r === PARQUE[1]) {
    return (
      <g>
        <rect x={x} y={y} width={BW} height={BH} rx="10" fill="#a8d89a" fillOpacity=".55" stroke="#5c8f4a" strokeOpacity=".6" strokeWidth="2" />
        {[[60, 60], [150, 110], [250, 70], [300, 170], [90, 180], [200, 190]].map(([dx, dy]) => (
          <g key={`${dx}${dy}`}><circle cx={x + dx} cy={y + dy} r="24" fill="#7fb86a" fillOpacity=".7" stroke="#4f8a3c" strokeOpacity=".7" strokeWidth="1.5" /><circle cx={x + dx} cy={y + dy} r="4" fill="#4f8a3c" fillOpacity=".7" /></g>
        ))}
      </g>
    );
  }
  const lotes = [];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 4; j++) {
      const k = (c * 7 + r * 5 + i * 3 + j * 2) % 7;
      lotes.push(
        <rect key={`${i}${j}`} x={x + j * (BW / 4) + 2} y={y + i * (BH / 2) + 2} width={BW / 4 - 4} height={BH / 2 - 4} rx="3"
          fill={k < 3 ? RELLENOS[k] : '#ffffff'} fillOpacity={k < 3 ? 0.55 : 0.7} stroke="#8a6a1f" strokeOpacity=".55" strokeWidth="1.6" />,
      );
    }
  }
  return <g>{lotes}</g>;
}

function Pin({ x, y, delay }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="lote-pin" style={{ animationDelay: `${delay}s` }}>
        <path d="M0 0C-10-14-18-22-18-34A18 18 0 1 1 18-34C18-22 10-14 0 0Z" fill="#ff8a00" stroke="#b85c00" strokeWidth="2" />
        <circle cx="0" cy="-34" r="7" fill="#fff" />
      </g>
      <ellipse cx="0" cy="2" rx="12" ry="4" fill="#1b1b1b" fillOpacity=".18" />
    </g>
  );
}

function Cartel({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 0V-30" stroke="#8a6a1f" strokeWidth="3" strokeLinecap="round" />
      <rect x="-30" y="-52" width="60" height="22" rx="4" fill="#fff" stroke="#b85c00" strokeWidth="2" />
      <text x="0" y="-37" textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#b85c00" fontFamily="Inter, Arial, sans-serif" letterSpacing=".4">SE VENDE</text>
    </g>
  );
}

function FondoLotes() {
  const calles = [];
  for (let c = 0; c <= 4; c++) calles.push(<path key={`v${c}`} d={`M${X0 + c * PASO_X - 35} 0V900`} />);
  for (let r = 0; r <= 3; r++) calles.push(<path key={`h${r}`} d={`M0 ${Y0 + r * PASO_Y - 35}H1600`} />);
  return (
    <svg className="confirm-lotes" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="1600" height="900" fill="#f4eedb" />
      <g fill="none" stroke="#fffdf5" strokeWidth="3" strokeDasharray="16 14" strokeLinecap="round">{calles}</g>
      {[0, 1, 2, 3].flatMap((c) => [0, 1, 2].map((r) => <Manzana key={`${c}${r}`} c={c} r={r} />))}
      {CARTELES.map((l) => { const [x, y] = centroLote(...l); return <Cartel key={l.join()} x={x} y={y + 12} />; })}
      {PINES.map((l, n) => { const [x, y] = centroLote(...l); return <Pin key={l.join()} x={x} y={y + 14} delay={n * 0.7} />; })}
      <g transform="translate(1500 90)" fill="none" stroke="#8a6a1f" strokeOpacity=".7" strokeWidth="2">
        <circle r="34" fill="#fffdf5" fillOpacity=".8" />
        <path d="M0 -26L9 8L0 2L-9 8Z" fill="#ff8a00" stroke="#b85c00" />
        <text y="-42" textAnchor="middle" fontSize="15" fontWeight="800" fill="#8a6a1f" stroke="none" fontFamily="Inter, Arial, sans-serif">N</text>
      </g>
    </svg>
  );
}

// `n` escalona la aparición de cada bloque.
const revela = (n) => ({ className: 'revela', style: { '--i': n } });

export default function Confirmation() {
  const oferta = useLocation().state?.oferta;
  const mapa = useMemo(() => (oferta ? urlMapaEstatico(oferta.poligono) : null), [oferta]);
  const [mapaFalla, setMapaFalla] = useState(false);

  const resumen = oferta && [
    ['tag', 'Código de referencia', codigoOferta(oferta.id)],
    ['pin', 'Ubicación', oferta.ubicacion],
    ['expand', 'Área declarada', formatM2(oferta.area)],
    ['building', 'Precio solicitado', formatSoles(oferta.precio)],
  ];

  return (
    <Layout variant="plain">
      <main className="center-page confirm-page">
        <FondoLotes />
        <Confeti />
        <div className="card-lg confirm">
          <img className="confirm-pin" src={imagenMapa} alt="" width="110" height="110" />
          <span className="check-circle"><Icon name="check" size={28} /></span>
          <span {...revela(1)}><span className="eyebrow">OFERTA ENVIADA</span></span>
          <h1 {...revela(2)}>¡Oferta recibida!</h1>
          <p {...revela(3)}>Gracias por compartirnos tu terreno. Nuestro equipo revisará tu propuesta y se pondrá en contacto contigo.</p>

          {mapa && !mapaFalla && (
            <img {...revela(4)} className="revela confirm-mapa" src={mapa} alt="Contorno del terreno que enviaste"
              width="560" height="240" onError={() => setMapaFalla(true)} />
          )}

          {resumen && (
            <dl {...revela(5)} className="revela confirm-resumen">
              {resumen.map(([icono, etiqueta, valor]) => (
                <div key={etiqueta}>
                  <dt><Icon name={icono} size={15} />{etiqueta}</dt>
                  <dd>{valor}</dd>
                </div>
              ))}
            </dl>
          )}

          <section {...revela(6)} className="revela confirm-siguiente" aria-label="Qué sigue">
            <h2>¿Qué sigue?</h2>
            <ol>
              {SIGUIENTE.map(([icono, titulo, texto], i) => (
                <li key={titulo} style={{ '--n': i }}>
                  <span className="paso-icono"><Icon name={icono} size={18} /><b>{i + 1}</b></span>
                  <strong>{titulo}</strong>
                  <small>{texto}</small>
                </li>
              ))}
            </ol>
          </section>

          <div {...revela(7)} className="revela confirm-acciones">
            <Link to="/" className="btn">Volver al inicio</Link>
            <Link to="/ofrecer" className="btn outline">Registrar otro terreno</Link>
          </div>
        </div>
      </main>
    </Layout>
  );
}
