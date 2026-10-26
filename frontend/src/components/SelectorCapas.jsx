const OPCIONES = [['calle', 'Calle'], ['satelite', 'Satélite'], ['relieve', 'Relieve']];

// Alterna la capa base del mapa; quien lo usa decide cómo reinstalar sus capas tras el cambio de estilo.
export default function SelectorCapas({ capa, onChange, disabled = false }) {
  return (
    <div className="capas" role="group" aria-label="Tipo de mapa">
      {OPCIONES.map(([clave, etiqueta]) => (
        <button key={clave} type="button" className={capa === clave ? 'activa' : ''} aria-pressed={capa === clave}
          disabled={disabled} onClick={() => onChange(clave)}>{etiqueta}</button>
      ))}
    </div>
  );
}
