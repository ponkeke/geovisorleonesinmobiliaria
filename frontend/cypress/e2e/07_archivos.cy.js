import { API_URL } from '../support/commands';
// CY-08: eliminación de un archivo subido por el Área Técnica.
describe('Archivos de la visita', () => {
  it('CY-08: el Área Técnica elimina una foto y desaparece de la ficha', () => {
    cy.crearOferta().then(({ ubicacion, idTerreno }) => {
      const nombre = 'foto-prueba.png';
      cy.loginApi('tecnica').then(({ token }) => cy.task('subirFotoPrueba', { token, idTerreno, nombre }));

      cy.visitarComo('tecnica', '/panel');
      cy.seleccionarTerreno(ubicacion);
      cy.get(`button[aria-label="Eliminar ${nombre}"]`, { timeout: 20000 }).should('exist').click();   // Cypress acepta el confirm()

      cy.get(`button[aria-label="Eliminar ${nombre}"]`).should('not.exist');
      cy.loginApi('tecnica').then(({ token }) => {
        cy.request({ url: `${API_URL}/terrenos/${idTerreno}`, headers: { Authorization: `Bearer ${token}` } })
          .its('body.archivos').should('have.length', 0);
      });
    });
  });
});
