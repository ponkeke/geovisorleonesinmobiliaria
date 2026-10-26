const pool = require('../src/config/db');
const { api, tokens, limpiar, crearTerreno, auth, cerrar } = require('./helpers');

afterAll(cerrar);

const BASE = { distancia_via_principal: 120, compatibilidad_normativa: true };

describe('Criterio técnico ampliado (acceso, servicios, visita)', () => {
  let t;
  beforeAll(async () => { await limpiar(); t = await tokens(); });

  const registrar = (id, body, token = t.tecnica) =>
    api().post(`/api/terrenos/${id}/criterios-tecnicos`).set(auth(token)).send(body);

  test('guarda acceso, servicios, fecha de visita y observaciones, y el detalle los devuelve con quién los registró', async () => {
    const { id } = await crearTerreno(t.tecnica);
    const r = await registrar(id, {
      ...BASE, tipo_via_acceso: 'avenida', nombre_via_acceso: ' Av. Mariscal Castilla ', superficie_via: 'asfaltada',
      servicios: { agua: true, luz: true, gas: false }, fecha_visita: '2026-10-20', observaciones: 'Terreno plano, sin cercos.',
    });
    expect(r.status).toBe(201);

    const d = (await api().get(`/api/terrenos/${id}`).set(auth(t.gerencia))).body.criterios_tecnicos;
    expect(d).toMatchObject({
      tipo_via_acceso: 'avenida', nombre_via_acceso: 'Av. Mariscal Castilla', superficie_via: 'asfaltada',
      servicio_agua: true, servicio_desague: false, servicio_luz: true, servicio_internet: false, servicio_gas: false,
      observaciones: 'Terreno plano, sin cercos.', registrado_por_nombre: 'Usuario tecnica',
    });
    expect(String(d.fecha_visita)).toContain('2026-10-20');
  });

  test('los campos nuevos son opcionales: el registro mínimo anterior sigue funcionando', async () => {
    const { id } = await crearTerreno(t.tecnica);
    expect((await registrar(id, BASE)).status).toBe(201);
    const d = (await api().get(`/api/terrenos/${id}`).set(auth(t.gerencia))).body.criterios_tecnicos;
    expect(d).toMatchObject({ tipo_via_acceso: null, nombre_via_acceso: null, superficie_via: null, observaciones: null,
      fecha_visita: null, servicio_agua: false, servicio_gas: false });
  });

  test.each([
    ['tipo de vía desconocido', { tipo_via_acceso: 'autopista' }],
    ['superficie desconocida', { superficie_via: 'adoquín' }],
    ['fecha con formato inválido', { fecha_visita: '20/10/2026' }],
    ['fecha imposible', { fecha_visita: '2026-02-31' }],
    ['fecha futura', { fecha_visita: '2999-01-01' }],
    ['observaciones demasiado largas', { observaciones: 'x'.repeat(1001) }],
  ])('rechaza con 400: %s', async (_n, extra) => {
    const { id } = await crearTerreno(t.tecnica);
    expect((await registrar(id, { ...BASE, ...extra })).status).toBe(400);
  });

  test('solo el Área Técnica puede registrarlo', async () => {
    const { id } = await crearTerreno(t.tecnica);
    expect((await registrar(id, BASE, t.legal)).status).toBe(403);
  });
});

describe('GET /api/terrenos/:id/acceso (vía que da frente al terreno)', () => {
  let t;
  beforeAll(async () => { await limpiar(); t = await tokens(); });
  const acceso = (id, token = t.tecnica) => api().get(`/api/terrenos/${id}/acceso`).set(auth(token));

  test('exige sesión y valida el id', async () => {
    expect((await api().get('/api/terrenos/1/acceso')).status).toBe(401);
    expect((await acceso('abc')).status).toBe(400);
    expect((await acceso(99999)).status).toBe(404);
  });

  test('sin vías cercanas guardadas: via es null', async () => {
    const { id } = await crearTerreno(t.tecnica);
    const r = await acceso(id);
    expect(r.status).toBe(200);
    expect(r.body.via).toBeNull();
  });

  test('sugiere tipo, nombre y superficie de la vía más cercana (con su tramo)', async () => {
    const { id } = await crearTerreno(t.tecnica);
    // Calle al sur del terreno (el polígono llega hasta lat -5.2), a ~11 m de su borde.
    await pool.query(
      `INSERT INTO vias_osm (id_osm, highway, nombre, superficie, geometria)
       VALUES ('way/1','secondary','Av. Grau','asphalt', ST_GeomFromText('LINESTRING(-80.601 -5.2001, -80.598 -5.2001)', 4326)),
              ('way/2','residential','Calle Lejana','dirt', ST_GeomFromText('LINESTRING(-80.601 -5.2020, -80.598 -5.2020)', 4326))`);
    const { body } = await acceso(id);
    expect(body.via).toMatchObject({ highway: 'secondary', tipo: 'avenida', nombre: 'Av. Grau', superficie: 'asfaltada' });
    expect(body.via.distancia_m).toBeGreaterThan(5);
    expect(body.via.distancia_m).toBeLessThan(20);
    expect(body.via.trazo.type).toMatch(/LineString/);
  });

  test('una vía a más de 50 m no cuenta como acceso', async () => {
    await limpiar();
    const { id } = await crearTerreno(t.tecnica);
    await pool.query(
      `INSERT INTO vias_osm (id_osm, highway, nombre, geometria)
       VALUES ('way/3','residential','Calle Lejana', ST_GeomFromText('LINESTRING(-80.601 -5.2020, -80.598 -5.2020)', 4326))`);
    expect((await acceso(id)).body.via).toBeNull();
  });
});
