import { defineConfig } from 'cypress';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Las tareas de Node usan las dependencias del backend (pg, dotenv) para preparar y limpiar datos de prueba.
const aqui = path.dirname(fileURLToPath(import.meta.url));
const requireBackend = createRequire(path.join(aqui, '../backend/package.json'));

// PNG de 1x1 píxel (válido): sirve como "foto de la visita" sin necesitar archivos en el repositorio.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',          // dirección de la aplicación evaluada (frontend con Vite)
    specPattern: 'cypress/e2e/**/*.cy.js',
    supportFile: 'cypress/support/e2e.js',
    video: true,
    screenshotOnRunFailure: true,
    viewportWidth: 1366,
    viewportHeight: 800,
    defaultCommandTimeout: 10000,
    setupNodeEvents(on) {
      on('task', {
        // Borra SOLO lo creado por las pruebas: ofertas cuyo propietario empieza por "Cypress ".
        async limpiarDatosCypress() {
          requireBackend('dotenv').config({ path: path.join(aqui, '../backend/.env') });
          const { Client } = requireBackend('pg');
          const db = new Client({ connectionString: process.env.DATABASE_URL });
          await db.connect();
          try {
            await db.query('BEGIN');
            const { rows } = await db.query(
              `SELECT o.id_oferta, t.id_terreno FROM ofertas_terreno o
               LEFT JOIN terrenos_candidatos t ON t.id_oferta = o.id_oferta
               WHERE o.nombre_propietario LIKE 'Cypress %'`);
            const ofertas = rows.map((r) => r.id_oferta);
            const terrenos = rows.map((r) => r.id_terreno).filter(Boolean);
            if (terrenos.length) {
              for (const tabla of ['criterios_tecnicos', 'situaciones_legales', 'informacion_financiera', 'puntajes_viabilidad',
                'decisiones_adquisicion', 'archivos_tecnicos', 'levantamientos_topograficos']) {
                await db.query(`DELETE FROM ${tabla} WHERE id_terreno = ANY($1)`, [terrenos]);
              }
              await db.query('DELETE FROM terrenos_candidatos WHERE id_terreno = ANY($1)', [terrenos]);
            }
            if (ofertas.length) await db.query('DELETE FROM ofertas_terreno WHERE id_oferta = ANY($1)', [ofertas]);
            await db.query('COMMIT');
            return { ofertas: ofertas.length, terrenos: terrenos.length };
          } catch (e) {
            await db.query('ROLLBACK');
            throw e;
          } finally {
            await db.end();
          }
        },

        // Sube una foto mínima a un terreno (el cuerpo es el archivo en bruto, como hace el frontend).
        async subirFotoPrueba({ token, idTerreno, nombre }) {
          const r = await fetch(`http://localhost:4000/api/terrenos/${idTerreno}/archivos`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream', 'X-Nombre-Archivo': encodeURIComponent(nombre) },
            body: PNG_1X1,
          });
          if (r.status !== 201) throw new Error(`No se pudo subir la foto: HTTP ${r.status}`);
          return (await r.json()).archivo;
        },
      });
    },
  },
});
