const pool = require('../src/config/db');
const { construirConsulta, cajaConRadio, normalizar } = require('../src/services/overpassService');
const { api, tokens, limpiar, crearTerreno, auth, cerrar } = require('./helpers');

afterAll(cerrar);

// POLIGONO de helpers: lon -80.6..-80.599, lat -5.2..-5.199.
const ok = (elements) => ({ ok: true, status: 200, json: async () => ({ elements }) });
const falla = (status) => ({ ok: false, status, json: async () => ({}) });

const VIA = { type: 'way', id: 11, tags: { highway: 'primary', name: 'Av. Principal' },
  geometry: [{ lat: -5.21, lon: -80.597 }, { lat: -5.19, lon: -80.597 }] };          // ~221.7 m al este
const VIA_LEJANA = { type: 'way', id: 12, tags: { highway: 'secondary', ref: 'PE-1N' },
  geometry: [{ lat: -5.21, lon: -80.591 }, { lat: -5.19, lon: -80.591 }] };          // ~887 m al este
const VIA_LOCAL = { type: 'way', id: 13, tags: { highway: 'residential', name: 'Calle' },
  geometry: [{ lat: -5.21, lon: -80.5991 }, { lat: -5.19, lon: -80.5991 }] };         // no es vía principal
const COLEGIO = { type: 'node', id: 21, lat: -5.1985, lon: -80.5995, tags: { amenity: 'school', name: 'Colegio Norte' } };   // ~55 m al norte
const COLEGIO_DENTRO = { type: 'node', id: 22, lat: -5.1995, lon: -80.5995, tags: { amenity: 'school' } };                  // dentro: 0 m
const COLEGIO_LEJOS = { type: 'node', id: 23, lat: -5.15, lon: -80.6, tags: { amenity: 'school', name: 'Lejano' } };        // ~5.5 km
const UNIVERSIDAD = { type: 'way', id: 31, center: { lat: -5.2, lon: -80.59 }, tags: { amenity: 'university', name: 'Univ. Este' } }; // ~1 km
const INSTITUTO = { type: 'node', id: 32, lat: -5.1980, lon: -80.6, tags: { amenity: 'college', name: 'Instituto' } };       // ~110 m al norte

const TODOS = [VIA, VIA_LEJANA, VIA_LOCAL, COLEGIO, COLEGIO_DENTRO, COLEGIO_LEJOS, UNIVERSIDAD, INSTITUTO];

describe('Overpass: consulta y normalización', () => {
  test('la caja se amplía por el radio en cada lado', () => {
    const [s, w, n, e] = cajaConRadio({ sur: -5.2, oeste: -80.6, norte: -5.199, este: -80.599 }, 2000);
    expect(-5.2 - s).toBeCloseTo(2000 / 110540, 6);
    expect(n - -5.199).toBeCloseTo(2000 / 110540, 6);
    expect(-80.6 - w).toBeCloseTo(2000 / (111320 * Math.cos(5.1995 * Math.PI / 180)), 5);
    expect(e + 80.599).toBeCloseTo(-80.6 - w, 6);
  });

  test('la consulta incluye cada categoría configurada y la caja (no un punto)', () => {
    const q = construirConsulta([-5.22, -80.62, -5.18, -80.58]);
    expect(q).toContain('"highway"~"^(trunk|primary|secondary)$"');
    expect(q).toContain('"amenity"~"^(school)$"');
    expect(q).toContain('"amenity"~"^(university|college)$"');
    expect(q).toContain('(-5.22,-80.62,-5.18,-80.58)');
    expect(q).not.toContain('around');
  });

  test('clasifica por categoría y descarta lo que no coincide', () => {
    expect(normalizar(COLEGIO)).toMatchObject({ id_osm: 'node/21', categoria: 'colegio', nombre: 'Colegio Norte' });
    expect(normalizar(INSTITUTO).categoria).toBe('universidad');
    expect(normalizar(UNIVERSIDAD).geom).toEqual({ type: 'Point', coordinates: [-80.59, -5.2] });
    expect(normalizar(VIA)).toMatchObject({ id_osm: 'way/11', categoria: 'via_principal' });
    expect(normalizar(VIA).geom.type).toBe('LineString');
    expect(normalizar(VIA_LEJANA).nombre).toBe('PE-1N');
    expect(normalizar(VIA_LOCAL)).toBeNull();
    expect(normalizar({ type: 'node', id: 1, lat: 0, lon: 0, tags: { shop: 'bakery' } })).toBeNull();
  });
});

describe('GET /api/terrenos/:id/cercanos (Overpass simulado)', () => {
  let t;
  let id;
  let fetchMock;
  beforeAll(async () => { t = await tokens(); });
  beforeEach(async () => {
    await limpiar();
    ({ id } = await crearTerreno(t.tecnica));
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(ok(TODOS));
  });
  afterEach(() => jest.restoreAllMocks());

  const pedir = (token = t.tecnica, tid = id) => api().get(`/api/terrenos/${tid}/cercanos`).set(auth(token));
  const cat = (body, clave) => body.categorias.find((c) => c.clave === clave).lugares;
  const sinLog = () => jest.spyOn(console, 'error').mockImplementation(() => {});

  test('exige sesión; 404 y 400 para terrenos inválidos', async () => {
    expect((await api().get(`/api/terrenos/${id}/cercanos`)).status).toBe(401);
    expect((await pedir(t.tecnica, 99999)).status).toBe(404);
    expect((await pedir(t.tecnica, 'abc')).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('devuelve por categoría nombre, distancia exacta en metros y coordenadas, ordenado por cercanía', async () => {
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(r.body.fuente).toBe('Datos de OpenStreetMap');
    expect(r.body.error).toBeNull();
    expect(r.body.origen).toBe('overpass');
    expect(r.body.radio_m).toBe(2000);

    const vias = cat(r.body, 'via_principal');
    expect(vias).toHaveLength(2);                                   // la calle residencial no cuenta
    expect(vias[0].nombre).toBe('Av. Principal');
    expect(vias[0].distancia_m).toBeCloseTo(221.7, 0);              // 0.002° de longitud a 5.2° S
    expect(vias[1].distancia_m).toBeGreaterThan(vias[0].distancia_m);
    expect(vias[0].lng).toBeCloseTo(-80.597, 5);

    const colegios = cat(r.body, 'colegio');
    expect(colegios).toHaveLength(2);                               // el lejano queda fuera del radio
    expect(colegios[0].distancia_m).toBe(0);                        // dentro del polígono
    expect(colegios[1]).toMatchObject({ nombre: 'Colegio Norte', lat: -5.1985, lng: -80.5995 });
    expect(colegios[1].distancia_m).toBeCloseTo(55.3, 0);           // 0.0005° de latitud sobre el borde norte
    expect(colegios.find((c) => c.nombre === 'Lejano')).toBeUndefined();

    const unis = cat(r.body, 'universidad');
    expect(unis.map((u) => u.nombre)).toEqual(['Instituto', 'Univ. Este']);
    expect(unis[0].distancia_m).toBeCloseTo(110.6, 0);              // 0.001° de latitud
    expect(unis[1].distancia_m).toBeCloseTo(1000, -2);

    expect(r.body.distancia_via_principal_m).toBe(vias[0].distancia_m);
  });

  test('guarda en puntos_interes sin duplicar por id_osm y reutiliza lo guardado < 7 días', async () => {
    await pedir();
    const { rows: [{ n }] } = await pool.query('SELECT count(*)::int AS n FROM puntos_interes');
    expect(n).toBe(7);                                              // 8 elementos menos la calle local
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const r2 = await pedir();
    expect(r2.body.origen).toBe('cache');
    expect(fetchMock).toHaveBeenCalledTimes(1);                     // no se consultó otra vez
    expect(cat(r2.body, 'colegio')).toHaveLength(2);
  });

  test('pasados 7 días vuelve a consultar, no duplica y actualiza fecha_sincronizacion', async () => {
    await pedir();
    await pool.query(`UPDATE puntos_interes SET fecha_sincronizacion = now() - interval '8 days'`);
    const r = await pedir();
    expect(r.body.origen).toBe('overpass');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const { rows: [{ n, recientes }] } = await pool.query(
      `SELECT count(*)::int AS n,
              count(*) FILTER (WHERE fecha_sincronizacion > now() - interval '1 minute')::int AS recientes
         FROM puntos_interes`);
    expect(n).toBe(7);
    expect(recientes).toBe(7);
  });

  test('la consulta sale del servidor hacia Overpass', async () => {
    await pedir();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(process.env.OVERPASS_URL);
    expect(opts.method).toBe('POST');
    const q = decodeURIComponent(opts.body.replace(/\+/g, ' '));
    expect(q).toMatch(/\(-5\.2\d+,-80\.6\d+,-5\.1\d+,-80\.5\d+\)/);   // caja del polígono + 2000 m
  });

  test('reintenta si Overpass falla una vez y luego responde', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(falla(503)).mockResolvedValue(ok(TODOS));
    const r = await pedir();
    expect(r.body.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(cat(r.body, 'via_principal')).toHaveLength(2);
  });

  test('si Overpass no responde: 200 con el mensaje de error, sin lugares y sin guardar nada', async () => {
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    sinLog();
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(r.body.error).toBe('No se pudo consultar lugares cercanos');
    expect(r.body.distancia_via_principal_m).toBeNull();
    expect(r.body.categorias.every((c) => c.lugares.length === 0)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);                     // 1 intento + 2 reintentos
    const { rows: [{ n }] } = await pool.query('SELECT count(*)::int AS n FROM puntos_interes');
    expect(n).toBe(0);
  });

  test('timeout: aborta la consulta lenta y devuelve el error', async () => {
    fetchMock.mockReset();
    fetchMock.mockImplementation((_u, { signal }) => new Promise((_res, rej) => {
      signal.addEventListener('abort', () => rej(signal.reason));
    }));
    sinLog();
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(r.body.error).toBe('No se pudo consultar lugares cercanos');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('un 4xx no se reintenta', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(falla(400));
    sinLog();
    const r = await pedir();
    expect(r.body.error).toBe('No se pudo consultar lugares cercanos');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('envía User-Agent y Accept y el cuerpo data=<consulta> urlencoded', async () => {
    await pedir();
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(opts.headers['User-Agent']).toMatch(/^GeovisorLeones\/1\.0/);
    expect(opts.headers.Accept).toBe('*/*');
    expect(opts.body.startsWith('data=')).toBe(true);
  });

  test('si el servidor principal falla usa el espejo configurable', async () => {
    process.env.OVERPASS_URL_ALT = 'http://espejo.test/api/interpreter';
    try {
      fetchMock.mockReset();
      fetchMock.mockImplementation(async (url) => (url === process.env.OVERPASS_URL ? falla(406) : ok(TODOS)));
      sinLog();
      const r = await pedir();
      expect(r.body.error).toBeNull();
      expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([process.env.OVERPASS_URL, 'http://espejo.test/api/interpreter']);
    } finally {
      delete process.env.OVERPASS_URL_ALT;
    }
  });

  test('registra el código HTTP y el cuerpo del error', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: false, status: 406, text: async () => 'Not Acceptable', json: async () => ({}) });
    const log = sinLog();
    await pedir();
    expect(log.mock.calls.some((c) => String(c[0]).includes('HTTP 406: Not Acceptable'))).toBe(true);
  });

  test('el fallo no bloquea el flujo: se puede registrar el criterio técnico a mano', async () => {
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error('caído'));
    sinLog();
    await pedir();
    const r = await api().post(`/api/terrenos/${id}/criterios-tecnicos`).set(auth(t.tecnica))
      .send({ distancia_via_principal: 350, compatibilidad_normativa: true });
    expect(r.status).toBe(201);
    expect(r.body.registro.distancia_via_principal).toBe(350);
  });

  test('zona sin vía principal: distancia_via_principal_m es null (sin error)', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(ok([COLEGIO]));
    const r = await pedir();
    expect(r.body.error).toBeNull();
    expect(r.body.distancia_via_principal_m).toBeNull();
    expect(cat(r.body, 'colegio')).toHaveLength(1);
  });
});
