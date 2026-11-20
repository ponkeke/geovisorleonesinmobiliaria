// CY-03: protección de rutas y navegación entre módulos.
describe('Navegación', () => {
  beforeEach(() => { cy.clearLocalStorage(); });

  it('CY-03a: /panel sin sesión redirige al inicio de sesión', () => {
    cy.visit('/panel');
    cy.location('pathname').should('eq', '/login');
    cy.contains('h1', 'Bienvenido de nuevo').should('be.visible');
  });

  it('CY-03b: navegación entre inicio, formulario público y login', () => {
    cy.visit('/');
    cy.contains('a', 'Ofrecer un terreno').click();
    cy.location('pathname').should('eq', '/ofrecer');
    cy.contains('h1', 'Datos generales').should('be.visible');

    cy.contains('a', 'Salir del formulario').click();
    cy.location('pathname').should('eq', '/');

    cy.contains('a', 'Iniciar sesión').click();
    cy.location('pathname').should('eq', '/login');
  });

  it('CY-03c: con sesión, el panel es accesible y se puede cerrar sesión', () => {
    cy.visitarComo('gerencia', '/panel');
    cy.location('pathname').should('eq', '/panel');
    cy.contains('h1', 'Candidatos').should('be.visible');

    cy.get('button[aria-label="Cerrar sesión"]').click();
    cy.location('pathname', { timeout: 20000 }).should('eq', '/login');
    cy.window().its('localStorage.token').should('not.exist');
  });
});
