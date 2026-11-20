const { api, OFERTA, limpiar, cerrar } = require('./helpers');

afterAll(cerrar);
beforeEach(limpiar);

const original = global.fetch;
const entorno = process.env.OFERTAS_SOLO_PREDIOS;
afterEach(() => {
  global.fetch = original;
  jest.restoreAllMocks();
  if (entorno === undefined) delete process.env.OFERTAS_SOLO_PREDIOS; else process.env.OFERTAS_SOLO_PREDIOS = entorno;
});

// Lote urbano de ~110 m x 110 m cerca de Piura (anillo horario, como lo entrega ArcGIS).
const ANILLO = [[-80.6, -5.2], [-80.6, -5.199], [-80.599, -5.199], [-80.599, -5.2], [-80.6, -5.2]];
const servicio = () => {
  global.fetch = jest.fn(async (url) => ({
    ok: true,
    status: 200,
    json: async () => ({
      features: String(url).includes('/2/query')
        ? [{ attributes: { NRO_MZNA: 'B', NRO_LOTE: '7', AREA_GRAFI: '12100' }, geometry: { rings: [ANILLO] } }]
        : [],
    }),
  }));
};
// Lo mismo que hace el formulario: hace clic en el mapa y recibe el predio con su sello.
const elegirPredio = async () => {
  servicio();
  const r = await api().get('/api/catastro/predio').query({ lng: '-80.5995', lat: '-5.1995' });
  expect(r.status).toBe(200);
  return r.body.predio;
};
const { poligono: _ignorado, ...SIN_POLIGONO } = OFERTA;

describe('Oferta con un predio elegido del catastro (sello del servidor)', () => {
  test('el contorno entregado por el catastro, con su sello, se registra (201)', async () => {
    const p = await elegirPredio();
    const r = await api().post('/api/ofertas').send({ ...SIN_POLIGONO, poligono: p.poligono, predio_sello: p.sello });
    expect(r.status).toBe(201);
    expect(r.body.area).toBeGreaterThan(12000);
  });

  test('un contorno modificado con el mismo sello se rechaza', async () => {
    const p = await elegirPredio();
    const movido = p.poligono.coordinates.map((a) => a.map(([x, y]) => [x + 0.0002, y]));
    const r = await api().post('/api/ofertas').send({ ...SIN_POLIGONO, poligono: { type: 'Polygon', coordinates: movido }, predio_sello: p.sello });
    expect(r.status).toBe(400);
    expect(r.body.campo).toBe('poligono');
    expect(r.body.error).toMatch(/no es válido o venció/);
  });

  test.each(['', 'abc', `123.${'a'.repeat(64)}`, 42, {}])('un sello falso (%p) se rechaza', async (sello) => {
    const p = await elegirPredio();
    const r = await api().post('/api/ofertas').send({ ...SIN_POLIGONO, poligono: p.poligono, predio_sello: sello });
    expect(r.status).toBe(400);
  });

  test('un sello vencido se rechaza', async () => {
    const p = await elegirPredio();
    const ahora = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(ahora + 3 * 60 * 60 * 1000);   // pasan 3 h (el límite es 2 h)
    const r = await api().post('/api/ofertas').send({ ...SIN_POLIGONO, poligono: p.poligono, predio_sello: p.sello });
    expect(r.status).toBe(400);
  });

  test('el sello de un predio no sirve para otro', async () => {
    const p = await elegirPredio();
    const otro = { type: 'Polygon', coordinates: [[[-80.5, -5.2], [-80.499, -5.2], [-80.499, -5.199], [-80.5, -5.199], [-80.5, -5.2]]] };
    const r = await api().post('/api/ofertas').send({ ...SIN_POLIGONO, poligono: otro, predio_sello: p.sello });
    expect(r.status).toBe(400);
  });

  test('con OFERTAS_SOLO_PREDIOS=true un polígono sin sello se rechaza, y con sello se acepta', async () => {
    process.env.OFERTAS_SOLO_PREDIOS = 'true';
    const libre = await api().post('/api/ofertas').send(OFERTA);
    expect(libre.status).toBe(400);
    expect(libre.body.error).toMatch(/Elija su lote/);
    const p = await elegirPredio();
    const r = await api().post('/api/ofertas').send({ ...SIN_POLIGONO, poligono: p.poligono, predio_sello: p.sello });
    expect(r.status).toBe(201);
  });

  test('por defecto (también en producción) se admite un terreno dibujado a mano, sin sello', async () => {
    const nodeEnv = process.env.NODE_ENV;
    delete process.env.OFERTAS_SOLO_PREDIOS;
    process.env.NODE_ENV = 'production';
    try {
      expect((await api().post('/api/ofertas').send(OFERTA)).status).toBe(201);
    } finally { process.env.NODE_ENV = nodeEnv; }
  });

  test('el lote elegido sigue pasando por las reglas del servidor (R4: no se registra dos veces)', async () => {
    const p = await elegirPredio();
    const cuerpo = { ...SIN_POLIGONO, poligono: p.poligono, predio_sello: p.sello };
    expect((await api().post('/api/ofertas').send(cuerpo)).status).toBe(201);
    const otra = await api().post('/api/ofertas').send(cuerpo);
    expect(otra.status).toBe(400);
    expect(otra.body.errores?.[0]?.regla).toBe('R4');
  });
});
