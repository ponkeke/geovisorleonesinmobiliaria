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
  const { rows: [{ hay_trazo }] } = await db.query(
    "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'puntos_interes' AND column_name = 'trazo') AS hay_trazo");
  if (!hay_trazo) {
    await db.query(fs.readFileSync(path.join(__dirname, '../../../database/migrations/004_puntos_interes_trazo.sql'), 'utf8'));
  }
  const { rows: [{ hay_area }] } = await db.query(
    "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'puntos_interes' AND column_name = 'area') AS hay_area");
  if (!hay_area) {
    await db.query(fs.readFileSync(path.join(__dirname, '../../../database/migrations/005_puntos_interes_area.sql'), 'utf8'));
  }
  const { rows: [{ hay_vias }] } = await db.query("SELECT to_regclass('public.vias_osm') IS NOT NULL AS hay_vias");
  if (!hay_vias) {
    await db.query(fs.readFileSync(path.join(__dirname, '../../../database/migrations/003_vias_osm.sql'), 'utf8'));
  }
  const { rows: [{ hay_detalle }] } = await db.query(
    "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'criterios_tecnicos' AND column_name = 'observaciones') AS hay_detalle");
  if (!hay_detalle) {
    await db.query(fs.readFileSync(path.join(__dirname, '../../../database/migrations/006_criterios_tecnicos_detalle.sql'), 'utf8'));
  }
  const { rows: [{ hay_archivos }] } = await db.query("SELECT to_regclass('public.archivos_tecnicos') IS NOT NULL AS hay_archivos");
  if (!hay_archivos) {
    await db.query(fs.readFileSync(path.join(__dirname, '../../../database/migrations/007_archivos_tecnicos.sql'), 'utf8'));
  }
  const { rows: [{ hay_legal }] } = await db.query(
    "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'situaciones_legales' AND column_name = 'numero_partida') AS hay_legal");
  if (!hay_legal) {
    await db.query(fs.readFileSync(path.join(__dirname, '../../../database/migrations/008_situacion_legal_detalle.sql'), 'utf8'));
  }
  const { rows: [{ hay_fin }] } = await db.query(
    "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'informacion_financiera' AND column_name = 'costo_notaria') AS hay_fin");
  if (!hay_fin) {
    await db.query(fs.readFileSync(path.join(__dirname, '../../../database/migrations/009_informacion_financiera_detalle.sql'), 'utf8'));
  }
  await db.query(`TRUNCATE archivos_tecnicos, vias_osm, puntos_interes, decisiones_adquisicion, puntajes_viabilidad, informacion_financiera,
    situaciones_legales, criterios_tecnicos, terrenos_candidatos, ofertas_terreno, usuarios RESTART IDENTITY CASCADE`);
  const hash = await bcrypt.hash('leones123', 4);
  for (const rol of ['tecnica', 'legal', 'administrativa', 'gerencia']) {
    await db.query('INSERT INTO usuarios (nombre, correo, rol, password_hash) VALUES ($1,$2,$3,$4)',
      [`Usuario ${rol}`, `${rol}@leones.test`, rol, hash]);
  }
  await db.end();
};
