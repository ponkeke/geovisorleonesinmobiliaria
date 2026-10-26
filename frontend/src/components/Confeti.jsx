import { useEffect, useMemo, useState } from 'react';
import { PALETA } from '../theme.js';

const COLORES = [PALETA.amarillo, PALETA.naranja, PALETA.negro, PALETA.blanco];
const PIEZAS = 28;
const DURACION_MS = 4500;

// Lluvia de papelitos que cae una sola vez y se retira sola. No se muestra si el usuario pidió menos movimiento.
export default function Confeti() {
  const [visible, setVisible] = useState(
    () => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );
  const piezas = useMemo(() => Array.from({ length: PIEZAS }, (_, i) => ({
    id: i,
    izquierda: Math.random() * 100,
    retraso: Math.random() * 0.9,
    duracion: 2.6 + Math.random() * 1.6,
    ancho: 6 + Math.random() * 7,
    redonda: Math.random() > 0.55,
    giro: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
    deriva: (Math.random() - 0.5) * 160,
    color: COLORES[i % COLORES.length],
  })), []);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), DURACION_MS);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;
  return (
    <div className="confeti" aria-hidden="true">
      {piezas.map((p) => (
        <i key={p.id} style={{
          left: `${p.izquierda}%`, width: p.ancho, height: p.redonda ? p.ancho : p.ancho * 0.45,
          background: p.color, borderRadius: p.redonda ? '50%' : 2, animationDelay: `${p.retraso}s`,
          animationDuration: `${p.duracion}s`, '--giro': `${p.giro}deg`, '--deriva': `${p.deriva}px`,
        }} />
      ))}
    </div>
  );
}
