const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/config/db');

const ROLES = ['tecnica', 'legal', 'administrativa', 'gerencia'];
const PASSWORD = 'leones123';

// Cuadrado de ~110 m x 110 m.
const POLIGONO = {
  type: 'Polygon',
  coordinates: [[[-80.6, -5.2], [-80.599, -5.2], [-80.599, -5.199], [-80.6, -5.199], [-80.6, -5.2]]],
};

const OFERTA = {
  nombre_propietario: 'María Prueba', contacto: '999111222', ubicacion_referencial: 'Piura',
  precio_ofertado: 150000, descripcion: 'Terreno de prueba', poligono: POLIGONO,
};

const api = () => request(app);

async function tokens() {
  const out = {};
  for (const rol of ROLES) {
    const r = await api().post('/api/auth/login').send({ correo: `${rol}@leones.test`, password: PASSWORD });
    out[rol] = r.body.token;
  }
  return out;
}

// Vacía todo menos los usuarios.
// Cada terreno nuevo se desplaza al este (la regla R4 rechaza terrenos superpuestos); el primero tras limpiar() queda en POLIGONO.
let creados = 0;
const desplazar = (poligono, n) => ({
  ...poligono,
  coordinates: poligono.coordinates.map((anillo) => anillo.map(([lng, lat]) => [lng + n * 0.0015, lat])),
});

const limpiar = () => (creados = 0, pool.query(`TRUNCATE vias_osm, puntos_interes, decisiones_adquisicion, puntajes_viabilidad, informacion_financiera,
  situaciones_legales, criterios_tecnicos, terrenos_candidatos, ofertas_terreno RESTART IDENTITY CASCADE`));

// Crea una oferta válida y devuelve { id (id_terreno), area }.
async function crearTerreno(token, extra = {}) {
  const r = await api().post('/api/ofertas').send({ ...OFERTA, poligono: desplazar(POLIGONO, creados++), ...extra });
  if (r.status !== 201) throw new Error(`No se pudo crear la oferta: ${r.status} ${JSON.stringify(r.body)}`);
  const lista = await api().get('/api/terrenos').set('Authorization', `Bearer ${token}`);
  const terreno = lista.body.find((t) => t.id_terreno === Math.max(...lista.body.map((x) => x.id_terreno)));
  return { id: terreno.id_terreno, area: r.body.area };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

// Registra los 3 criterios (cada uno con su rol). Devuelve la respuesta del tercero (con el puntaje).
async function completarCriterios(id, t, { tecnico, legal, financiero }) {
  await api().post(`/api/terrenos/${id}/criterios-tecnicos`).set(auth(t.tecnica)).send(tecnico);
  await api().post(`/api/terrenos/${id}/situacion-legal`).set(auth(t.legal)).send(legal);
  return api().post(`/api/terrenos/${id}/informacion-financiera`).set(auth(t.administrativa)).send(financiero);
}

const cerrar = () => pool.end();

// Polígono de prueba nuevo (no se superpone con los anteriores desde el último limpiar()).
const poligonoNuevo = () => desplazar(POLIGONO, creados++);

module.exports = { poligonoNuevo, api, ROLES, PASSWORD, POLIGONO, OFERTA, tokens, limpiar, crearTerreno, completarCriterios, auth, cerrar };
