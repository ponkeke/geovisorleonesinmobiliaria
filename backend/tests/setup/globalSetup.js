// Prepara la BD de pruebas: la crea si no existe, aplica database/schema.sql y deja los 4 usuarios.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

module.exports = async () => {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('Falta DATABASE_URL_TEST');
  if (url === process.env.DATABASE_URL) throw new Error('DATABASE_URL_TEST no puede ser igual a DATABASE_URL');

  const dbName = new URL(url).pathname.slice(1);
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (!rowCount) await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, '')}"`);
  await admin.end();

  const db = new Client({ connectionString: url });
  await db.connect();
  const { rows: [{ existe }] } = await db.query("SELECT to_regclass('public.usuarios') IS NOT NULL AS existe");
  if (!existe) {
    await db.query(fs.readFileSync(path.join(__dirname, '../../../database/schema.sql'), 'utf8'));
  }
  const { rows: [{ hay_puntos }] } = await db.query("SELECT to_regclass('public.puntos_interes') IS NOT NULL AS hay_puntos");
  if (!hay_puntos) {
    await db.query(fs.readFileSync(path.join(__dirname, '../../../database/migrations/002_puntos_interes.sql'), 'utf8'));
  }
  const { rows: [{ hay_vias }] } = await db.query("SELECT to_regclass('public.vias_osm') IS NOT NULL AS hay_vias");
  if (!hay_vias) {
    await db.query(fs.readFileSync(path.join(__dirname, '../../../database/migrations/003_vias_osm.sql'), 'utf8'));
  }
  await db.query(`TRUNCATE vias_osm, puntos_interes, decisiones_adquisicion, puntajes_viabilidad, informacion_financiera,
    situaciones_legales, criterios_tecnicos, terrenos_candidatos, ofertas_terreno, usuarios RESTART IDENTITY CASCADE`);
  const hash = await bcrypt.hash('leones123', 4);
  for (const rol of ['tecnica', 'legal', 'administrativa', 'gerencia']) {
    await db.query('INSERT INTO usuarios (nombre, correo, rol, password_hash) VALUES ($1,$2,$3,$4)',
      [`Usuario ${rol}`, `${rol}@leones.test`, rol, hash]);
  }
  await db.end();
};
