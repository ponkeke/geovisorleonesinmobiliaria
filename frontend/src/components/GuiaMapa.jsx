import { useState } from 'react';
import Icon from './Icon.jsx';
import guia1 from '../assets/guia/guia1.png';
import guia2 from '../assets/guia/guia2.png';
import guia3 from '../assets/guia/guia3.png';
import guia4 from '../assets/guia/guia4.png';
import leon1 from '../assets/guia/leon1.png';
import leon2 from '../assets/guia/leon2.png';

const LEONES = { leon1, leon2 };

const PASOS = [
  { img: guia1, leon: 'leon2', titulo: 'Busca tu terreno',
    texto: 'Escribe la dirección o una referencia en el buscador del mapa para ubicarte rápidamente.' },
  { img: guia2, leon: 'leon2', titulo: 'Marca las esquinas',
    texto: 'Haz clic en cada esquina de tu terreno (mínimo 3) y pulsa «Finalizar». Arrastra los puntos para ajustar. No se puede dibujar sobre avenidas, jirones, pasajes, ríos ni lagos.' },
  { img: guia3, leon: 'leon1', titulo: 'Revisa la dirección',
    texto: 'La dirección se completa sola según tu contorno. Puedes corregirla si hace falta.' },
  { img: guia4, leon: 'leon1', titulo: 'Envía tu oferta',
    texto: 'Cuando el contorno sea válido, pulsa «Enviar oferta» para terminar.' },
];

// Guía previa al mapa: 4 pasos con captura y el león mascota, que se desvanece al cambiar de pose.
export default function GuiaMapa({ onTerminar }) {
  const [i, setI] = useState(0);
  const paso = PASOS[i];
  const ultimo = i === PASOS.length - 1;

  return (
    <section className="guia" aria-label="Cómo usar el mapa">
      <div className="guia-leones" aria-hidden="true">
        {Object.entries(LEONES).map(([id, src]) => (
          <img key={id} src={src} alt="" className={id === paso.leon ? 'activo' : ''} />
        ))}
      </div>
      <div className="guia-cuerpo">
        <span className="eyebrow plain">CÓMO USAR EL MAPA · {i + 1} DE {PASOS.length}</span>
        <div className="guia-contenido" key={i}>
          <h1>{paso.titulo}</h1>
          <p className="sub">{paso.texto}</p>
          <img className="guia-captura" src={paso.img} alt={`Ejemplo: ${paso.titulo}`} />
        </div>
        <div className="guia-puntos" aria-hidden="true">
          {PASOS.map((p, n) => <i key={p.titulo} className={n === i ? 'actual' : n < i ? 'hecho' : ''} />)}
        </div>
        <div className="guia-acciones">
          <button type="button" className="link-muted" onClick={onTerminar}>Omitir</button>
          <span>
            {i > 0 && <button type="button" className="btn secondary" onClick={() => setI(i - 1)}>Atrás</button>}{' '}
            <button type="button" className="btn" onClick={() => (ultimo ? onTerminar() : setI(i + 1))}>
              {ultimo ? 'Ir al mapa' : 'Siguiente'} <Icon name="arrow" size={16} />
            </button>
          </span>
        </div>
      </div>
    </section>
  );
}
