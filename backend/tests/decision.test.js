const { api, tokens, limpiar, crearTerreno, completarCriterios, auth, cerrar } = require('./helpers');

afterAll(cerrar);

const CRITERIOS = {
  tecnico: { distancia_via_principal: 100, compatibilidad_normativa: true },
  legal: { ruta_legal: 'partida registral' },
  financiero: { precio_ofertado: 100000, costos_adquisicion: 0 },
};

describe('POST /api/terrenos/:id/decision', () => {
  let t;
  let id;
  beforeAll(async () => { await limpiar(); t = await tokens(); ({ id } = await crearTerreno(t.tecnica)); });

  const decidir = (token, body) =>
    api().post(`/api/terrenos/${id}/decision`).set(auth(token)).send(body);

  test('sin puntaje: 400', async () => {
    const r = await decidir(t.gerencia, { resultado: 'aprobado' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/viabilidad/);
  });

  test('con puntaje calculado se habilita la decisión', async () => {
    const r = await completarCriterios(id, t, CRITERIOS);
    expect(r.body.puntaje).toBeTruthy();
  });

  test.each(['tecnica', 'legal', 'administrativa'])('rol %s: 403', async (rol) => {
    expect((await decidir(t[rol], { resultado: 'aprobado' })).status).toBe(403);
  });

  test('resultado inválido: 400', async () => {
    expect((await decidir(t.gerencia, { resultado: 'rechazado' })).status).toBe(400);
  });

  test('gerencia, resultado válido: 201 y el terreno cambia de estado', async () => {
    const r = await decidir(t.gerencia, { resultado: 'descartado', observaciones: 'Precio alto' });
    expect(r.status).toBe(201);
    expect(r.body.resultado).toBe('descartado');
    const d = await api().get(`/api/terrenos/${id}`).set(auth(t.gerencia));
    expect(d.body.estado).toBe('descartado');
    expect(d.body.decision.observaciones).toBe('Precio alto');
  });

  test('segunda decisión sobre el mismo terreno: 409', async () => {
    expect((await decidir(t.gerencia, { resultado: 'aprobado' })).status).toBe(409);
  });

  test.each([
    ['criterios técnicos', 'tecnica', 'criterios-tecnicos', { distancia_via_principal: 5, compatibilidad_normativa: true }],
    ['situación legal', 'legal', 'situacion-legal', { ruta_legal: 'desmembramiento' }],
    ['información financiera', 'administrativa', 'informacion-financiera', { precio_ofertado: 1, costos_adquisicion: 0 }],
  ])('%s nuevos tras decidir: 409', async (_n, rol, ruta, body) => {
    const r = await api().post(`/api/terrenos/${id}/${ruta}`).set(auth(t[rol])).send(body);
    expect(r.status).toBe(409);
  });

  test('el puntaje no cambió tras los intentos rechazados', async () => {
    const d = await api().get(`/api/terrenos/${id}`).set(auth(t.gerencia));
    expect(d.body.criterios_tecnicos.distancia_via_principal).toBe(100);
  });
});
