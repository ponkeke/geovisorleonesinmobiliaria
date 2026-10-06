import { useEffect, useState } from 'react';
import { MAPBOX_TOKEN, hasMapboxToken, boundsOf } from './mapConfig.js';

// Ubicación en texto del propietario + dirección aproximada (Mapbox reverse geocoding) desde el centro del polígono.
export default function UbicacionApoyo({ geometria, textoPropietario }) {
  const [direccion, setDireccion] = useState({ estado: 'cargando', texto: '' });

  useEffect(() => {
    const b = geometria && boundsOf([geometria]);
    if (!b || !hasMapboxToken) { setDireccion({ estado: 'nd', texto: '' }); return undefined; }
    const lng = (b[0][0] + b[1][0]) / 2;
    const lat = (b[0][1] + b[1][1]) / 2;
    const ctrl = new AbortController();
    setDireccion({ estado: 'cargando', texto: '' });
    fetch(`https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}&language=es&limit=1&access_token=${MAPBOX_TOKEN}`,
      { signal: ctrl.signal })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => {
        const f = d.features?.[0]?.properties;
        const texto = f?.full_address || f?.place_formatted || f?.name || '';
        setDireccion(texto ? { estado: 'ok', texto } : { estado: 'nd', texto: '' });
      })
      .catch((e) => { if (e.name !== 'AbortError') setDireccion({ estado: 'nd', texto: '' }); });
    return () => ctrl.abort();
  }, [geometria]);

  return (
    <div className="ubicacion-apoyo">
      <div><span className="muted">Ubicación indicada por el propietario:</span> {textoPropietario || '—'}</div>
      <div>
        <span className="muted">Dirección aproximada (Mapbox):</span>{' '}
        {direccion.estado === 'cargando' ? 'consultando…' : direccion.estado === 'ok' ? direccion.texto : 'no disponible'}
      </div>
    </div>
  );
}
