# Geovisor de Adquisición de Terrenos — Prototipo 1

## Arranque
1. `docker compose up -d` (PostgreSQL + PostGIS en el puerto host **5433**, para no chocar con un Postgres local en 5432; aplica `database/schema.sql` en el primer arranque)
2. Backend: `cd backend && cp .env.example .env && yarn && yarn seed && yarn dev`
3. Frontend: `cd frontend && cp .env.example .env` (pon tu token en `VITE_MAPBOX_TOKEN`) `&& yarn && yarn dev` → http://localhost:5173

Usuarios de prueba (clave `leones123`): `tecnica@`, `legal@`, `administrativa@`, `gerencia@` + `leones.test`.

## Contenido del inicio y transiciones de sesión
- Las secciones de terrenos, presentación de Leones, proyectos y preguntas frecuentes mantienen la paleta amarillo, blanco, negro y naranja. La sección de dudas tiene fondo negro, la imagen `LeonConstructor1.png` y respuestas animadas. La frase final se muestra centrada antes de los contactos del pie de página.
- Editar `frontend/src/data/inicio.js` para actualizar los contactos, las redes sociales y las fichas reales de proyectos. Mientras no haya fichas, los proyectos muestran una presentación general con una imagen referencial.
- El GIF original `frontend/src/assets/leon.gif` aparece al iniciar y cerrar sesión en todos los roles. Con la preferencia de menos movimiento se muestra el logo estático. Los fallos de acceso cierran la pantalla de carga y permiten reintentar.
- Los mapas, polígonos, zonas restringidas y marcadores conservan sus colores anteriores, independientes de la paleta de la web.

## Cargar criterios (solo API, sin UI)
Login (`POST /api/auth/login`) → token `Bearer`, luego:
- POST /api/terrenos/1/criterios-tecnicos `{"distancia_via_principal":150,"compatibilidad_normativa":true}` (rol tecnica)
- POST /api/terrenos/1/situacion-legal `{"ruta_legal":"partida registral","estado_tramite":"en curso"}` (rol legal)
- POST /api/terrenos/1/informacion-financiera `{"precio_ofertado":250000,"costos_adquisicion":10000}` (rol administrativa)

Al registrarse el tercero, el puntaje se calcula solo. La fórmula está documentada en
`backend/src/services/viabilidadService.js`.

## Mapa (Mapbox)
- Token **público** de Mapbox en `frontend/.env` → `VITE_MAPBOX_TOKEN=pk...` (ver `frontend/.env.example`). `.env` está en `.gitignore`; no lo subas.
  Sin token, el formulario y el panel muestran un aviso en lugar del mapa y el formulario no permite enviar.
- Formulario público → paso 2 "Ubicación": dibuja **un** polígono (doble clic para cerrarlo). Se edita arrastrando vértices;
  "Borrar y redibujar" lo reinicia. El área mostrada (turf) es informativa; el servidor calcula la oficial con `ST_Area(geography)`
  y rechaza polígonos inválidos (`ST_IsValid`) con 400.
- Panel interno: polígonos + pines coloreados por puntaje (verde: alta ≥ 70, ámbar: media 40–69, rojo: baja < 40, gris: sin puntaje).

## Migración de BD existente
`database/migrations/001_geometria_polygon.sql` (geometria POINT → Polygon). En una BD nueva basta `schema.sql`.
Tras migrar, `yarn seed` completa los polígonos de los terrenos de ejemplo.

Lugares cercanos: aplicar `database/migrations/002_puntos_interes.sql` en BD existentes (en BD nueva basta `schema.sql`). Variables `OVERPASS_*` en `backend/.env.example`.
