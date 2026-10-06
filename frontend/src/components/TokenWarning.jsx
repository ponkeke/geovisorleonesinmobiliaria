export default function TokenWarning() {
  return (
    <div className="map-warning" role="alert">
      <b>Mapa no disponible</b>
      <p>
        Falta el token de Mapbox. Crea <code>frontend/.env</code> con{' '}
        <code>VITE_MAPBOX_TOKEN=tu_token_publico</code> y reinicia <code>yarn dev</code>.
      </p>
    </div>
  );
}
