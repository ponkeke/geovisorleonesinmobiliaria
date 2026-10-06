const jwt = require('jsonwebtoken');
const { api, ROLES, PASSWORD, tokens, limpiar, crearTerreno, auth, cerrar } = require('./helpers');

afterAll(cerrar);

describe('POST /api/auth/login', () => {
  test.each(ROLES)('rol %s: 200 y token con su rol', async (rol) => {
    const r = await api().post('/api/auth/login').send({ correo: `${rol}@leones.test`, password: PASSWORD });
    expect(r.status).toBe(200);
    expect(typeof r.body.token).toBe('string');
    expect(r.body.usuario.rol).toBe(rol);
    expect(jwt.verify(r.body.token, process.env.JWT_SECRET).rol).toBe(rol);
    expect(r.body.usuario.password_hash).toBeUndefined();
  });

  test('clave incorrecta: 401', async () => {
    const r = await api().post('/api/auth/login').send({ correo: 'legal@leones.test', password: 'incorrecta' });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('Credenciales inválidas');
  });

  test('usuario inexistente: 401', async () => {
    const r = await api().post('/api/auth/login').send({ correo: 'nadie@leones.test', password: PASSWORD });
    expect(r.status).toBe(401);
  });

  test.each([
    ['sin campos', {}],
    ['sin clave', { correo: 'legal@leones.test' }],
    ['sin correo', { password: PASSWORD }],
    ['cadenas vacías', { correo: '', password: '' }],
  ])('campos vacíos (%s): 400', async (_n, body) => {
    const r = await api().post('/api/auth/login').send(body);
    expect(r.status).toBe(400);
  });
});

describe('Acceso a rutas protegidas', () => {
  let t;
  beforeAll(async () => { await limpiar(); t = await tokens(); });

  test('sin token: 401', async () => {
    expect((await api().get('/api/terrenos')).status).toBe(401);
  });

  test('token inválido: 401', async () => {
    const r = await api().get('/api/terrenos').set(auth('esto.no.es.un.jwt'));
    expect(r.status).toBe(401);
  });

  test('token firmado con otro secreto: 401', async () => {
    const falso = jwt.sign({ id: 1, rol: 'gerencia' }, 'otro-secreto');
    expect((await api().get('/api/terrenos').set(auth(falso))).status).toBe(401);
  });

  test('token válido: 200', async () => {
    expect((await api().get('/api/terrenos').set(auth(t.legal))).status).toBe(200);
  });

  test('rol sin permiso: 403', async () => {
    const { id } = await crearTerreno(t.tecnica);
    const r = await api().post(`/api/terrenos/${id}/criterios-tecnicos`).set(auth(t.legal))
      .send({ distancia_via_principal: 100, compatibilidad_normativa: true });
    expect(r.status).toBe(403);
  });
});
