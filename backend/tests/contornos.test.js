const { api, tokens, limpiar, crearTerreno, cerrar } = require('./helpers');
const limitadores = require('../src/middlewares/limitadores');

afterAll(cerrar);
beforeEach(async () => { await limpiar(); limitadores.contornos.reset(); });

describe('GET /api/poligonos/registrados (público)', () => {
  test('sin terrenos devuelve una colección vacía', async () => {
    const r = await api().get('/api/poligonos/registrados');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ type: 'FeatureCollection', features: [] });
  });

  test('devuelve solo la geometría de cada terreno, sin datos de la oferta ni ids', async () => {
    const t = await tokens();
    await crearTerreno(t.tecnica);
    await crearTerreno(t.tecnica);
    const r = await api().get('/api/poligonos/registrados');
    expect(r.status).toBe(200);
    expect(r.body.features).toHaveLength(2);
    for (const f of r.body.features) {
      expect(f.geometry.type).toBe('Polygon');
      expect(f.properties).toEqual({});
    }
    expect(JSON.stringify(r.body)).not.toMatch(/María|999111222|precio|nombre/i);
  });
});
