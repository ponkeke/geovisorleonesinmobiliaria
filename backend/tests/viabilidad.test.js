const { api, tokens, limpiar, crearTerreno, completarCriterios, auth, cerrar } = require('./helpers');

afterAll(cerrar);

describe('Puntaje de viabilidad = 0.35·T + 0.35·L + 0.30·F', () => {
  let t;
  beforeAll(async () => { await limpiar(); t = await tokens(); });

  test('no se calcula hasta tener los 3 criterios', async () => {
    const { id } = await crearTerreno(t.tecnica);
    await api().post(`/api/terrenos/${id}/criterios-tecnicos`).set(auth(t.tecnica))
      .send({ distancia_via_principal: 100, compatibilidad_normativa: true });
    const r = await api().post(`/api/terrenos/${id}/calcular-viabilidad`).set(auth(t.gerencia));
    expect(r.status).toBe(400);
    const d = await api().get(`/api/terrenos/${id}`).set(auth(t.gerencia));
    expect(d.body.puntaje).toBeNull();
  });

  test.each([
    // [descripción, distancia, compatible, ruta, factor (precio/m² = factor·170), T, L, F]
    ['técnico y legal máximos, precio en referencia', 100, true, 'partida registral', 1.0, 100, 100, 100],
    ['técnico medio, desmembramiento, 1.5x referencia', 1050, true, 'desmembramiento', 1.5, 75, 60, 50],
    ['no compatible, prescripción, 2x referencia', 100, false, 'prescripción adquisitiva', 2.0, 50, 30, 0],
  ])('%s', async (_n, distancia, compatible, ruta, factor, T, L, F) => {
    const { id, area } = await crearTerreno(t.tecnica);
    const precio = Math.round(factor * 170 * area * 100) / 100;

    const r = await completarCriterios(id, t, {
      tecnico: { distancia_via_principal: distancia, compatibilidad_normativa: compatible },
      legal: { ruta_legal: ruta },
      financiero: { precio_ofertado: precio, costos_adquisicion: 0 },
    });
    expect(r.status).toBe(201);

    // Se calculó solo al registrar el tercero.
    const p = r.body.puntaje;
    expect(p).toBeTruthy();
    const d = p.detalle_criterios;
    expect(d.puntaje_tecnico).toBeCloseTo(T, 1);
    expect(d.puntaje_legal).toBeCloseTo(L, 1);
    expect(d.puntaje_financiero).toBeCloseTo(F, 1);
    expect(d.pesos).toEqual({ tecnico: 0.35, legal: 0.35, financiero: 0.3 });

    const esperado = 0.35 * T + 0.35 * L + 0.3 * F;
    expect(p.puntaje_total).toBeCloseTo(esperado, 1);

    // Visible en el detalle y en la lista.
    const det = await api().get(`/api/terrenos/${id}`).set(auth(t.gerencia));
    expect(det.body.puntaje.puntaje_total).toBeCloseTo(esperado, 1);
    const lista = await api().get('/api/terrenos').set(auth(t.gerencia));
    expect(lista.body.find((x) => x.id_terreno === id).puntaje_total).toBeCloseTo(esperado, 1);
  });

  test('la lista queda ordenada por puntaje de mayor a menor', async () => {
    const lista = await api().get('/api/terrenos').set(auth(t.gerencia));
    const puntajes = lista.body.map((x) => x.puntaje_total).filter((p) => p !== null);
    expect(puntajes.length).toBeGreaterThanOrEqual(3);
    expect(puntajes).toEqual([...puntajes].sort((a, b) => b - a));
  });

  test('los costos de adquisición suben el precio por m² usado en el puntaje', async () => {
    const { id, area } = await crearTerreno(t.tecnica);
    const r = await completarCriterios(id, t, {
      tecnico: { distancia_via_principal: 100, compatibilidad_normativa: true },
      legal: { ruta_legal: 'partida registral' },
      // precio en la referencia + costos que llevan el total a 1.5x -> F = 50
      financiero: { precio_ofertado: Math.round(170 * area * 100) / 100, costos_adquisicion: Math.round(0.5 * 170 * area * 100) / 100 },
    });
    expect(r.body.puntaje.detalle_criterios.puntaje_financiero).toBeCloseTo(50, 1);
  });
});
