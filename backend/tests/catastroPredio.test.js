const { api, cerrar } = require('./helpers');

afterAll(cerrar);

// El catastro rural está desactivado por defecto; estas pruebas lo activan.
process.env.CATASTRO_RURAL = 'true';

const original = global.fetch;
afterAll(() => { global.fetch = original; });

// Predio elegible por el oferente (público): contorno del lote urbano o del predio rural bajo un clic.
const CW = [[-75.2320, -12.0580], [-75.2320, -12.0575], [-75.2315, -12.0575], [-75.2315, -12.0580], [-75.2320, -12.0580]];   // horario (ArcGIS)
const RURAL = { cod_predio: '8_5608775_558576', area_ha: 0.5 };

const resp = (feature) => ({ ok: true, status: 200, json: async () => ({ features: feature ? [feature] : [] }) });
const fallo = { ok: false, status: 500, json: async () => ({}) };

// urbano/rural: elemento ArcGIS { attributes, geometry } | null | 'falla' | 'cuelga' (nunca responde)
function simularPredio({ urbano, rural } = {}) {
  global.fetch = jest.fn((url) => {
    const u = String(url);
    const dato = u.includes('/2/query') ? urbano : u.includes('/0/query') ? rural : undefined;
    if (dato === undefined) throw new Error(`URL inesperada ${u}`);
    if (dato === 'cuelga') return new Promise(() => {});
    if (dato === 'falla') return Promise.resolve(fallo);
    return Promise.resolve(resp(dato));
  });
}
const urbanoOk = { attributes: { NRO_MZNA: 'A', NRO_LOTE: 'A1', AREA_GRAFI: '232,63311188', ADJUDICATA: 'JUAN PEREZ' }, geometry: { rings: [CW] } };
const ruralOk = { attributes: RURAL, geometry: { rings: [CW] } };
const pedir = (lng = '-75.23175', lat = '-12.05775') => api().get('/api/catastro/predio').query({ lng, lat });
const firmada = (anillo) => anillo.reduce((a, [x1, y1], i) => {
  const [x2, y2] = anillo[(i + 1) % anillo.length];
  return a + (x1 * y2 - x2 * y1);
}, 0) / 2;

describe('Catastro: predio elegible (público, con contorno)', () => {
  test('no exige sesión y entrega el contorno del lote urbano, desplazado como la capa, sin datos personales', async () => {
    simularPredio({ urbano: urbanoOk, rural: 'cuelga' });
    const r = await pedir();
    expect(r.status).toBe(200);
    const p = r.body.predio;
    expect(p).toMatchObject({ fuente: 'urbano', etiqueta: 'Mz. A · Lote A1', area_m2: 232.6 });
    expect(p.poligono.type).toBe('Polygon');
    // el contorno se mueve al este como la capa dibujada (11,5 m) y 1 m al sur
    const xs = p.poligono.coordinates[0].map((c) => c[0]);
    expect(Math.min(...xs) - -75.2320).toBeCloseTo(11.5 / (111320 * Math.cos((12.0578 * Math.PI) / 180)), 5);
    expect(p.poligono.coordinates[0][0]).toEqual(p.poligono.coordinates[0].at(-1));
    expect(typeof p.sello).toBe('string');
    expect(JSON.stringify(r.body)).not.toMatch(/PEREZ|adjudicatario/i);
    const url = new URL(global.fetch.mock.calls.find(([u]) => String(u).includes('/2/query'))[0]);
    expect(url.searchParams.get('returnGeometry')).toBe('true');
    expect(url.searchParams.get('outFields')).not.toMatch(/ADJUDICATA/);
  });

  test('el contorno sale en sentido antihorario (GeoJSON)', async () => {
    simularPredio({ urbano: urbanoOk, rural: 'cuelga' });
    const r = await pedir();
    expect(firmada(r.body.predio.poligono.coordinates[0])).toBeGreaterThan(0);
  });

  test('si no hay lote urbano usa el predio rural de Junín, sin desfase y con el filtro de ubigeo', async () => {
    simularPredio({ urbano: null, rural: ruralOk });
    const r = await pedir();
    expect(r.body.predio).toMatchObject({ fuente: 'rural', etiqueta: 'Predio rural 8_5608775_558576', area_m2: 5000 });
    expect(r.body.predio.poligono.coordinates[0].map((c) => c[0])).toContain(-75.2320);   // sin mover
    const url = new URL(global.fetch.mock.calls.find(([u]) => String(u).includes('/0/query'))[0]);
    expect(url.searchParams.get('where')).toBe("id_dist LIKE '12%'");
  });

  test('con el catastro rural desactivado (por defecto) no se consulta MIDAGRI y sin lote urbano no hay predio', async () => {
    delete process.env.CATASTRO_RURAL;
    try {
      simularPredio({ urbano: null, rural: ruralOk });
      const r = await pedir();
      expect(r.status).toBe(200);
      expect(r.body.predio).toBeNull();
      expect(global.fetch.mock.calls.some(([u]) => String(u).includes('/0/query'))).toBe(false);
    } finally { process.env.CATASTRO_RURAL = 'true'; }
  });

  test('si no hay lote urbano pero el servicio rural falla, avisa con 502', async () => {
    simularPredio({ urbano: null, rural: 'falla' });
    const r = await pedir();
    expect(r.status).toBe(502);
  });

  test('si falla el servicio urbano pero el rural encuentra el predio, lo entrega', async () => {
    simularPredio({ urbano: 'falla', rural: ruralOk });
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(r.body.predio.fuente).toBe('rural');
  });

  test('sin predio en el punto devuelve predio nulo', async () => {
    simularPredio({ urbano: null, rural: null });
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(r.body.predio).toBeNull();
  });

  test('un predio de varias partes no se puede elegir (422)', async () => {
    const otra = CW.map(([x, y]) => [x + 0.01, y]);
    simularPredio({ urbano: { attributes: urbanoOk.attributes, geometry: { rings: [CW, otra] } }, rural: 'cuelga' });
    const r = await pedir();
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/varias partes/);
  });

  test('el servicio rural se consulta con el certificado intermedio de MIDAGRI (su servidor no lo envía) y el urbano no', async () => {
    simularPredio({ urbano: null, rural: ruralOk });
    await pedir();
    const porUrl = (parte) => global.fetch.mock.calls.find(([u]) => String(u).includes(parte))[1];
    expect(porUrl('/0/query').dispatcher).toBeDefined();
    expect(porUrl('/2/query').dispatcher).toBeUndefined();
  });

  test('el certificado intermedio incluido es válido, de DigiCert y no ha vencido (si vence hay que reemplazarlo)', () => {
    const { X509Certificate } = require('crypto');
    const pem = require('fs').readFileSync(require('path').join(__dirname, '../src/config/certs/thawte-tls-rsa-ca-g1.pem'));
    const c = new X509Certificate(pem);
    expect(c.subject).toMatch(/Thawte TLS RSA CA G1/);
    expect(c.issuer).toMatch(/DigiCert Global Root G2/);
    expect(new Date(c.validTo).getTime()).toBeGreaterThan(Date.now());
  });

  test('un hueco dentro del predio se conserva como anillo interior', async () => {
    const hueco = [[-75.2318, -12.0578], [-75.2317, -12.0578], [-75.2317, -12.0577], [-75.2318, -12.0577], [-75.2318, -12.0578]];   // antihorario
    simularPredio({ urbano: { attributes: urbanoOk.attributes, geometry: { rings: [CW, hueco] } }, rural: 'cuelga' });
    const r = await pedir();
    expect(r.body.predio.poligono.coordinates).toHaveLength(2);
    expect(firmada(r.body.predio.poligono.coordinates[1])).toBeLessThan(0);
  });

  test.each([['sin longitud', undefined, '-12.05'], ['fuera de Perú', '10', '-12.05']])('rechaza coordenadas inválidas (%s)', async (_n, lng, lat) => {
    simularPredio({ urbano: urbanoOk, rural: ruralOk });
    const r = await api().get('/api/catastro/predio').query({ lng, lat });
    expect(r.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
