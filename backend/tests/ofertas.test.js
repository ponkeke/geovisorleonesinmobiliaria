const { poligonoNuevo, api, OFERTA, POLIGONO, tokens, limpiar, auth, cerrar } = require('./helpers');

afterAll(cerrar);
beforeAll(limpiar);

describe('POST /api/ofertas (pública, sin token)', () => {
  test('oferta válida con polígono: 201, área calculada por el servidor y terreno creado', async () => {
    const r = await api().post('/api/ofertas').send({ ...OFERTA, area_referencial: 99999999 });
    expect(r.status).toBe(201);
    expect(r.body.id_oferta).toEqual(expect.any(Number));
    // ~110 m x 110 m: el área del cliente se ignora.
    expect(r.body.area).toBeGreaterThan(12000);
    expect(r.body.area).toBeLessThan(12500);

    const t = await tokens();
    const lista = await api().get('/api/terrenos').set(auth(t.gerencia));
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0].geometria.type).toBe('Polygon');
    expect(lista.body[0].area).toBeCloseTo(r.body.area, 2);
    expect(lista.body[0].estado).toBe('en_evaluacion');
  });

  test('sin nombre: 400', async () => {
    const { nombre_propietario, ...sinNombre } = OFERTA;
    const r = await api().post('/api/ofertas').send(sinNombre);
    expect(r.status).toBe(400);
  });

  test('precio negativo: 400', async () => {
    const r = await api().post('/api/ofertas').send({ ...OFERTA, precio_ofertado: -5 });
    expect(r.status).toBe(400);
  });

  test('sin polígono: 400', async () => {
    const { poligono, ...sinPoligono } = OFERTA;
    expect((await api().post('/api/ofertas').send(sinPoligono)).status).toBe(400);
  });

  test('polígono inválido (lados cruzados): 400', async () => {
    const mono = { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]] };
    const r = await api().post('/api/ofertas').send({ ...OFERTA, poligono: mono });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/se cruzan/);
  });

  test.each([
    ['un punto', { type: 'Point', coordinates: [0, 0] }],
    ['anillo sin cerrar', { type: 'Polygon', coordinates: [POLIGONO.coordinates[0].slice(0, 4)] }],
    ['coordenadas fuera de rango', { type: 'Polygon', coordinates: [[[0, 0], [500, 0], [500, 1], [0, 0]]] }],
  ])('polígono inválido (%s): 400', async (_n, poligono) => {
    expect((await api().post('/api/ofertas').send({ ...OFERTA, poligono })).status).toBe(400);
  });

  test('las ofertas rechazadas no dejan terrenos en la BD', async () => {
    const t = await tokens();
    const lista = await api().get('/api/terrenos').set(auth(t.gerencia));
    expect(lista.body).toHaveLength(1);
  });
});

describe('Validación de formato de POST /api/ofertas', () => {
  const enviar = (cambios) => api().post('/api/ofertas').send({ ...OFERTA, poligono: poligonoNuevo(), ...cambios });
  const rechaza = async (cambios, campo, mensaje) => {
    const r = await enviar(cambios);
    expect(r.status).toBe(400);
    expect(r.body.campo).toBe(campo);
    if (mensaje) expect(r.body.error).toMatch(mensaje);
  };

  describe('nombre_propietario', () => {
    test('con números: 400', () => rechaza({ nombre_propietario: 'Juan Perez2' }, 'nombre_propietario', /solo puede contener letras/));
    test('con símbolos: 400', () => rechaza({ nombre_propietario: 'Juan @Pérez' }, 'nombre_propietario', /letras/));
    test('de una sola palabra: 400', () => rechaza({ nombre_propietario: 'Juan' }, 'nombre_propietario', /nombre y apellido/));
    test('solo espacios: 400', () => rechaza({ nombre_propietario: '     ' }, 'nombre_propietario', /obligatorio/));
    test('de menos de 3 caracteres: 400', () => rechaza({ nombre_propietario: 'Al' }, 'nombre_propietario'));
    test('de más de 80 caracteres: 400', () =>
      rechaza({ nombre_propietario: `${'Ana '.repeat(21)}Gómez` }, 'nombre_propietario', /80/));
    test('con HTML: 400', () => rechaza({ nombre_propietario: '<b>Juan</b> Pérez' }, 'nombre_propietario'));
  });

  describe('contacto', () => {
    test('celular de 8 dígitos: 400', () => rechaza({ contacto: '99912345' }, 'contacto', /9 dígitos/));
    test('celular de 10 dígitos: 400', () => rechaza({ contacto: '9991234567' }, 'contacto', /9 dígitos/));
    test('celular que no empieza con 9: 400', () => rechaza({ contacto: '899123456' }, 'contacto', /empezar con 9/));
    test('teléfono con letras: 400', () => rechaza({ contacto: '99912a456' }, 'contacto', /números/));
    test('correo sin dominio: 400', () => rechaza({ contacto: 'juan@' }, 'contacto', /correo válido/));
    test('correo sin extensión: 400', () => rechaza({ contacto: 'juan@dominio' }, 'contacto', /correo válido/));
    test('correo de más de 100 caracteres: 400', () =>
      rechaza({ contacto: `${'a'.repeat(95)}@x.com` }, 'contacto', /100/));
    test('vacío: 400', () => rechaza({ contacto: '  ' }, 'contacto', /obligatorio/));
  });

  describe('precio_ofertado', () => {
    test('0: 400', () => rechaza({ precio_ofertado: 0 }, 'precio_ofertado', /mayor que 0/));
    test('con letras: 400', () => rechaza({ precio_ofertado: '12abc' }, 'precio_ofertado', /número positivo/));
    test('negativo: 400', () => rechaza({ precio_ofertado: -10 }, 'precio_ofertado'));
    test('con 3 decimales: 400', () => rechaza({ precio_ofertado: '100.123' }, 'precio_ofertado', /2 decimales/));
    test('sobre el tope: 400', () => rechaza({ precio_ofertado: 1000000000 }, 'precio_ofertado', /999,999,999/));
    test('vacío: 400', () => rechaza({ precio_ofertado: '' }, 'precio_ofertado', /obligatorio/));
  });

  describe('descripcion', () => {
    test('de más de 500 caracteres: 400', () => rechaza({ descripcion: 'a'.repeat(501) }, 'descripcion', /500/));
    test('con HTML: 400', () => rechaza({ descripcion: 'Hola <script>alert(1)</script>' }, 'descripcion', /< o >/));
  });

  test('el polígono inválido informa el campo "poligono"', () =>
    rechaza({ poligono: { type: 'Point', coordinates: [0, 0] } }, 'poligono'));

  describe('valores válidos se guardan normalizados', () => {
    const detalleDe = async (idOferta) => {
      const t = await tokens();
      const lista = await api().get('/api/terrenos').set(auth(t.gerencia));
      const terreno = lista.body.reduce((a, b) => (b.id_terreno > a.id_terreno ? b : a));
      const d = await api().get(`/api/terrenos/${terreno.id_terreno}`).set(auth(t.gerencia));
      expect(d.body.oferta.id_oferta).toBe(idOferta);
      return d.body.oferta;
    };

    test('nombre con mayúsculas por palabra, celular solo con dígitos, descripción sin espacios', async () => {
      const r = await enviar({
        nombre_propietario: '  juan   PÉREZ  quispe ', contacto: '999-123 456', precio_ofertado: '150000.50',
        descripcion: '   Cerca de la vía   ',
      });
      expect(r.status).toBe(201);
      const o = await detalleDe(r.body.id_oferta);
      expect(o.nombre_propietario).toBe('Juan Pérez Quispe');
      expect(o.contacto).toBe('999123456');
      expect(o.precio_ofertado).toBeCloseTo(150000.5, 2);
      expect(o.descripcion).toBe('Cerca de la vía');
    });

    test('apóstrofe, guion y ñ son válidos; el correo se guarda en minúsculas', async () => {
      const r = await enviar({ nombre_propietario: "o'brien ñuñez-rojas", contacto: 'Juan.Perez@Correo.COM' });
      expect(r.status).toBe(201);
      const o = await detalleDe(r.body.id_oferta);
      expect(o.nombre_propietario).toBe("O'Brien Ñuñez-Rojas");
      expect(o.contacto).toBe('juan.perez@correo.com');
    });

    test('descripción opcional y de exactamente 500 caracteres', async () => {
      const sin = await enviar({ descripcion: undefined });
      expect(sin.status).toBe(201);
      expect((await detalleDe(sin.body.id_oferta)).descripcion).toBeNull();
      const max = await enviar({ descripcion: 'a'.repeat(500) });
      expect(max.status).toBe(201);
    });

    test('precio válido como número y en el tope', async () => {
      expect((await enviar({ precio_ofertado: 0.01 })).status).toBe(201);
      expect((await enviar({ precio_ofertado: 999999999 })).status).toBe(201);
    });
  });
});
