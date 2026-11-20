const pool = require('../src/config/db');
const { api, tokens, limpiar, crearTerreno, auth, cerrar } = require('./helpers');

afterAll(cerrar);

// Cuadrado de 100 m x 100 m en WGS84 / UTM 17S, dentro del terreno de prueba de helpers.js (Piura).
const VERTICES = [
  { este: 544330, norte: 9425215, distancia_plano: 100 },
  { este: 544430, norte: 9425215, distancia_plano: 100 },
  { este: 544430, norte: 9425315, distancia_plano: 100 },
  { este: 544330, norte: 9425315, distancia_plano: 100 },
];
const BASE = { datum: 'WGS84', zona_utm: 17, vertices: VERTICES, area_declarada: 10000, perimetro_declarado: 400 };

describe('Levantamiento topográfico (POST /api/terrenos/:id/levantamiento)', () => {
  let t;
  beforeAll(async () => { t = await tokens(); });
  // Cada terreno nuevo se desplaza al este: se limpia antes de cada prueba para que el terreno quede bajo las coordenadas UTM de VERTICES.
  beforeEach(limpiar);

  const registrar = (id, body, token = t.tecnica) =>
    api().post(`/api/terrenos/${id}/levantamiento`).set(auth(token)).send(body);

  test('mide en UTM, verifica contra el plano y el detalle lo devuelve con el contorno en WGS84', async () => {
    const { id } = await crearTerreno(t.tecnica);
    const r = await registrar(id, { ...BASE, fecha_levantamiento: '2026-10-14', ingeniero: ' Ing. Prueba ', cip: '12345', observaciones: 'Plano firmado' });
    expect(r.status).toBe(201);
    expect(r.body.avisos).toEqual([]);
    expect(r.body.registro).toMatchObject({
      datum: 'WGS84', zona_utm: 17, epsg: 32717, area_utm: 10000, perimetro_utm: 400, ingeniero: 'Ing. Prueba', cip: '12345',
      registrado_por_nombre: 'Usuario tecnica',
    });
    expect(r.body.registro.area_geodesica).toBeGreaterThan(9900);
    expect(r.body.registro.verificacion.area).toMatchObject({ declarada: 10000, calculada: 10000, diferencia: 0, diferencia_pct: 0, dentro: true });
    expect(r.body.registro.verificacion.lados).toHaveLength(4);
    expect(r.body.registro.verificacion.lados[3]).toMatchObject({ lado: 'V4–V1', calculada: 100, coincide: true });
    expect(r.body.registro.verificacion.dentro_tolerancia).toBe(true);

    const d = (await api().get(`/api/terrenos/${id}`).set(auth(t.gerencia))).body.levantamiento;
    expect(d.geometria.type).toBe('Polygon');
    expect(d.geometria.coordinates[0]).toHaveLength(5);
    expect(d.geometria.coordinates[0][0][0]).toBeCloseTo(-80.5997, 3);
  });

  test('detecta cuando el área declarada difiere más que la tolerancia', async () => {
    const { id } = await crearTerreno(t.tecnica);
    const r = await registrar(id, { ...BASE, area_declarada: 10100, tolerancia_pct: 0.5 });
    expect(r.status).toBe(201);
    expect(r.body.registro.verificacion.area).toMatchObject({ diferencia: -100, dentro: false });
    expect(r.body.registro.verificacion.dentro_tolerancia).toBe(false);
  });

  test('una distancia de lado distinta a la calculada se marca como no coincidente', async () => {
    const { id } = await crearTerreno(t.tecnica);
    const v = VERTICES.map((p, i) => (i === 1 ? { ...p, distancia_plano: 100.5 } : p));
    const r = await registrar(id, { ...BASE, vertices: v });
    expect(r.body.registro.verificacion.lados[1]).toMatchObject({ declarada: 100.5, calculada: 100, diferencia: -0.5, coincide: false });
  });

  test('declarados, distancias, fecha, ingeniero y CIP son opcionales; sin lo declarado no hay veredicto', async () => {
    const { id } = await crearTerreno(t.tecnica);
    const r = await registrar(id, { zona_utm: 17, vertices: VERTICES.map(({ este, norte }) => ({ este, norte })) });
    expect(r.status).toBe(201);
    expect(r.body.registro).toMatchObject({ datum: 'WGS84', area_declarada: null, ingeniero: null, tolerancia_pct: 0.5 });
    expect(r.body.registro.verificacion.area.dentro).toBeNull();
    expect(r.body.registro.verificacion.dentro_tolerancia).toBeNull();
  });

  test('acepta el anillo cerrado (último vértice igual al primero) y números como texto', async () => {
    const { id } = await crearTerreno(t.tecnica);
    const cerrado = [...VERTICES, VERTICES[0]].map((p) => ({ este: String(p.este), norte: String(p.norte) }));
    const r = await registrar(id, { ...BASE, vertices: cerrado, area_declarada: undefined, perimetro_declarado: undefined });
    expect(r.status).toBe(201);
    expect(r.body.registro.vertices).toHaveLength(4);
  });

  test('con PSAD56 la misma coordenada cae en otro lugar: avisa del desplazamiento respecto del dibujo', async () => {
    const { id } = await crearTerreno(t.tecnica);
    const r = await registrar(id, { ...BASE, datum: 'PSAD56' });
    expect(r.status).toBe(201);
    expect(r.body.registro.epsg).toBe(24877);
    expect(r.body.registro.desplazamiento_m).toBeGreaterThan(150);
    expect(r.body.avisos[0]).toMatch(/datum y la zona UTM/);
  });

  test('una zona equivocada deja el levantamiento a cientos de km del terreno: 400', async () => {
    const { id } = await crearTerreno(t.tecnica);
    const r = await registrar(id, { ...BASE, zona_utm: 18 });
    expect(r.status).toBe(400);
    expect(r.body.campo).toBe('zona_utm');
    expect(r.body.error).toMatch(/datum y la zona UTM/);
  });

  test('lados que se cruzan (vértices en desorden): 400', async () => {
    const { id } = await crearTerreno(t.tecnica);
    const lazo = [VERTICES[0], VERTICES[2], VERTICES[1], VERTICES[3]];
    const r = await registrar(id, { ...BASE, vertices: lazo });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/se cruzan/);
  });

  test.each([
    ['datum desconocido', { datum: 'NAD27' }],
    ['zona fuera de Perú', { zona_utm: 20 }],
    ['sin vértices', { vertices: undefined }],
    ['menos de 3 vértices', { vertices: VERTICES.slice(0, 2) }],
    ['vértice sin Norte', { vertices: [...VERTICES.slice(0, 3), { este: 544330 }] }],
    ['coordenada fuera del rango UTM', { vertices: [...VERTICES.slice(0, 3), { este: 5443300, norte: 9425315 }] }],
    ['vértices consecutivos iguales', { vertices: [VERTICES[0], VERTICES[0], VERTICES[1], VERTICES[2]] }],
    ['vértices colineales (sin área)', { vertices: [{ este: 544330, norte: 9425215 }, { este: 544380, norte: 9425215 }, { este: 544430, norte: 9425215 }] }],
    ['más de 200 vértices', { vertices: Array.from({ length: 201 }, (_, i) => ({ este: 544330 + i, norte: 9425215 + (i % 2) })) }],
    ['distancia de lado negativa', { vertices: [{ ...VERTICES[0], distancia_plano: -1 }, ...VERTICES.slice(1)] }],
    ['área declarada en cero', { area_declarada: 0 }],
    ['tolerancia fuera de rango', { tolerancia_pct: 101 }],
    ['fecha con formato inválido', { fecha_levantamiento: '14/10/2026' }],
    ['fecha futura', { fecha_levantamiento: '2999-01-01' }],
    ['ingeniero demasiado largo', { ingeniero: 'x'.repeat(201) }],
    ['observaciones demasiado largas', { observaciones: 'x'.repeat(1001) }],
  ])('rechaza con 400: %s', async (_n, extra) => {
    const { id } = await crearTerreno(t.tecnica);
    expect((await registrar(id, { ...BASE, ...extra })).status).toBe(400);
  });

  test('solo el Área Técnica puede registrarlo; exige sesión; valida el terreno', async () => {
    const { id } = await crearTerreno(t.tecnica);
    expect((await registrar(id, BASE, t.legal)).status).toBe(403);
    expect((await registrar(id, BASE, t.gerencia)).status).toBe(403);
    expect((await api().post(`/api/terrenos/${id}/levantamiento`).send(BASE)).status).toBe(401);
    expect((await registrar('abc', BASE)).status).toBe(400);
    expect((await registrar(99999, BASE)).status).toBe(404);
  });

  test('una nueva versión reemplaza a la anterior en el detalle', async () => {
    const { id } = await crearTerreno(t.tecnica);
    await registrar(id, { ...BASE, area_declarada: 9000 });
    await registrar(id, BASE);
    const d = (await api().get(`/api/terrenos/${id}`).set(auth(t.gerencia))).body.levantamiento;
    expect(d.area_declarada).toBe(10000);
  });

  test('sin levantamiento el detalle trae null', async () => {
    const { id } = await crearTerreno(t.tecnica);
    expect((await api().get(`/api/terrenos/${id}`).set(auth(t.gerencia))).body.levantamiento).toBeNull();
  });

  test('un terreno con decisión registrada ya no admite levantamientos (409)', async () => {
    const { id } = await crearTerreno(t.tecnica);
    await pool.query(`UPDATE terrenos_candidatos SET estado = 'descartado' WHERE id_terreno = $1`, [id]);
    expect((await registrar(id, BASE)).status).toBe(409);
  });
});
