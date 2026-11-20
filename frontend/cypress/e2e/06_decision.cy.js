import { API_URL } from '../support/commands';
// CY-07: la decisión de Gerencia cierra el terreno.
describe('Decisión de adquisición', () => {
  it('CY-07: Gerencia aprueba un terreno y no puede decidir de nuevo', () => {
    cy.crearOferta().then(({ ubicacion, idTerreno }) => {
      cy.completarCriterios(idTerreno);

      cy.visitarComo('gerencia', '/panel');
      cy.seleccionarTerreno(ubicacion);
      cy.contains('button', 'Registrar decisión de adquisición', { timeout: 20000 }).should('not.be.disabled').click();
      cy.get('.decision-form textarea').type('Aprobado por prueba automatizada.');
      cy.contains('button', 'Aprobar adquisición').click();

      cy.get('.decision-box.aprobado', { timeout: 15000 }).should('contain', 'Aprobado').and('contain', 'Aprobado por prueba automatizada.');

      // Un segundo intento por la API es rechazado: el terreno ya tiene decisión
      cy.loginApi('gerencia').then(({ token }) => {
        cy.request({
          method: 'POST', url: `${API_URL}/terrenos/${idTerreno}/decision`,
          headers: { Authorization: `Bearer ${token}` }, body: { resultado: 'descartado' }, failOnStatusCode: false,
        }).its('status').should('eq', 409);
      });
    });
  });
});
