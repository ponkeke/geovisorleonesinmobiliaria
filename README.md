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
- Formulario público → paso 2 "Ubicación": **no se dibuja ningún polígono**. El oferente ve los predios del catastro (lotes urbanos de COFOPRI en naranja desde el zoom 15; predios rurales de Junín de MIDAGRI en violeta desde el zoom 13), hace **clic** sobre el suyo y ese predio pasa a ser el terreno de la oferta ("Cambiar lote" lo reemplaza). El área mostrada (turf) es informativa; el servidor calcula la oficial con `ST_Area(geography)` y aplica las reglas R1-R4 (p. ej. R4: el mismo lote no se registra dos veces).
  - `GET /api/catastro/predio?lng=&lat=` (público, con límite de uso): devuelve el predio bajo el clic con su contorno (Polygon GeoJSON), etiqueta, área y un **sello**; nunca incluye el adjudicatario. Un predio de varias partes responde 422.
  - **Sello:** el servidor firma (HMAC con `SELLO_SECRETO` o, si falta, `JWT_SECRET`) el contorno que entrega; `POST /api/ofertas` exige `predio_sello` junto a `poligono` y rechaza con 400 un contorno modificado, inventado o con el sello vencido (`SELLO_MINUTOS`, 120 por defecto). Así nadie puede registrar un terreno que no sea un predio real del catastro llamando a la API directamente.
  - `OFERTAS_SOLO_PREDIOS=true|false`: por defecto es **true en producción** (`NODE_ENV=production`) y false en desarrollo/pruebas, donde se acepta además un polígono sin sello (lo usan las pruebas y los datos de ejemplo).
  - El servidor de MIDAGRI no envía su certificado intermedio y Node lo rechazaba: se incluye el intermedio público (`backend/src/config/certs/thawte-tls-rsa-ca-g1.pem`, vence el 2-nov-2027) solo para ese servicio, con la verificación activa. Una prueba avisa cuando venza.

- Panel interno: polígonos + pines coloreados por puntaje (verde: alta ≥ 70, ámbar: media 40–69, rojo: baja < 40, gris: sin puntaje).

## Migración de BD existente
`database/migrations/001_geometria_polygon.sql` (geometria POINT → Polygon). En una BD nueva basta `schema.sql`.
Tras migrar, `yarn seed` completa los polígonos de los terrenos de ejemplo.

Lugares cercanos: aplicar `database/migrations/002_puntos_interes.sql` en BD existentes (en BD nueva basta `schema.sql`). Variables `OVERPASS_*` en `backend/.env.example`.

## Levantamiento topográfico (Área Técnica)
Para que las medidas coincidan con el plano del ingeniero, el Área Técnica registra sus vértices UTM en el detalle del terreno → **Levantamiento topográfico**
(`POST /api/terrenos/:id/levantamiento`, rol `tecnica`). No reemplaza el dibujo del propietario: se guarda aparte (`levantamientos_topograficos`) y se compara con él.
- **Datos**: datum (`WGS84` o `PSAD56`), zona UTM sur (17, 18 o 19), vértices `{ este, norte, distancia_plano? }` en el orden del plano, área y perímetro declarados, tolerancia (por defecto 0,5 %), fecha, ingeniero y CIP. En el formulario se pueden pegar desde Excel.
- **Cálculo**: el área y el perímetro se miden en la proyección UTM del plano (como los calcula el ingeniero); el contorno se convierte a WGS84 para el mapa. Se compara lo declarado con lo calculado (área, perímetro y cada lado).
- **Controles**: rechaza lados que se cruzan, vértices repetidos o colineales, y coordenadas que caen a más de 1 km del terreno ubicado en el mapa (datum o zona equivocados); avisa si quedan a más de 150 m.
- **BD existente**: aplicar `database/migrations/010_levantamiento_topografico.sql` (en BD nueva basta `schema.sql`).

## Capa catastral de referencia (COFOPRI urbano y MIDAGRI rural)
- Botón **Catastro** junto a Calle / Satélite / Relieve (mapa del panel y del formulario público): dibuja **en vivo** los lotes (naranja, desde zoom 15) y los sectores (rojo, desde zoom 10) de COFOPRI de todo el país, incluido Junín (≈ 112 000 lotes). No se guardan datos en la aplicación: cada tesela se pide al servicio público `Integracion/Int_IDE_COFOPRI_PSAD56` (`https://geo.serfor.gob.pe/geoservicios/rest/services/Integracion/Int_IDE_COFOPRI_PSAD56/MapServer`, capas `LOTES_PSAD56` y `PUEBLOS_PSAD56`) con un estilo propio de solo contornos.
- **Datos del catastro en el panel:** con la capa activa y zoom ≥ 13, un clic en el mapa interno (panel) muestra, en la **columna derecha** (como el detalle de un terreno), **todo lo que publica el catastro**: del lote (manzana, lote, área gráfica e inscrita con aviso si difieren > 5 %, uso, colindancia, tipo de predio, edificación, fecha de transferencia, fuente, CUC, ID, plano, ubigeo), de la manzana, del sector (distrito, total de lotes, posesión, formalización…) y las calles a ≤ 25 m. Si el punto no cae en un lote urbano, muestra el predio rural de Junín (código, hoja, área, perímetro, origen, datum, observación…) y las comunidades campesina o nativa que lo contienen (MIDAGRI). Se omiten los datos que el servicio trae vacíos. Los códigos (UL010, CT002…) no tienen leyenda pública. La consulta pasa por el backend (`GET /api/catastro/lote?lng=&lat=`, exige sesión); una chincheta marca el punto.
- **Adjudicatario (dato personal):** solo lo reciben los roles **Técnica, Legal y Gerencia** (y COFOPRI no publica nombres: el campo `ADJUDICATA` solo trae un indicador 0/1, que se muestra aparte); para los demás el campo no se pide al servicio ni se envía. No va en ningún archivo de la aplicación ni en el formulario público. Cada consulta con adjudicatario deja una línea en el registro del servidor (usuario y rol, sin el nombre). Los valores sin letras («-», «.») se tratan como «sin dato».
- **Posición:** los datos están en PSAD56 y, ya en WGS84, caen ≈ 11 m al oeste de las calles de OpenStreetMap (base de Mapbox). Se aplica a cada petición un desfase promedio (+11,5 m este, −1 m norte; `DESFASE_CATASTRO_M` en `frontend/src/components/catastroCapa.js`), medido en BASE (Huancayo), Jauja y Tarma. Error esperado ≈ ±4 m en esas ciudades; **no está verificado en otras zonas**. Si se cambia, igualar `CATASTRO_DESFASE_ESTE_M` / `CATASTRO_DESFASE_NORTE_M` del backend.
- **Predios rurales de Junín (violeta, desde zoom 13):** el mismo botón dibuja también los predios de MIDAGRI (`servicios_ogc/Catastro_Rural`, capa 0 `Predio Rural`, ≈ 128 500 en Junín, filtro `id_dist LIKE '12%'`; `https://georural.midagri.gob.pe/geoservicios/rest/services/servicios_ogc/Catastro_Rural/MapServer`). Ese servicio ya está en WGS84, por eso **no** lleva el desfase de COFOPRI; no dibuja nada a escalas menores de 1:200 000 y a veces tarda varios segundos por tesela. Solo se ven contornos: no se consultan datos de los predios.
- Es solo **referencial**: no reemplaza a SUNARP ni al catastro municipal.
- Variables opcionales: backend `CATASTRO_URL`, `CATASTRO_RURAL_URL`, `CATASTRO_RURAL_TIMEOUT_MS`, `CATASTRO_TIMEOUT_MS`, `CATASTRO_DESFASE_ESTE_M`, `CATASTRO_DESFASE_NORTE_M`; frontend `VITE_CATASTRO_URL` y `VITE_CATASTRO_RURAL_URL`.
- Las capturas originales del visor están en `frontend/public/Catastro/` (no se usan en la app).
