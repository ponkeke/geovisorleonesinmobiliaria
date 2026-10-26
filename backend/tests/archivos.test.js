const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');
const { api, tokens, limpiar, crearTerreno, auth, cerrar } = require('./helpers');

afterAll(async () => {
  fs.rmSync(process.env.UPLOADS_DIR, { recursive: true, force: true });
  await cerrar();
});

// Cabeceras reales de cada formato (basta con los primeros bytes: así se reconocen).
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 2)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(50, 3)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(100, 4)]);
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(100, 5)]);
const OLE = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(100, 6)]);

describe('Fotos de visita y reportes técnicos', () => {
  let t;
  let id;
  beforeAll(async () => { t = await tokens(); });
  beforeEach(async () => { await limpiar(); ({ id } = await crearTerreno(t.tecnica)); });

  const subir = (cuerpo, nombre, token = t.tecnica, terreno = id) =>
    api().post(`/api/terrenos/${terreno}/archivos`).set(auth(token))
      .set('Content-Type', 'application/octet-stream').set('X-Nombre-Archivo', encodeURIComponent(nombre)).send(cuerpo);

  test('sube una foto y la devuelve en el detalle del terreno, sin exponer la ruta del servidor', async () => {
    const r = await subir(JPG, 'Fachada ñandú.jpg');
    expect(r.status).toBe(201);
    expect(r.body.archivo).toMatchObject({ tipo: 'foto', mime: 'image/jpeg', nombre_original: 'Fachada ñandú.jpg', tamano: JPG.length, subido_por_nombre: 'Usuario tecnica' });
    expect(JSON.stringify(r.body)).not.toContain('ruta');

    const detalle = (await api().get(`/api/terrenos/${id}`).set(auth(t.gerencia))).body;
    expect(detalle.archivos).toHaveLength(1);
    expect(detalle.archivos[0].id_archivo).toBe(r.body.archivo.id_archivo);
    expect(JSON.stringify(detalle.archivos)).not.toContain('ruta');
  });

  test.each([
    ['foto PNG', PNG, 'a.png', 'foto', 'image/png'],
    ['foto WebP', WEBP, 'a.webp', 'foto', 'image/webp'],
    ['reporte PDF', PDF, 'informe.pdf', 'reporte', 'application/pdf'],
    ['reporte Word moderno', ZIP, 'informe.docx', 'reporte', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['reporte Excel moderno', ZIP, 'medidas.xlsx', 'reporte', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['reporte Word antiguo', OLE, 'informe.doc', 'reporte', 'application/msword'],
    ['reporte Excel antiguo', OLE, 'medidas.xls', 'reporte', 'application/vnd.ms-excel'],
  ])('acepta %s', async (_n, cuerpo, nombre, tipo, mime) => {
    const r = await subir(cuerpo, nombre);
    expect(r.status).toBe(201);
    expect(r.body.archivo).toMatchObject({ tipo, mime });
  });

  test('el tipo lo decide el contenido, no el nombre: un ejecutable o texto "disfrazado" se rechaza', async () => {
    expect((await subir(Buffer.from('MZ\x90\x00 programa'), 'foto.jpg')).status).toBe(400);
    expect((await subir(Buffer.from('<script>alert(1)</script>'), 'foto.png')).status).toBe(400);
    expect((await subir(ZIP, 'macro.zip')).status).toBe(400);          // ZIP genérico
    expect((await subir(OLE, 'informe.pdf')).status).toBe(400);        // contenedor OLE con extensión que no corresponde
    expect((await subir(JPG, 'foto.exe')).status).toBe(201);           // el contenido ES un JPEG: se guarda como .jpg
  });

  test('un archivo vacío o sin cuerpo se rechaza', async () => {
    expect((await subir(Buffer.alloc(0), 'a.jpg')).status).toBe(400);
  });

  test('respeta el tamaño máximo por tipo (foto 1 MB, reporte 2 MB en pruebas)', async () => {
    const fotoGrande = Buffer.concat([JPG, Buffer.alloc(1024 * 1024)]);
    const r = await subir(fotoGrande, 'grande.jpg');
    expect(r.status).toBe(413);
    expect(r.body.error).toMatch(/máximo de 1 MB/);
    const reporteMediano = Buffer.concat([PDF, Buffer.alloc(1.5 * 1024 * 1024)]);
    expect((await subir(reporteMediano, 'mediano.pdf')).status).toBe(201);   // 1,5 MB < 2 MB
  });

  test('respeta el máximo de archivos por terreno', async () => {
    for (let i = 0; i < 4; i++) expect((await subir(JPG, `f${i}.jpg`)).status).toBe(201);
    const r = await subir(JPG, 'f5.jpg');
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/máximo de 4 archivos/);
  });

  test('el nombre se limpia: sin carpetas ni caracteres peligrosos', async () => {
    const r = await subir(JPG, '../../etc/passwd<>:"|?*.jpg');
    expect(r.status).toBe(201);
    expect(r.body.archivo.nombre_original).toBe('passwd.jpg');
    const fila = (await pool.query('SELECT ruta FROM archivos_tecnicos')).rows[0];
    expect(fila.ruta).toMatch(/^\d+[\\/][0-9a-f-]{36}\.jpg$/);          // nombre generado por el servidor
    expect(fs.existsSync(path.join(process.env.UPLOADS_DIR, fila.ruta))).toBe(true);
  });

  test('suben Técnica, Legal y Administrativa; Gerencia recibe 403 y sin sesión 401', async () => {
    for (const rol of ['gerencia']) expect((await subir(JPG, 'a.jpg', t[rol])).status).toBe(403);
    expect((await api().post(`/api/terrenos/${id}/archivos`).set('Content-Type', 'application/octet-stream').send(JPG)).status).toBe(401);
  });

  test('terreno inexistente o inválido; terreno con decisión registrada ya no admite archivos', async () => {
    expect((await subir(JPG, 'a.jpg', t.tecnica, 99999)).status).toBe(404);
    expect((await subir(JPG, 'a.jpg', t.tecnica, 'abc')).status).toBe(400);
    await pool.query("UPDATE terrenos_candidatos SET estado = 'aprobado' WHERE id_terreno = $1", [id]);
    expect((await subir(JPG, 'a.jpg')).status).toBe(409);
  });

  describe('descarga y eliminación', () => {
    let archivo;
    beforeEach(async () => { archivo = (await subir(PDF, 'Informe técnico.pdf')).body.archivo; });
    const url = (a = archivo.id_archivo, terreno = id) => `/api/terrenos/${terreno}/archivos/${a}`;

    test('cualquier rol con sesión lo descarga, con cabeceras seguras y el contenido intacto', async () => {
      for (const rol of ['tecnica', 'legal', 'administrativa', 'gerencia']) {
        const r = await api().get(url()).set(auth(t[rol])).buffer(true).parse((res, cb) => {
          const partes = []; res.on('data', (d) => partes.push(d)); res.on('end', () => cb(null, Buffer.concat(partes)));
        });
        expect(r.status).toBe(200);
        expect(r.headers['content-type']).toMatch(/application\/pdf/);
        expect(r.headers['x-content-type-options']).toBe('nosniff');
        expect(r.headers['content-security-policy']).toContain("default-src 'none'");
        expect(r.headers['content-disposition']).toContain("filename*=UTF-8''Informe%20t%C3%A9cnico.pdf");
        expect(Buffer.compare(r.body, PDF)).toBe(0);
      }
    });

    test('sin sesión no se descarga; un archivo de otro terreno o inexistente da 404', async () => {
      expect((await api().get(url())).status).toBe(401);
      const otro = await crearTerreno(t.tecnica);
      expect((await api().get(url(archivo.id_archivo, otro.id)).set(auth(t.legal))).status).toBe(404);
      expect((await api().get(url(99999)).set(auth(t.legal))).status).toBe(404);
      expect((await api().get(url('abc')).set(auth(t.legal))).status).toBe(400);
    });

    test('los documentos Word/Excel se descargan como adjunto (no se abren en el navegador)', async () => {
      const doc = (await subir(ZIP, 'informe.docx')).body.archivo;
      const r = await api().get(url(doc.id_archivo)).set(auth(t.legal));
      expect(r.headers['content-disposition']).toMatch(/^attachment/);
    });

    test('solo el Área Técnica elimina; borra la fila y el archivo del disco', async () => {
      const { ruta } = (await pool.query('SELECT ruta FROM archivos_tecnicos WHERE id_archivo = $1', [archivo.id_archivo])).rows[0];
      const disco = path.join(process.env.UPLOADS_DIR, ruta);
      expect(fs.existsSync(disco)).toBe(true);

      expect((await api().delete(url()).set(auth(t.legal))).status).toBe(403);          // otra área: no borra lo técnico
      expect((await api().delete(url()).set(auth(t.gerencia))).status).toBe(403);
      expect((await api().delete(url()).set(auth(t.tecnica))).status).toBe(204);
      expect(fs.existsSync(disco)).toBe(false);
      expect((await api().get(url()).set(auth(t.tecnica))).status).toBe(404);
      expect((await api().delete(url()).set(auth(t.tecnica))).status).toBe(404);
    });
  });
});
