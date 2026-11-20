const { api, tokens, auth, cerrar } = require('./helpers');

afterAll(cerrar);

// El catastro rural está desactivado por defecto; estas pruebas lo activan.
process.env.CATASTRO_RURAL = 'true';

const original = global.fetch;
afterAll(() => { global.fetch = original; });

const LOTE = {
  NRO_MZNA: 'A', NRO_LOTE: 'A1', AREA_GRAFI: '232,63311188', ADJUDICATA: 'JUAN PEREZ QUISPE', AREA_INSCR: 250.5, ID_LOTE: 'LTO-1', ID_PLANO: 'PLN-1',
  ID_DIST: '120114', TIP_USO: 'UL010', DETALLE_US: 'DL000', TIP_CONTIG: 'CT002', DETALLE_CO: 'DC075', TIP_PREDIO: ' ', EDIFICACIO: '1',
  FECH_TRAN: Date.UTC(2005, 5, 1), TIP_FUENTE: 'FG001', CUC: ' ',
};
const SECTOR = { NOM_PUEBLO: 'BASE\nSEGUNDA LINEA', DISTRITO: 'EL TAMBO', TOT_LOTES: 120, TIP_POSESI: 'PO001', TIP_FORMAL: ' ', AREA_GRAFI: 0, AREA_INSCR: 0, ID_HAB_URB: ' ', ID_DIST: '120114' };
const MANZANA = { NRO_MZNA: 'A', SITUACION: 'FL004', AREA_GRAFI: 0 };
const PREDIO_RURAL = {
  cod_predio: '8_1_2', num_predio: '2', hoja: 'H1', area_ha: 0.0998, perimetro: 165.2, origen: 'FOTOGRAMETRICO', datum: 'PSAD56',
  calculo: 'CARTESIANO', observacion: 'Una persona vinculada', cod_proy: '078A', id_dist: '120901', id_plano: null,
};

const respuesta = (...atributos) => ({ ok: true, status: 200, json: async () => ({ features: atributos.filter(Boolean).map((attributes) => ({ attributes })) }) });

// Simula el servicio de COFOPRI: la capa 2 (lotes) y la 3 (pueblos) se distinguen por la URL.
function simular({ lote = LOTE, sector = SECTOR, falla = false, fallaSector = false, calles = [{ NOM_CALLE: 'JR__GONZALES_PRADA' }], rural = {}, contorno } = {}) {
  global.fetch = jest.fn(async (url) => {
    const u = String(url);
    if (u.includes('georural')) {   // MIDAGRI: capa 0 predio, 1 comunidad campesina, 2 comunidad nativa
      const capa = u.match(/MapServer\/(\d)\/query/)[1];
      if (rural === 'falla') return { ok: false, status: 500, json: async () => ({}) };
      return respuesta(rural[capa]);
    }
    if (u.includes('/1/query')) return respuesta(MANZANA);
    if (u.includes('/0/query')) return respuesta(...calles);
    if (String(url).includes('/2/query')) {
      if (falla) return { ok: false, status: 500, json: async () => ({}) };
      if (contorno && lote) return { ok: true, status: 200, json: async () => ({ features: [{ attributes: lote, geometry: { rings: [contorno] } }] }) };
      return respuesta(lote);
    }
    if (String(url).includes('/3/query')) return fallaSector ? { ok: false, status: 500, json: async () => ({}) } : respuesta(sector);
    throw new Error(`URL inesperada ${url}`);
  });
}

const consultar = (token, lng = '-75.2320', lat = '-12.0580') =>
  api().get('/api/catastro/lote').query({ lng, lat }).set(auth(token));

let t;
beforeAll(async () => { t = await tokens(); });

describe('Catastro de COFOPRI: lote bajo un punto del mapa', () => {
  test('exige sesión', async () => {
    simular();
    const r = await api().get('/api/catastro/lote').query({ lng: '-75.23', lat: '-12.05' });
    expect(r.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test.each([
    ['sin longitud', undefined, '-12.05'],
    ['sin latitud', '-75.23', undefined],
    ['texto', 'abc', '-12.05'],
    ['fuera de Perú', '10', '-12.05'],
    ['latitud fuera de Perú', '-75.23', '45'],
  ])('rechaza coordenadas inválidas (%s)', async (_n, lng, lat) => {
    simular();
    const r = await api().get('/api/catastro/lote').query({ lng, lat }).set(auth(t.legal));
    expect(r.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('Técnica, Legal y Gerencia ven el adjudicatario', async () => {
    for (const rol of ['tecnica', 'legal', 'gerencia']) {
      simular();
      const r = await consultar(t[rol]);
      expect(r.status).toBe(200);
      expect(r.body.lote).toMatchObject({ manzana: 'A', numero: 'A1', area_m2: 232.6, adjudicatario: 'JUAN PEREZ QUISPE' });
      expect(r.body.sector).toMatchObject({ nombre: 'BASE', distrito: 'EL TAMBO' });
      expect(global.fetch.mock.calls.some(([u]) => String(u).includes('ADJUDICATA'))).toBe(true);
    }
  });

  test('Administrativa NO recibe el adjudicatario ni se le pide al servicio', async () => {
    for (const rol of ['administrativa']) {
      simular();
      const r = await consultar(t[rol]);
      expect(r.status).toBe(200);
      expect(r.body.lote).toMatchObject({ manzana: 'A', numero: 'A1', area_m2: 232.6 });
      expect(r.body.lote).not.toHaveProperty('adjudicatario');
      expect(r.body.lote).not.toHaveProperty('indicador_adjudicacion');
      expect(JSON.stringify(r.body)).not.toContain('PEREZ');
      expect(global.fetch.mock.calls.some(([u]) => String(u).includes('ADJUDICATA'))).toBe(false);
    }
  });

  test('la consulta devuelve el clic a la posición original (desfase de la capa)', async () => {
    simular();
    await consultar(t.legal, '-75.2320', '-12.0580');
    const url = new URL(global.fetch.mock.calls.find(([u]) => String(u).includes('/2/query'))[0]);
    const [lng, lat] = url.searchParams.get('geometry').split(',').map(Number);
    expect(lng).toBeLessThan(-75.2320);          // la capa se muestra 11,5 m al este: el original está más al oeste
    expect(-75.2320 - lng).toBeCloseTo(11.5 / (111320 * Math.cos((12.058 * Math.PI) / 180)), 6);
    expect(lat).toBeGreaterThan(-12.0580);       // y 1 m al sur: el original está 1 m más al norte
    expect(url.searchParams.get('inSR')).toBe('4326');
    expect(url.searchParams.get('geometryType')).toBe('esriGeometryPoint');
  });

  test('entrega todos los datos del lote, la manzana, el sector y las calles cercanas', async () => {
    simular({ calles: [{ NOM_CALLE: 'JR__GONZALES_PRADA' }, { NOM_CALLE: 'AV_REAL' }, { NOM_CALLE: 'AV_REAL' }] });
    const r = await consultar(t.legal);
    expect(r.body.lote).toMatchObject({
      area_inscrita_m2: 250.5, id_lote: 'LTO-1', plano: 'PLN-1', ubigeo: '120114', tipo_uso: 'UL010', detalle_uso: 'DL000',
      tipo_colindancia: 'CT002', detalle_colindancia: 'DC075', tipo_predio: null, edificacion: '1', fecha_transferencia: '2005-06-01',
      fuente_dato: 'FG001', cuc: null,
    });
    expect(r.body.manzana).toEqual({ numero: 'A', situacion: 'FL004', area_m2: null });
    expect(r.body.sector).toMatchObject({ total_lotes: 120, tipo_posesion: 'PO001', tipo_formalizacion: null, ubigeo: '120114' });
    expect(r.body.calles).toEqual(['JR GONZALES PRADA', 'AV REAL']);
    expect(r.body.rural).toBeNull();
  });

  test('calcula el perímetro y la medida de cada lado a partir del contorno (los tramos alineados forman un lado)', async () => {
    // Rectángulo de 10 m (este-oeste) x 20 m (norte-sur), en sentido horario como lo entrega ArcGIS, con un punto
    // intermedio en el lado este que no debe partirlo en dos.
    const [lng0, lat0] = [-75.2320, -12.0580];
    const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
    const p = (e, n) => [lng0 + e / kx, lat0 + n / 110540];
    simular({ contorno: [p(0, 20), p(10, 20), p(10, 8), p(10, 0), p(0, 0), p(0, 20)] });
    const r = await consultar(t.legal);
    expect(r.status).toBe(200);
    expect(r.body.lote.perimetro_m).toBeCloseTo(60, 1);
    expect(r.body.lote.lados.map((l) => l.orientacion)).toEqual(['Norte', 'Este', 'Sur', 'Oeste']);
    const largos = r.body.lote.lados.map((l) => l.longitud_m);
    [10, 20, 10, 20].forEach((m, i) => expect(largos[i]).toBeCloseTo(m, 1));
    const url = new URL(global.fetch.mock.calls.find(([u]) => String(u).includes('/2/query'))[0]);
    expect(url.searchParams.get('returnGeometry')).toBe('true');
  });

  test('sin contorno el lote se entrega igual, sin medidas', async () => {
    simular();
    const r = await consultar(t.legal);
    expect(r.body.lote.perimetro_m).toBeNull();
    expect(r.body.lote.lados).toEqual([]);
  });

  test('COFOPRI solo publica un indicador (0/1) en ADJUDICATA: se entrega aparte y el nombre queda nulo', async () => {
    simular({ lote: { ...LOTE, ADJUDICATA: '1' } });
    const r = await consultar(t.tecnica);
    expect(r.body.lote.adjudicatario).toBeNull();
    expect(r.body.lote.indicador_adjudicacion).toBe('1');
  });

  test('sin lote urbano entrega el predio rural y las comunidades de MIDAGRI (sin desfase y solo Junín)', async () => {
    simular({
      lote: null, sector: null,
      rural: { 0: PREDIO_RURAL, 1: { nom_comunidad: 'CHUNAN', nom_dist: 'X', estado: ' ' }, 2: { nom_comunidad: 'NATIVA', etnia: 'ASHANINKA', area_titulo: 100.5 } },
    });
    const r = await consultar(t.legal);
    expect(r.status).toBe(200);
    expect(r.body.lote).toBeNull();
    expect(r.body.rural.predio).toMatchObject({
      codigo: '8_1_2', area_ha: 0.0998, perimetro_m: 165.2, origen: 'FOTOGRAMETRICO', datum: 'PSAD56', observacion: 'Una persona vinculada', ubigeo: '120901', plano: null,
    });
    expect(r.body.rural.comunidad_campesina).toMatchObject({ nombre: 'CHUNAN', distrito: 'X', estado: null });
    expect(r.body.rural.comunidad_nativa).toMatchObject({ nombre: 'NATIVA', etnia: 'ASHANINKA', area_titulo_ha: 100.5 });
    const rurales = global.fetch.mock.calls.map(([u]) => String(u)).filter((u) => u.includes('georural'));
    expect(rurales).toHaveLength(3);
    expect(rurales.every((u) => new URL(u).searchParams.get("where") === "id_dist LIKE '12%'")).toBe(true);
    const capa0 = new URL(rurales.find((u) => u.includes('/0/query')));
    expect(Number(capa0.searchParams.get('geometry').split(',')[0])).toBe(-75.2320);   // sin desfase
  });

  test('con lote urbano no se consulta el servicio rural', async () => {
    simular({ rural: { 0: PREDIO_RURAL } });
    await consultar(t.legal);
    expect(global.fetch.mock.calls.some(([u]) => String(u).includes('georural'))).toBe(false);
  });

  test('si no hay lote y el servicio rural falla, igual responde 200 con rural nulo', async () => {
    simular({ lote: null, sector: null, rural: 'falla' });
    const r = await consultar(t.legal);
    expect(r.status).toBe(200);
    expect(r.body.rural).toBeNull();
  });

  test('sin lote en ese punto devuelve lote nulo', async () => {
    simular({ lote: null });
    const r = await consultar(t.legal);
    expect(r.status).toBe(200);
    expect(r.body.lote).toBeNull();
  });

  test('un adjudicatario vacío se devuelve como nulo', async () => {
    simular({ lote: { ...LOTE, ADJUDICATA: ' ' } });
    const r = await consultar(t.gerencia);
    expect(r.body.lote.adjudicatario).toBeNull();
  });

  test.each(['-', '.', '  ', '123'])('un marcador sin letras («%s») no se toma como nombre', async (marcador) => {
    simular({ lote: { ...LOTE, ADJUDICATA: marcador } });
    const r = await consultar(t.legal);
    expect(r.body.lote.adjudicatario).toBeNull();
  });

  test('si falla el servicio de COFOPRI responde 502 sin filtrar detalles', async () => {
    simular({ falla: true });
    const r = await consultar(t.legal);
    expect(r.status).toBe(502);
    expect(r.body.error).toMatch(/catastro/i);
  });

  test('si solo falla la capa de sectores igual entrega el lote', async () => {
    simular({ fallaSector: true });
    const r = await consultar(t.legal);
    expect(r.status).toBe(200);
    expect(r.body.lote.numero).toBe('A1');
    expect(r.body.sector).toBeNull();
  });

  test('un error del servicio dentro del JSON también se trata como falla', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ error: { code: 400, message: 'x' } }) }));
    const r = await consultar(t.legal);
    expect(r.status).toBe(502);
  });
});
