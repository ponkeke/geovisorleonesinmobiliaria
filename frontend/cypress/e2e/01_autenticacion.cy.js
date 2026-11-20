// CY-01 y CY-02: acceso y autenticación de usuarios internos.
import { USUARIOS, CLAVE } from '../support/commands';

describe('Autenticación', () => {
  beforeEach(() => { cy.clearLocalStorage(); });

  it('CY-01: un usuario válido inicia sesión y llega al panel', () => {
    cy.visit('/login');
    cy.get('input[type="email"]').type(USUARIOS.tecnica);
    cy.get('input[placeholder="••••••••"]').type(CLAVE);
    cy.contains('button', 'Ingresar').click();

    cy.location('pathname', { timeout: 20000 }).should('eq', '/panel');
    cy.contains('h1', 'Candidatos').should('be.visible');
    cy.window().its('localStorage.token').should('be.a', 'string').and('not.be.empty');
    cy.window().then((w) => expect(JSON.parse(w.localStorage.usuario).rol).to.eq('tecnica'));
  });

  it('CY-02: credenciales incorrectas muestran un error y no dan acceso', () => {
    cy.visit('/login');
    cy.get('input[type="email"]').type(USUARIOS.tecnica);
    cy.get('input[placeholder="••••••••"]').type('clave-incorrecta');
    cy.contains('button', 'Ingresar').click();

    cy.get('p.error[role="alert"]', { timeout: 20000 }).should('contain', 'Credenciales inválidas');
    cy.location('pathname').should('eq', '/login');
    cy.window().its('localStorage.token').should('not.exist');
  });
});
