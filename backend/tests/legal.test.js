const { api, tokens, limpiar, crearTerreno, auth, cerrar } = require('./helpers');

afterAll(cerrar);

const BASE = { ruta_legal: 'partida registral' };
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(100, 4)]);

describe('Situación legal ampliada (solo informativa)', () => {
  let t;
  beforeAll(async () => { await limpiar(); t = await tokens(); });

  const registrar = (id, body, token = t.legal) =>
    api().post(`/api/terrenos/${id}/situacion-legal`).set(auth(token)).send(body);
  const detalle = async (id) => (await api().get(`/api/terrenos/${id}`).set(auth(t.gerencia))).body;

  test('guarda partida, titularidad, cargas, trámite, documentos y revisión, y el detalle los devuelve con quién los registró', async () => {
    const { id } = await crearTerreno(t.tecnica);
    const r = await registrar(id, {
      ...BASE, numero_partida: ' 11012345 ', oficina_registral: 'Huancayo', titular_registral: 'María Prueba', titular_coincide: true,
      hay_copropietarios: true, requiere_consentimiento_conyuge: true, hay_representante_poder: false,
      cargas: { hipoteca: true, litigio: true }, detalle_cargas: 'Hipoteca a favor de un banco.',
      estado_tramite: 'en trámite', fecha_estado_tramite: '2026-10-20',
      documentos: { partida: true, gravamenes: true }, fecha_revision: '2026-10-21', observaciones: 'Falta la vigencia de poder.',
    });
    expect(r.status).toBe(201);
    expect((await detalle(id)).situacion_legal).toMatchObject({
      ruta_legal: 'partida registral', numero_partida: '11012345', oficina_registral: 'Huancayo', titular_registral: 'María Prueba',
      titular_coincide: true, hay_copropietarios: true, requiere_consentimiento_conyuge: true, hay_representante_poder: false,
      carga_hipoteca: true, carga_embargo: false, carga_litigio: true, carga_servidumbre: false, carga_anotacion_preventiva: false,
      detalle_cargas: 'Hipoteca a favor de un banco.', estado_tramite: 'en trámite',
      doc_partida: true, doc_gravamenes: true, doc_predial: false, doc_parametros: false, doc_catastral: false,
      observaciones: 'Falta la vigencia de poder.', registrado_por_nombre: 'Usuario legal',
    });
  });

  test('los campos nuevos son opcionales y titular_coincide queda en null si no se verificó', async () => {
    const { id } = await crearTerreno(t.tecnica);
    expect((await registrar(id, BASE)).status).toBe(201);
    expect((await detalle(id)).situacion_legal).toMatchObject({
      numero_partida: null, titular_coincide: null, hay_copropietarios: false, carga_hipoteca: false, doc_partida: false,
      estado_tramite: null, fecha_revision: null, observaciones: null,
    });
  });

  test('no cambia el puntaje: sigue saliendo solo de la ruta legal', async () => {
    const { id, area } = await crearTerreno(t.tecnica);
    await api().post(`/api/terrenos/${id}/criterios-tecnicos`).set(auth(t.tecnica)).send({ distancia_via_principal: 100, compatibilidad_normativa: true });
    const cargado = await registrar(id, { ...BASE, cargas: { hipoteca: true, embargo: true, litigio: true }, titular_coincide: false });
    expect(cargado.status).toBe(201);
    const r = await api().post(`/api/terrenos/${id}/informacion-financiera`).set(auth(t.administrativa))
      .send({ precio_ofertado: Math.round(170 * area * 100) / 100, costos_adquisicion: 0 });
    expect(r.body.puntaje.detalle_criterios.puntaje_legal).toBe(100);   // partida registral = 100, aunque haya cargas
  });

  test.each([
    ['estado de trámite fuera de la lista', { estado_tramite: 'Quizás' }],
    ['fecha de trámite inválida', { fecha_estado_tramite: '31/12/2026' }],
    ['fecha de revisión futura', { fecha_revision: '2999-01-01' }],
    ['fecha imposible', { fecha_revision: '2026-02-30' }],
    ['partida demasiado larga', { numero_partida: 'x'.repeat(41) }],
    ['observaciones demasiado largas', { observaciones: 'x'.repeat(1001) }],
    ['detalle de cargas demasiado largo', { detalle_cargas: 'x'.repeat(1001) }],
  ])('rechaza con 400: %s', async (_n, extra) => {
    const { id } = await crearTerreno(t.tecnica);
    expect((await registrar(id, { ...BASE, ...extra })).status).toBe(400);
  });

  test('sigue exigiendo una ruta legal válida y solo el Área Legal puede registrar', async () => {
    const { id } = await crearTerreno(t.tecnica);
    expect((await registrar(id, { ruta_legal: 'invento' })).status).toBe(400);
    expect((await registrar(id, BASE, t.tecnica)).status).toBe(403);
  });
});

describe('Documentos legales (archivos del Área Legal)', () => {
  let t;
  beforeAll(async () => { await limpiar(); t = await tokens(); });

  const subir = (id, token, nombre = 'Copia literal.pdf') => api().post(`/api/terrenos/${id}/archivos`).set(auth(token))
    .set('Content-Type', 'application/octet-stream').set('X-Nombre-Archivo', encodeURIComponent(nombre)).send(PDF);

  test('el Área Legal sube sus documentos (area "legal") y se separan de los técnicos', async () => {
    const { id } = await crearTerreno(t.tecnica);
    const legal = await subir(id, t.legal);
    const tecnico = await subir(id, t.tecnica, 'Informe.pdf');
    expect(legal.status).toBe(201);
    expect(legal.body.archivo).toMatchObject({ area: 'legal', tipo: 'reporte', subido_por_nombre: 'Usuario legal' });
    expect(tecnico.body.archivo.area).toBe('tecnica');
    const archivos = (await api().get(`/api/terrenos/${id}`).set(auth(t.gerencia))).body.archivos;
    expect(archivos.map((a) => a.area).sort()).toEqual(['legal', 'tecnica']);
  });

  test('cada área elimina solo lo suyo', async () => {
    const { id } = await crearTerreno(t.tecnica);
    const legal = (await subir(id, t.legal)).body.archivo;
    const tecnico = (await subir(id, t.tecnica, 'Informe.pdf')).body.archivo;
    expect((await api().delete(`/api/terrenos/${id}/archivos/${legal.id_archivo}`).set(auth(t.tecnica))).status).toBe(403);
    expect((await api().delete(`/api/terrenos/${id}/archivos/${tecnico.id_archivo}`).set(auth(t.legal))).status).toBe(403);
    expect((await api().delete(`/api/terrenos/${id}/archivos/${legal.id_archivo}`).set(auth(t.legal))).status).toBe(204);
    expect((await api().delete(`/api/terrenos/${id}/archivos/${tecnico.id_archivo}`).set(auth(t.tecnica))).status).toBe(204);
  });

  test('el tope de archivos (4 en pruebas) se cuenta por área', async () => {
    const { id } = await crearTerreno(t.tecnica);
    for (let i = 0; i < 4; i++) expect((await subir(id, t.legal, `d${i}.pdf`)).status).toBe(201);
    expect((await subir(id, t.legal, 'd5.pdf')).status).toBe(409);
    expect((await subir(id, t.tecnica, 'tec.pdf')).status).toBe(201);     // el Área Técnica tiene su propio cupo
  });
});
