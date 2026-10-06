// Crea 4 usuarios internos (uno por rol) y 2 ofertas de ejemplo con polígono. Idempotente.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

const PASSWORD = 'leones123'; // solo para pruebas
const USUARIOS = [
  ['Ana Técnica', 'tecnica@leones.test', 'tecnica'],
  ['Luis Legal', 'legal@leones.test', 'legal'],
  ['Carla Administrativa', 'administrativa@leones.test', 'administrativa'],
  ['Gerardo Gerencia', 'gerencia@leones.test', 'gerencia'],
];

// Rectángulo GeoJSON centrado en [lng, lat], de ~ancho x alto metros.
function rect([lng, lat], ancho, alto) {
  const dx = ancho / 2 / (111320 * Math.cos((lat * Math.PI) / 180));
  const dy = alto / 2 / 110540;
  return {
    type: 'Polygon',
    coordinates: [[
      [lng - dx, lat - dy], [lng + dx, lat - dy], [lng + dx, lat + dy], [lng - dx, lat + dy], [lng - dx, lat - dy],
    ]],
  };
}

const EJEMPLOS = [
  { nombre: 'María Pérez', contacto: '999111222', ubicacion: 'Av. Los Olivos km 4, Piura', precio: 250000,
    descripcion: 'Terreno plano, esquina.', poligono: rect([-80.6328, -5.1945], 40, 20) },
  { nombre: 'Jorge Ramos', contacto: 'jorge@mail.com', ubicacion: 'Sector La Campiña, Chiclayo', precio: 600000,
    descripcion: 'Cerca de la carretera.', poligono: rect([-79.8400, -6.7714], 50, 20) },
];

const GEOM = 'ST_SetSRID(ST_GeomFromGeoJSON($1::text), 4326)';

(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10);
  for (const [nombre, correo, rol] of USUARIOS) {
    await pool.query(
      `INSERT INTO usuarios (nombre, correo, rol, password_hash) VALUES ($1,$2,$3,$4)
       ON CONFLICT (correo) DO NOTHING`, [nombre, correo, rol, hash]);
  }
  for (const e of EJEMPLOS) {
    const gj = JSON.stringify(e.poligono);
    const { rows: [existente] } = await pool.query(
      `SELECT o.id_oferta, t.id_terreno FROM ofertas_terreno o
         JOIN terrenos_candidatos t USING (id_oferta)
        WHERE o.nombre_propietario = $1 AND o.ubicacion_referencial = $2`, [e.nombre, e.ubicacion]);
    if (existente) {
      // Completa el polígono en terrenos sembrados antes de la migración (geometría NULL).
      await pool.query(
        `UPDATE terrenos_candidatos SET geometria = ${GEOM}, area = ROUND(ST_Area(${GEOM}::geography)::numeric, 2)
          WHERE id_terreno = $2 AND geometria IS NULL`, [gj, existente.id_terreno]);
      await pool.query(
        `UPDATE ofertas_terreno SET area_referencial = (SELECT area FROM terrenos_candidatos WHERE id_terreno = $1)
          WHERE id_oferta = $2`, [existente.id_terreno, existente.id_oferta]);
      continue;
    }
    const { rows: [area] } = await pool.query(
      `SELECT ROUND(ST_Area(${GEOM}::geography)::numeric, 2) AS area`, [gj]);
    const { rows: [o] } = await pool.query(
      `INSERT INTO ofertas_terreno (nombre_propietario, contacto, ubicacion_referencial, precio_ofertado, area_referencial, descripcion)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id_oferta`,
      [e.nombre, e.contacto, e.ubicacion, e.precio, area.area, e.descripcion]);
    await pool.query(
      `INSERT INTO terrenos_candidatos (id_oferta, geometria, area) VALUES ($1, ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326), $3)`,
      [o.id_oferta, gj, area.area]);
  }
  console.log(`Seed listo. Usuarios: <rol>@leones.test / ${PASSWORD}`);
  await pool.end();
})().catch((err) => { console.error(err); process.exit(1); });
