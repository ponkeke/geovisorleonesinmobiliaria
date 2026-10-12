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

// Curvas de nivel decorativas, muy tenues, detrás de la tarjeta.
function FondoCurvas() {
  return (
    <svg className="confirm-bg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <path key={i} d={`M-50 ${520 + i * 34} C 180 ${430 + i * 30}, 360 ${640 + i * 26}, 600 ${540 + i * 30} S 1020 ${420 + i * 28}, 1250 ${520 + i * 34}`} />
        ))}
        {[0, 1, 2, 3, 4].map((i) => (
          <ellipse key={`e${i}`} cx="1040" cy="170" rx={60 + i * 42} ry={36 + i * 26} transform="rotate(-18 1040 170)" />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <ellipse key={`f${i}`} cx="140" cy="140" rx={50 + i * 38} ry={30 + i * 24} transform="rotate(14 140 140)" />
        ))}
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
        <div className="blob b1" aria-hidden="true" />
        <div className="blob b2" aria-hidden="true" />
        <FondoCurvas />
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
                <li key={titulo}>
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
