const { api, tokens, limpiar, crearTerreno, auth, cerrar } = require('./helpers');

afterAll(cerrar);

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(100, 4)]);

describe('Información financiera ampliada (desglose de costos, observaciones, documentos)', () => {
  let t;
  beforeAll(async () => { await limpiar(); t = await tokens(); });

  const registrar = (id, body, token = t.administrativa) =>
    api().post(`/api/terrenos/${id}/informacion-financiera`).set(auth(token)).send(body);
  const detalle = async (id) => (await api().get(`/api/terrenos/${id}`).set(auth(t.gerencia))).body;

  test('el total de costos es la suma del desglose y el detalle devuelve cada concepto, quién lo registró y la referencia', async () => {
    const { id } = await crearTerreno(t.tecnica);
    const r = await registrar(id, {
      precio_ofertado: 150000,
      desglose_costos: { notaria: 1200.5, registral: '800', impuestos: 4500, tasacion: 600, saneamiento: 0, comision: 3000, otros: '' },
      observaciones: '  Proforma de notaría adjunta. ', fecha_revision: '2026-10-22',
    });
    expect(r.status).toBe(201);
    expect(Number(r.body.registro.costos_adquisicion)).toBeCloseTo(10100.5, 2);

    const d = await detalle(id);
    expect(d.referencia_precio_m2).toBe(170);
    expect(d.informacion_financiera).toMatchObject({
      costo_notaria: 1200.5, costo_registral: 800, costo_impuestos: 4500, costo_tasacion: 600,
      costo_saneamiento: 0, costo_comision: 3000, costo_otros: 0, costos_adquisicion: 10100.5,
      observaciones: 'Proforma de notaría adjunta.', registrado_por_nombre: 'Usuario administrativa',
    });
    expect(String(d.informacion_financiera.fecha_revision)).toContain('2026-10-22');
  });

  test('el registro simple de antes (solo precio y costos_adquisicion) sigue funcionando', async () => {
    const { id } = await crearTerreno(t.tecnica);
    expect((await registrar(id, { precio_ofertado: 100000, costos_adquisicion: 2500 })).status).toBe(201);
    expect((await detalle(id)).informacion_financiera).toMatchObject({ costos_adquisicion: 2500, costo_notaria: 0, observaciones: null, fecha_revision: null });
    const otro = await crearTerreno(t.tecnica);
    expect((await registrar(otro.id, { precio_ofertado: 100000 })).status).toBe(201);   // sin costos: 0
  });

  test('el puntaje usa el total del desglose (precio + costos) frente a la referencia', async () => {
    const { id, area } = await crearTerreno(t.tecnica);
    await api().post(`/api/terrenos/${id}/criterios-tecnicos`).set(auth(t.tecnica)).send({ distancia_via_principal: 100, compatibilidad_normativa: true });
    await api().post(`/api/terrenos/${id}/situacion-legal`).set(auth(t.legal)).send({ ruta_legal: 'partida registral' });
    // precio = referencia y costos = 0.5·referencia·área repartidos en dos conceptos -> costo total por m² = 1.5·referencia -> 50 puntos.
    const costos = Math.round(0.5 * 170 * area * 100) / 100;
    const r = await registrar(id, { precio_ofertado: Math.round(170 * area * 100) / 100, desglose_costos: { notaria: costos / 2, otros: costos / 2 } });
    expect(r.body.puntaje.detalle_criterios.puntaje_financiero).toBeCloseTo(50, 0);
  });

  test.each([
    ['costo negativo', { desglose_costos: { notaria: -1 } }],
    ['costo no numérico', { desglose_costos: { tasacion: 'mucho' } }],
    ['costo gigante', { desglose_costos: { otros: 1e15 } }],
    ['fecha de revisión futura', { fecha_revision: '2999-01-01' }],
    ['fecha inválida', { fecha_revision: '22/10/2026' }],
    ['observaciones demasiado largas', { observaciones: 'x'.repeat(1001) }],
    ['precio negativo', { precio_ofertado: -5 }],
  ])('rechaza con 400: %s', async (_n, extra) => {
    const { id } = await crearTerreno(t.tecnica);
    expect((await registrar(id, { precio_ofertado: 100000, ...extra })).status).toBe(400);
  });

  test('solo el Área Administrativa registra', async () => {
    const { id } = await crearTerreno(t.tecnica);
    for (const rol of ['tecnica', 'legal', 'gerencia']) expect((await registrar(id, { precio_ofertado: 1 }, t[rol])).status).toBe(403);
  });

  test('el Área Administrativa sube y elimina sus documentos (area "administrativa"), separados de los demás', async () => {
    const { id } = await crearTerreno(t.tecnica);
    const subir = (token) => api().post(`/api/terrenos/${id}/archivos`).set(auth(token))
      .set('Content-Type', 'application/octet-stream').set('X-Nombre-Archivo', encodeURIComponent('Proforma.pdf')).send(PDF);
    const admin = await subir(t.administrativa);
    const tecnico = await subir(t.tecnica);
    expect(admin.status).toBe(201);
    expect(admin.body.archivo).toMatchObject({ area: 'administrativa', tipo: 'reporte', subido_por_nombre: 'Usuario administrativa' });
    expect((await subir(t.gerencia)).status).toBe(403);
    expect((await api().delete(`/api/terrenos/${id}/archivos/${admin.body.archivo.id_archivo}`).set(auth(t.tecnica))).status).toBe(403);
    expect((await api().delete(`/api/terrenos/${id}/archivos/${tecnico.body.archivo.id_archivo}`).set(auth(t.administrativa))).status).toBe(403);
    expect((await api().delete(`/api/terrenos/${id}/archivos/${admin.body.archivo.id_archivo}`).set(auth(t.administrativa))).status).toBe(204);
  });
});
