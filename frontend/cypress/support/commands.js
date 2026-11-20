// Comandos reutilizables de las pruebas E2E del Geovisor.

export const CLAVE = 'leones123';   // clave de los usuarios creados con `yarn seed`
export const USUARIOS = {
  tecnica: 'tecnica@leones.test',
  legal: 'legal@leones.test',
  administrativa: 'administrativa@leones.test',
  gerencia: 'gerencia@leones.test',
};

export const API_URL = 'http://localhost:4000/api';   // backend (se usa para preparar datos de prueba)
const api = (ruta) => `${API_URL}${ruta}`;

// Inicia sesión por la API y devuelve { token, usuario } (rápido: no pasa por la pantalla de login).
Cypress.Commands.add('loginApi', (rol) =>
  cy.request('POST', api('/auth/login'), { correo: USUARIOS[rol], password: CLAVE }).its('body'));

// Abre una ruta de la aplicación ya con la sesión del rol indicado.
Cypress.Commands.add('visitarComo', (rol, ruta = '/panel') => {
  cy.loginApi(rol).then(({ token, usuario }) => {
    cy.visit(ruta, {
      onBeforeLoad(win) {
        win.localStorage.setItem('token', token);
        win.localStorage.setItem('usuario', JSON.stringify(usuario));
      },
    });
  });
});

// Rectángulo GeoJSON de ~ancho x alto metros centrado en [lng, lat].
const rect = ([lng, lat], ancho, alto) => {
  const dx = ancho / 2 / (111320 * Math.cos((lat * Math.PI) / 180));
  const dy = alto / 2 / 110540;
  return { type: 'Polygon', coordinates: [[[lng - dx, lat - dy], [lng + dx, lat - dy], [lng + dx, lat + dy], [lng - dx, lat + dy], [lng - dx, lat - dy]]] };
};

// Crea una oferta real (con su terreno) por la API, en un punto aleatorio del océano para no chocar con
// terrenos ni vías existentes. Devuelve { ubicacion, idTerreno }. El propietario empieza por "Cypress " (se limpia al final).
Cypress.Commands.add('crearOferta', (precio = 100000) => {
  const ubicacion = `Cypress zona ${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const centro = [-83 + Math.random() * 0.5, -12.5 + Math.random() * 0.5];
  return cy.request({
    method: 'POST', url: api('/ofertas'), timeout: 90000,
    body: {
      nombre_propietario: 'Cypress Prueba', contacto: '999111222', ubicacion_referencial: ubicacion,
      precio_ofertado: precio, descripcion: 'Oferta creada por una prueba automatizada.', poligono: rect(centro, 40, 20),
    },
  }).then((r) => {
    expect(r.status).to.eq(201);
    return cy.loginApi('tecnica').then(({ token }) =>
      cy.request({ url: api('/terrenos'), headers: { Authorization: `Bearer ${token}` } })
        .then((lista) => {
          const t = lista.body.find((x) => x.ubicacion_referencial === ubicacion);
          expect(t, 'terreno creado').to.exist;
          return { ubicacion, idTerreno: t.id_terreno };
        }));
  });
});

// Registra por la API los tres criterios (técnico, legal y financiero) para que se calcule el puntaje.
Cypress.Commands.add('completarCriterios', (idTerreno, precio = 100000) => {
  const post = (rol, ruta, body) => cy.loginApi(rol).then(({ token }) =>
    cy.request({ method: 'POST', url: api(`/terrenos/${idTerreno}/${ruta}`), headers: { Authorization: `Bearer ${token}` }, body })
      .then((r) => expect(r.status).to.eq(201)));
  post('tecnica', 'criterios-tecnicos', { distancia_via_principal: 150, compatibilidad_normativa: true });
  post('legal', 'situacion-legal', { ruta_legal: 'partida registral' });
  post('administrativa', 'informacion-financiera', { precio_ofertado: precio, costos_adquisicion: 10000 });
});

// Filtra la lista del panel por una zona y selecciona la tarjeta del terreno.
Cypress.Commands.add('seleccionarTerreno', (ubicacion) => {
  cy.get('.search-box input').clear().type(ubicacion);
  cy.contains('ul.cards li', ubicacion, { timeout: 15000 }).click();
});
