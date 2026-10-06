const pool = require('../src/config/db');
const limitadores = require('../src/middlewares/limitadores');
const { api, OFERTA, POLIGONO, limpiar, cerrar } = require('./helpers');

afterAll(cerrar);

// Cuadrado de `lado` metros con esquina suroeste en (lng, lat).
const cuadrado = (lng, lat, ladoX, ladoY = ladoX) => {
  const dx = ladoX / (111320 * Math.cos((lat * Math.PI) / 180));
  const dy = ladoY / 110540;
  return { type: 'Polygon', coordinates: [[[lng, lat], [lng + dx, lat], [lng + dx, lat + dy], [lng, lat + dy], [lng, lat]]] };
};
const M_LNG = 1 / (111320 * Math.cos((5.2 * Math.PI) / 180));   // grados de longitud por metro a 5.2° S

const validar = (poligono) => api().post('/api/poligonos/validar').send({ poligono });
const reglas = (r) => r.body.errores.map((e) => e.regla);

const ok = (elements) => ({ ok: true, status: 200, json: async () => ({ elements }) });
const via = (id, highway, coords) => ({ type: 'way', id, tags: { highway, name: `Via ${id}` }, geometry: coords.map(([lon, lat]) => ({ lat, lon })) });
// POLIGONO: lng -80.6..-80.599, lat -5.2..-5.199 (~110 m).
const NS_CENTRO = via(1, 'primary', [[-80.5995, -5.21], [-80.5995, -5.19]]);
const EO_CENTRO = via(2, 'primary', [[-80.61, -5.1995], [-80.59, -5.1995]]);

beforeEach(async () => { await limpiar(); limitadores.validarPoligono.reset(); });

describe('R1 · polígono lineal, diminuto o angosto', () => {
  test.each([
    ['2 puntos', { type: 'Polygon', coordinates: [[[-75.2, -12], [-75.199, -12], [-75.2, -12]]] }],
    ['3 vértices colineales', { type: 'Polygon', coordinates: [[[-75.2, -12], [-75.199, -12], [-75.198, -12], [-75.2, -12]]] }],
    ['diagonal colineal', { type: 'Polygon', coordinates: [[[-75.2, -12], [-75.199, -11.999], [-75.198, -11.998], [-75.2, -12]]] }],
  ])('%s: rechazado', async (_n, poligono) => {
    const r = await validar(poligono);
    expect(r.status).toBe(200);
    expect(r.body.valido).toBe(false);
    expect(reglas(r)).toEqual(['R1']);
    expect(r.body.geometriaProblema).toBeTruthy();
  });

  test('10 m²: demasiado pequeño', async () => {
    const r = await validar(cuadrado(-75.2, -12, 3.2));
    expect(r.body.valido).toBe(false);
    expect(r.body.errores[0]).toMatchObject({ regla: 'R1' });
    expect(r.body.errores[0].mensaje).toMatch(/demasiado pequeño/);
  });

  test('franja de 2 m de ancho: demasiado angosto aunque el área supere el mínimo', async () => {
    const r = await validar(cuadrado(-75.2, -12, 100, 2));      // 200 m²
    expect(r.body.valido).toBe(false);
    expect(r.body.errores[0].mensaje).toMatch(/demasiado angosto/);
  });

  test('un lote normal es válido', async () => {
    const r = await validar(cuadrado(-75.2, -12, 20, 30));
    expect(r.body).toMatchObject({ valido: true, errores: [], avisos: [] });
  });

  test('los umbrales salen de la configuración', async () => {
    process.env.MIN_AREA_M2 = '1000';
    try {
      const r = await validar(cuadrado(-75.2, -12, 20, 30));    // 600 m²
      expect(r.body.valido).toBe(false);
      expect(r.body.errores[0].mensaje).toMatch(/mínimo es 1000 m²/);
    } finally { delete process.env.MIN_AREA_M2; }
  });
});

describe('R2 · auto-intersección', () => {
  test('lazo cruzado: mensaje claro y punto del defecto', async () => {
    const lazo = { type: 'Polygon', coordinates: [[[-75.2, -12], [-75.199, -11.999], [-75.199, -12], [-75.2, -11.999], [-75.2, -12]]] };
    const r = await validar(lazo);
    expect(reglas(r)).toEqual(['R2']);
    expect(r.body.errores[0].mensaje).toMatch(/se cruzan/);
    expect(r.body.geometriaProblema.type).toBe('Point');
  });
});

describe('Estructura, tamaño y límite de uso del endpoint público', () => {
  test('no es un polígono: 400', async () => {
    expect((await validar({ type: 'Point', coordinates: [0, 0] })).status).toBe(400);
    expect((await api().post('/api/poligonos/validar').send({})).status).toBe(400);
  });

  test('demasiados vértices: 400', async () => {
    const anillo = Array.from({ length: 600 }, (_, i) => [-75.2 + i * 1e-6, -12 + (i % 2) * 1e-6]);
    const r = await validar({ type: 'Polygon', coordinates: [[...anillo, anillo[0]]] });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/demasiados vértices/);
  });

  test('payload mayor que VALIDAR_MAX_BYTES: 413', async () => {
    const r = await validar({ type: 'Polygon', coordinates: [[[0, 0]]], relleno: 'x'.repeat(60000) });
    expect(r.status).toBe(413);
  });

  test('rate limit por IP: 429 al superar VALIDAR_RATE_MAX', async () => {
    process.env.VALIDAR_RATE_MAX = '3';
    try {
      const poligono = cuadrado(-75.2, -12, 20, 30);
      for (let i = 0; i < 3; i++) expect((await validar(poligono)).status).toBe(200);
      const r = await validar(poligono);
      expect(r.status).toBe(429);
      expect(r.headers['retry-after']).toBeDefined();
    } finally { process.env.VALIDAR_RATE_MAX = '100000'; limitadores.validarPoligono.reset(); }
  });
});

describe('R3 · superposición con vías de OpenStreetMap (Overpass simulado)', () => {
  let fetchMock;
  beforeEach(() => {
    process.env.VALIDAR_VIAS = 'true';
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(ok([]));
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { process.env.VALIDAR_VIAS = 'false'; jest.restoreAllMocks(); });

  test('una avenida que cruza el centro del terreno: rechazado, con la zona problemática', async () => {
    fetchMock.mockResolvedValue(ok([NS_CENTRO, EO_CENTRO]));
    const r = await validar(POLIGONO);
    expect(r.body.valido).toBe(false);
    expect(reglas(r)).toEqual(['R3']);
    expect(r.body.errores[0].mensaje).toMatch(/invade una vía/);
    expect(['Polygon', 'MultiPolygon']).toContain(r.body.geometriaProblema.type);
  });

  test('terreno que solo toca la calle de frente: aceptado', async () => {
    // Eje de la avenida (12 m de franja) a 6.5 m del borde este: la franja no entra al lote.
    const x = -80.599 + 6.5 * M_LNG;
    fetchMock.mockResolvedValue(ok([via(3, 'primary', [[x, -5.21], [x, -5.19]])]));
    const r = await validar(POLIGONO);
    expect(r.body).toMatchObject({ valido: true, errores: [], avisos: [] });
  });

  test('una invasión leve (< VIA_SUPERPOSICION_MAX_PCT) se tolera', async () => {
    const x = -80.599 + 3 * M_LNG;                // la franja entra 3 m en un lote de 110 m: ~2.7 %
    fetchMock.mockResolvedValue(ok([via(4, 'primary', [[x, -5.21], [x, -5.19]])]));
    expect((await validar(POLIGONO)).body.valido).toBe(true);
  });

  test('senderos (footway) no cuentan como vía', async () => {
    fetchMock.mockResolvedValue(ok([via(5, 'footway', [[-80.5995, -5.21], [-80.5995, -5.19]])]));
    expect((await validar(POLIGONO)).body.valido).toBe(true);
  });

  test('el ancho de franja por tipo es configurable', async () => {
    fetchMock.mockResolvedValue(ok([NS_CENTRO, EO_CENTRO]));
    process.env.VIAS_ANCHOS_M = 'primary:1';
    try { expect((await validar(POLIGONO)).body.valido).toBe(true); } finally { delete process.env.VIAS_ANCHOS_M; }
  });

  test('las vías quedan en caché: la segunda validación no llama a Overpass', async () => {
    fetchMock.mockResolvedValue(ok([NS_CENTRO, EO_CENTRO]));
    await validar(POLIGONO);
    await validar(POLIGONO);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { rows: [{ n }] } = await pool.query('SELECT count(*)::int AS n FROM vias_osm');
    expect(n).toBe(2);
  });

  test('Overpass caído: se acepta con aviso y se registra en el log', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    const r = await validar(POLIGONO);
    expect(r.status).toBe(200);
    expect(r.body.valido).toBe(true);
    expect(r.body.avisos).toEqual(['No se pudo verificar si el terreno invade alguna vía.']);
    expect(console.error.mock.calls.some((c) => String(c[0]).includes('Validación de vías omitida'))).toBe(true);
  });

  test('zona sin datos de vías: se acepta con aviso', async () => {
    fetchMock.mockResolvedValue(ok([]));
    const r = await validar(POLIGONO);
    expect(r.body.valido).toBe(true);
    expect(r.body.avisos).toHaveLength(1);
  });

  test('POST /api/ofertas con Overpass caído: 201 con aviso', async () => {
    fetchMock.mockRejectedValue(new Error('caído'));
    const r = await api().post('/api/ofertas').send(OFERTA);
    expect(r.status).toBe(201);
    expect(r.body.avisos).toHaveLength(1);
  });

  test('POST /api/ofertas sobre una avenida: 400 con las reglas incumplidas', async () => {
    fetchMock.mockResolvedValue(ok([NS_CENTRO, EO_CENTRO]));
    const r = await api().post('/api/ofertas').send(OFERTA);
    expect(r.status).toBe(400);
    expect(r.body.campo).toBe('poligono');
    expect(r.body.errores[0].regla).toBe('R3');
    const { rows: [{ n }] } = await pool.query('SELECT count(*)::int AS n FROM ofertas_terreno');
    expect(n).toBe(0);
  });
});

describe('R4 · superposición con otro terreno registrado', () => {
  beforeEach(async () => {
    expect((await api().post('/api/ofertas').send(OFERTA)).status).toBe(201);   // terreno existente = POLIGONO
  });

  test('mismo polígono: rechazado', async () => {
    const r = await validar(POLIGONO);
    expect(reglas(r)).toEqual(['R4']);
    expect(r.body.errores[0].mensaje).toBe('Este terreno se superpone con otro ya registrado.');
    expect(r.body.geometriaProblema).toBeTruthy();
  });

  test('queda completamente dentro de otro terreno: rechazado', async () => {
    expect(reglas(await validar(cuadrado(-80.5997, -5.1997, 30)))).toEqual(['R4']);
  });

  test('contiene por completo a otro terreno más pequeño: rechazado', async () => {
    const grande = cuadrado(-80.601, -5.201, 400);
    expect(reglas(await validar(grande))).toEqual(['R4']);
  });

  test('superposición del 50 %: rechazado', async () => {
    expect(reglas(await validar(cuadrado(-80.5995, -5.2, 110)))).toEqual(['R4']);
  });

  test('superposición leve (< TRASLAPE_MAX_PCT): aceptado', async () => {
    // Desplazado 100 m al este: solapa ~9 %.
    expect((await validar(cuadrado(-80.599 - 10 * M_LNG, -5.2, 110))).body.valido).toBe(true);
  });

  test('terreno colindante (solo comparte el borde): aceptado', async () => {
    expect((await validar(cuadrado(-80.599, -5.2, 110))).body.valido).toBe(true);
  });

  test('POST /api/ofertas con un terreno superpuesto: 400 y no se guarda', async () => {
    const r = await api().post('/api/ofertas').send(OFERTA);
    expect(r.status).toBe(400);
    expect(r.body.campo).toBe('poligono');
    expect(r.body.error).toBe('Este terreno se superpone con otro ya registrado.');
    const { rows: [{ n }] } = await pool.query('SELECT count(*)::int AS n FROM terrenos_candidatos');
    expect(n).toBe(1);
  });
});

describe('POST /api/ofertas aplica R1 en el servidor', () => {
  test('polígono de 10 m²: 400 con regla R1', async () => {
    const r = await api().post('/api/ofertas').send({ ...OFERTA, poligono: cuadrado(-75.2, -12, 3.2) });
    expect(r.status).toBe(400);
    expect(r.body.campo).toBe('poligono');
    expect(r.body.errores[0].regla).toBe('R1');
  });
});
