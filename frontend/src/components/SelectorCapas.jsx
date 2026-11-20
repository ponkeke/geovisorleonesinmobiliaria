const OPCIONES = [['calle', 'Calle'], ['satelite', 'Satélite'], ['relieve', 'Relieve']];

// Alterna la capa base del mapa; quien lo usa decide cómo reinstalar sus capas tras el cambio de estilo.
// Si recibe `onCatastro`, añade el botón que muestra u oculta la capa catastral de referencia (COFOPRI urbano y MIDAGRI rural).
export default function SelectorCapas({ capa, onChange, disabled = false, catastro = false, onCatastro }) {
  return (
    <div className="capas" role="group" aria-label="Tipo de mapa">
      {OPCIONES.map(([clave, etiqueta]) => (
        <button key={clave} type="button" className={capa === clave ? 'activa' : ''} aria-pressed={capa === clave}
          disabled={disabled} onClick={() => onChange(clave)}>{etiqueta}</button>
      ))}
      {onCatastro && (
        <button type="button" className={`catastro${catastro ? ' activa' : ''}`} aria-pressed={catastro}
          title="Catastro referencial de Junín: naranja = lotes urbanos (COFOPRI, zoom 15+). Trazado aproximado." onClick={() => onCatastro(!catastro)}>Catastro</button>
      )}
    </div>
  );
}
