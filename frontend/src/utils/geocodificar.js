import { MAPBOX_TOKEN } from '../components/mapConfig.js';

const BASE = 'https://api.mapbox.com/search/geocode/v6/reverse';

// Texto de un resultado v6: dirección completa, o "nombre, lugar" si no la trae.
const textoDe = (feature) => {
  const p = feature?.properties;
  if (!p) return '';
  return p.full_address || [p.name, p.place_formatted].filter(Boolean).join(', ');
};

async function consultar([lng, lat], types, signal) {
  const url = `${BASE}?longitude=${lng}&latitude=${lat}&types=${types}&language=es&country=pe&access_token=${MAPBOX_TOKEN}`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`Mapbox ${r.status}`);
  return textoDe((await r.json()).features?.[0]);
}

// Dirección aproximada de un punto [lng, lat] (Geocoding API v6, reverse). Prefiere dirección/calle y,
// si no hay, barrio o distrito. Devuelve '' si no hay resultado; lanza si la consulta falla.
export async function direccionDesde(punto, signal) {
  const calle = await consultar(punto, 'address,street', signal);
  if (calle) return calle;
  return consultar(punto, 'neighborhood,locality,district', signal);
}

// Centro del polígono: promedio de sus vértices sin el de cierre (mismo cálculo que @turf/centroid).
export function centroide(geometry) {
  const anillo = geometry.coordinates[0].slice(0, -1);
  const suma = anillo.reduce(([x, y], [lng, lat]) => [x + lng, y + lat], [0, 0]);
  return [suma[0] / anillo.length, suma[1] / anillo.length];
}
