// Categorías de lugares cercanos. Para ampliar, agregar un objeto a CATEGORIAS:
//   clave: identificador guardado en puntos_interes.categoria
//   etiqueta: nombre mostrado en la interfaz
//   tags: etiquetas OSM que debe cumplir el elemento ({ etiqueta: [valores válidos] })
//   linea: true si el lugar es una vía (se guarda su punto más cercano al terreno)
const CATEGORIAS = [
  { clave: 'via_principal', etiqueta: 'Vía principal', tags: { highway: ['trunk', 'primary', 'secondary'] }, linea: true },
  { clave: 'colegio', etiqueta: 'Colegios', tags: { amenity: ['school'] } },
  { clave: 'universidad', etiqueta: 'Universidades', tags: { amenity: ['university', 'college'] } },
];

const CATEGORIA_VIA = 'via_principal';
const DIAS_CACHE = 7;
const LIMITE_POR_CATEGORIA = 10;
const FUENTE = 'Datos de OpenStreetMap';

const entero = (v, def) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : def);

// Se leen en cada llamada para que respondan a la variable de entorno vigente.
const opciones = () => ({
  url: process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter',
  urlAlt: process.env.OVERPASS_URL_ALT || '',
  userAgent: process.env.OVERPASS_USER_AGENT || 'GeovisorLeones/1.0 (proyecto de tesis, Universidad Continental)',
  radio: entero(process.env.OVERPASS_RADIO_M, 2000),
  timeoutMs: entero(process.env.OVERPASS_TIMEOUT_MS, 10000),
  reintentos: process.env.OVERPASS_REINTENTOS ? Math.max(0, Math.floor(Number(process.env.OVERPASS_REINTENTOS)) || 0) : 2,
  esperaMs: entero(process.env.OVERPASS_REINTENTO_ESPERA_MS, 1000),
});

module.exports = { CATEGORIAS, CATEGORIA_VIA, DIAS_CACHE, LIMITE_POR_CATEGORIA, FUENTE, opciones };
