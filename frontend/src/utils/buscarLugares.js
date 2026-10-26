import { MAPBOX_TOKEN, HUANCAYO } from '../components/mapConfig.js';

// Search Box API de Mapbox: `suggest` mientras se escribe y `retrieve` al elegir una opción.
// Ambas llamadas de una búsqueda comparten `sessionToken` (Mapbox las factura como una sola sesión).
const BASE = 'https://api.mapbox.com/search/searchbox/v1';
const TIPOS = 'poi,address,street,neighborhood,locality,place,district';

export const crearSesion = () => crypto.randomUUID();

async function pedir(url, signal) {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`Mapbox ${r.status}`);
  return r.json();
}

// Hasta 6 sugerencias: [{ id, nombre, detalle, tipo }], priorizando lo cercano a Huancayo.
export async function sugerir(texto, { sessionToken, signal, proximity = HUANCAYO }) {
  const params = new URLSearchParams({
    q: texto, access_token: MAPBOX_TOKEN, session_token: sessionToken, language: 'es', country: 'pe',
    limit: '6', proximity: proximity.join(','), types: TIPOS,
  });
  const data = await pedir(`${BASE}/suggest?${params}`, signal);
  return (data.suggestions || []).map((s) => ({
    id: s.mapbox_id,
    nombre: s.name,
    detalle: s.place_formatted || s.full_address || '',
    tipo: s.feature_type,
  }));
}

// Ubicación de una sugerencia: { centro: [lng, lat], bbox: [oeste, sur, este, norte] | null }.
export async function recuperar(id, { sessionToken, signal }) {
  const params = new URLSearchParams({ access_token: MAPBOX_TOKEN, session_token: sessionToken });
  const data = await pedir(`${BASE}/retrieve/${encodeURIComponent(id)}?${params}`, signal);
  const f = data.features?.[0];
  const centro = f?.geometry?.coordinates;
  if (!Array.isArray(centro)) throw new Error('Sin coordenadas');
  return { centro, bbox: f.properties?.bbox || f.bbox || null };
}
