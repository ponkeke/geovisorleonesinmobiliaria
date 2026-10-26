const { CATEGORIAS, opciones } = require('../config/lugares');

const regex = (valores) => `^(${valores.join('|')})$`;

// Caja delimitadora del polígono ampliada `radio` metros por cada lado: [sur, oeste, norte, este].
function cajaConRadio({ sur, oeste, norte, este }, radio) {
  const dLat = radio / 110540;
  const dLon = radio / (111320 * Math.cos(((sur + norte) / 2) * Math.PI / 180));
  return [sur - dLat, oeste - dLon, norte + dLat, este + dLon];
}

// Consulta Overpass QL sobre la caja (bbox) del polígono + radio. Lugares puntuales con `out center`;
// vías y parques con `out geom` (trazo / contorno). PostGIS recorta luego a la distancia real.
function construirConsulta(caja, categorias = CATEGORIAS) {
  const bbox = `(${caja.map((n) => Number(n.toFixed(6))).join(',')})`;
  const filtros = (c) => Object.entries(c.tags)
    .map(([k, v]) => `["${k}"~"${regex(v)}"]`).join('');
  const stmt = (c, tipo) => `${tipo}${filtros(c)}${bbox};`;
  const puntos = categorias.filter((c) => !c.linea && !c.area).map((c) => stmt(c, 'nwr')).join('');
  const lineas = categorias.filter((c) => c.linea).map((c) => stmt(c, 'way')).join('');
  // Zonas: los ways con su contorno; nodos y relaciones solo con su centro (no se arman multipolígonos).
  const zonas = categorias.filter((c) => c.area);
  const zonasWay = zonas.map((c) => stmt(c, 'way')).join('');
  const zonasOtros = zonas.map((c) => stmt(c, 'node') + stmt(c, 'relation')).join('');
  return `[out:json][timeout:25];`
    + (puntos ? `(${puntos})->.p;.p out center tags;` : '')
    + (lineas ? `(${lineas})->.l;.l out geom tags;` : '')
    + (zonasWay ? `(${zonasWay})->.z;.z out geom tags;` : '')
    + (zonasOtros ? `(${zonasOtros})->.o;.o out center tags;` : '');
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const reintentable = (status) => status === 429 || status >= 500;

const cuerpoError = async (res) => {
  try { return (await res.text()).replace(/\s+/g, ' ').trim().slice(0, 500); } catch { return ''; }
};

// POST a un servidor Overpass con timeout y reintentos (red, timeout, 429 y 5xx; un 4xx no se reintenta).
async function consultarEn(url, consulta, { timeoutMs, reintentos, esperaMs, userAgent }) {
  let ultimo;
  for (let intento = 0; intento <= reintentos; intento++) {
    if (intento > 0) await esperar(esperaMs * intento);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': userAgent, Accept: '*/*' },
        body: new URLSearchParams({ data: consulta }).toString(),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) {
        const json = await res.json();
        if (!Array.isArray(json?.elements)) throw new Error('Respuesta de Overpass inválida');
        return json.elements;
      }
      const cuerpo = await cuerpoError(res);
      console.error(`Overpass ${url} respondió HTTP ${res.status}: ${cuerpo}`);
      ultimo = new Error(`Overpass respondió ${res.status}`);
      if (!reintentable(res.status)) break;
    } catch (e) {
      console.error(`Overpass ${url} falló: ${e.message}`);
      ultimo = e;
    }
  }
  throw ultimo;
}

// Servidor principal; si falla, el espejo (OVERPASS_URL_ALT) si está configurado.
async function consultar(consulta) {
  const o = opciones();
  try {
    return await consultarEn(o.url, consulta, o);
  } catch (e) {
    if (!o.urlAlt || o.urlAlt === o.url) throw e;
    console.error(`Overpass: usando espejo ${o.urlAlt}`);
    return consultarEn(o.urlAlt, consulta, o);
  }
}

// Convierte un elemento de Overpass en { id_osm, categoria, nombre, geom } o null si no aplica.
function normalizar(el, categorias = CATEGORIAS) {
  const tags = el.tags || {};
  const cat = categorias.find((c) => Object.entries(c.tags).every(([k, v]) => v.includes(tags[k])));
  if (!cat) return null;
  const nombre = (tags.name || tags.ref || '').slice(0, 200) || null;
  if (!nombre) return null;                       // los lugares sin nombre no se muestran
  let geom = null;
  if (cat.linea && Array.isArray(el.geometry) && el.geometry.length >= 2) {
    geom = { type: 'LineString', coordinates: el.geometry.map((p) => [p.lon, p.lat]) };
  } else if (cat.area && el.type === 'way') {
    const anillo = Array.isArray(el.geometry) ? el.geometry.map((p) => [p.lon, p.lat]) : [];
    const [a, b] = [anillo[0], anillo[anillo.length - 1]];
    if (anillo.length >= 4 && a[0] === b[0] && a[1] === b[1]) geom = { type: 'Polygon', coordinates: [anillo] };
  } else {
    const p = el.type === 'node' ? el : el.center;
    if (p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) geom = { type: 'Point', coordinates: [p.lon, p.lat] };
  }
  if (!geom) return null;
  return {
    id_osm: `${el.type}/${el.id}`,
    categoria: cat.clave,
    nombre,
    geom,
  };
}

async function buscar(cajaTerreno, radio) {
  const elementos = await consultar(construirConsulta(cajaConRadio(cajaTerreno, radio)));
  return elementos.map((e) => normalizar(e)).filter(Boolean);
}

// Vías (ways con etiqueta highway de los tipos dados) dentro de la caja [sur, oeste, norte, este].
// Devuelve [{ id_osm, highway, nombre, geom: LineString }].
async function buscarVias(caja, tipos) {
  const bbox = caja.map((n) => Number(n.toFixed(6))).join(',');
  const consulta = `[out:json][timeout:25];way["highway"~"^(${tipos.join('|')})$"](${bbox});out geom tags;`;
  const elementos = await consultar(consulta);
  return elementos
    .filter((e) => e.type === 'way' && Array.isArray(e.geometry) && e.geometry.length >= 2 && e.tags?.highway)
    .map((e) => ({
      id_osm: `way/${e.id}`,
      highway: e.tags.highway,
      nombre: (e.tags.name || e.tags.ref || '').slice(0, 200) || null,
      superficie: (e.tags.surface || '').slice(0, 30) || null,
      geom: { type: 'LineString', coordinates: e.geometry.map((p) => [p.lon, p.lat]) },
    }));
}

module.exports = { buscar, buscarVias, cajaConRadio, construirConsulta, consultar, normalizar };
